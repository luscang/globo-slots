'use server'

import { criarClienteServidor } from '../supabase/cliente-servidor'
import { obterSessao } from '../sessao-servidor'
import { podeConsultarRegional, temPerfil } from '../dominio/perfis'
import { podeComprarRegional } from '../dominio/elegibilidade-regional'
import { clienteNaCarteiraDoExecutivo } from '../dominio/carteira-executivo'
import { resolverNomeDoExecutivoLogado } from '../dados/carteira-executivo'
import { obterPrograma } from '../dados/programas'
import { carregarDisponibilidade } from '../dados/disponibilidade'
import { PRACAS } from '../dominio/regional'
import { aplicarAcrescimo } from '../dominio/datas-especiais'
import { calcularCustoDaAcaoRegional, type PrecoDaPracaParaCalculo } from '../dominio/custo-da-acao-regional'
import {
  validarConsulta,
  type ConsultaEmMontagem,
} from '../dominio/consulta'
import type { DiaDeDisponibilidade } from '../dominio/disponibilidade'

/**
 * `gravarConsulta` — o ÚLTIMO portão antes do banco.
 *
 * Tudo que a tela validou é conveniência. O que vale de verdade roda aqui:
 * sessão presente, perfil autoriza a modalidade pedida, cliente é elegível
 * quando a modalidade é regional, as praças pedidas são re-derivadas contra o
 * que o servidor calculou (nunca o que o navegador mandou), o preço do
 * retrato é recalculado sobre o que foi efetivamente comprado, e os dois
 * inserts (`consultas` + `consulta_itens`) viram uma função de banco — uma
 * transação de verdade, não dois `.insert()` separados que podem divergir.
 */

const ERRO_SESSAO_EXPIRADA = 'Sessão expirada. Entre de novo.'
const ERRO_SEM_PERMISSAO_REGIONAL = 'Você não tem permissão para consultar disponibilidade regional.'
const ERRO_CLIENTE_NAO_ELEGIVEL_REGIONAL = 'Este cliente não é elegível para ações regionais.'
const ERRO_PROGRAMA = 'Programa não encontrado.'
const ERRO_CLIENTE = 'Cliente não encontrado.'
const ERRO_GRAVACAO = 'Não foi possível gravar a consulta. Tente novamente.'

type LinhaDeCliente = {
  id: string
  nome: string
  setor: string | null
  industria: string | null
  apto_regional: boolean
  executivo_linear_360: string | null
  executivo_digital: string | null
}

type ItemAgrupado = { quantidade: number; pracas: Set<string> }

type LinhaParaGravar = {
  data: string
  quantidade: number
  pracas: string[]
  valor_unitario: number | null
  valor_total: number
  periodo_especial_nome: string | null
  periodo_especial_percentual: number | null
}

/** Duas casas decimais — dinheiro não carrega resto de ponto flutuante. Mesma convenção do domínio (`consulta.ts`, `custo-da-acao-regional.ts`). */
function arredondar(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

function anoMesDeData(dataIso: string): { ano: number; mes: number } {
  const [ano, mes] = dataIso.split('-').map(Number)
  return { ano, mes }
}

/**
 * Todos os meses distintos que os itens da consulta tocam — normalmente um
 * só, mas o executivo pode ter navegado entre meses do calendário antes de
 * fechar a consulta, e cada um precisa da própria carga.
 */
function mesesDistintosDosItens(itens: ConsultaEmMontagem['itens']): { ano: number; mes: number }[] {
  const chaves = new Map<string, { ano: number; mes: number }>()
  for (const item of itens) {
    const { ano, mes } = anoMesDeData(item.data)
    chaves.set(`${ano}-${mes}`, { ano, mes })
  }
  return [...chaves.values()]
}

/** Itens agrupados por data — a tabela tem `unique (consulta_id, data)`, e a tela pode ter mandado mais de um item para a mesma data. */
function agruparItensPorData(itens: ConsultaEmMontagem['itens']): Map<string, ItemAgrupado> {
  const itensPorData = new Map<string, ItemAgrupado>()
  for (const item of itens) {
    const acumulado = itensPorData.get(item.data) ?? { quantidade: 0, pracas: new Set<string>() }
    acumulado.quantidade += item.quantidade
    for (const praca of item.pracas) acumulado.pracas.add(praca)
    itensPorData.set(item.data, acumulado)
  }
  return itensPorData
}

/**
 * Re-deriva as praças pedidas contra o que o servidor acabou de calcular —
 * NUNCA confia em `item.pracas` como veio do navegador. `validarConsulta`
 * (domínio, congelado) só confere a QUANTIDADE de praças por item; nada ali
 * compara os códigos pedidos contra `PracaNoDia.disponivel`. Sem esta
 * checagem, um executivo com o perfil certo pode pedir uma praça já vendida
 * (ou um código inexistente) e a gravação aceitaria, porque `quantidade` e
 * `length` continuam dentro do limite.
 *
 * Nacional nunca tem praça — pedir uma é sinal de payload forjado ou de bug
 * na tela, e os dois merecem erro, não descarte silencioso.
 */
function validarPracasContraServidor(
  itensPorData: Map<string, ItemAgrupado>,
  dias: DiaDeDisponibilidade[],
  modalidade: ConsultaEmMontagem['modalidade'],
): string[] {
  const erros: string[] = []
  const porData = new Map(dias.map((dia) => [dia.data, dia]))

  for (const [data, agrupado] of itensPorData) {
    if (agrupado.pracas.size === 0) continue

    if (modalidade === 'nacional') {
      erros.push(`A data ${data} não aceita praças na modalidade nacional.`)
      continue
    }

    const dia = porData.get(data)
    // `validarConsulta` já recusou datas cujo `estado !== 'disponivel'` antes
    // desta função ser chamada, então na prática `dia.pracas` sempre tem as 5
    // praças aqui — mas a checagem fica explícita, com mensagem que diz o que
    // de fato aconteceu, em vez de reaproveitar "já está vendida" para um caso
    // que não é venda nenhuma.
    if (!dia || dia.pracas.length === 0) {
      erros.push(`A data ${data} não tem praças regionais disponíveis.`)
      continue
    }
    for (const praca of agrupado.pracas) {
      if (!PRACAS.includes(praca as (typeof PRACAS)[number])) {
        erros.push(`Praça desconhecida: ${praca}.`)
        continue
      }
      const pracaNoDia = dia.pracas.find((p) => p.praca_codigo === praca)
      if (!pracaNoDia || !pracaNoDia.disponivel) {
        erros.push(`A praça ${praca} já está vendida na data ${data}.`)
      }
    }
  }

  return erros
}

/**
 * Preço do retrato de uma data regional: mídia + direitos das praças
 * EFETIVAMENTE compradas, mais a produção do programa — nunca
 * `dia.valor_unitario`, que é o preço de levar TODAS as praças livres
 * daquele dia (correto para pintar a célula do calendário; errado para
 * gravar quanto o cliente vai pagar). O acréscimo do período especial, se
 * houver, incide sobre a mídia de cada praça, igual ao motor
 * (`disponibilidade.ts`).
 */
function calcularValorUnitarioRegional(
  pracasCompradas: string[],
  precosRegionais: PrecoDaPracaParaCalculo[],
  custoProducaoRegional: number | null,
  percentualAcrescimo: number,
): number {
  const precos =
    percentualAcrescimo > 0
      ? precosRegionais.map((preco) => ({
          ...preco,
          custo_midia_tv: aplicarAcrescimo(preco.custo_midia_tv, percentualAcrescimo),
        }))
      : precosRegionais

  return calcularCustoDaAcaoRegional(pracasCompradas, precos, custoProducaoRegional)
}

/** Avisos de retrato: datas selecionadas cuja concorrência não pôde ser conferida (R14) por anunciante não classificado. */
function montarAvisos(
  itens: ConsultaEmMontagem['itens'],
  dias: DiaDeDisponibilidade[],
): { data: string; acoes_sem_classificacao: number }[] {
  const porData = new Map(dias.map((dia) => [dia.data, dia]))
  const avisos: { data: string; acoes_sem_classificacao: number }[] = []
  for (const item of itens) {
    const dia = porData.get(item.data)
    if (dia && dia.acoes_sem_classificacao > 0) {
      avisos.push({ data: item.data, acoes_sem_classificacao: dia.acoes_sem_classificacao })
    }
  }
  return avisos
}

export async function gravarConsulta(
  consulta: ConsultaEmMontagem,
): Promise<{ id: string | null; erros: string[] }> {
  // 1. Sem sessão, nada acontece.
  const sessao = await obterSessao()
  if (!sessao) return { id: null, erros: [ERRO_SESSAO_EXPIRADA] }

  // 2. Regional exige o perfil — esconder o botão na tela é conveniência,
  // isto é a proteção real (junto com o RLS de `consultas`/`consulta_itens`).
  if (consulta.modalidade === 'regional' && !podeConsultarRegional(sessao.perfis)) {
    return { id: null, erros: [ERRO_SEM_PERMISSAO_REGIONAL] }
  }

  if (!consulta.clienteId || !consulta.programaId) {
    return { id: null, erros: validarConsulta(consulta, [], 0, 0, 0) }
  }

  const programa = await obterPrograma(consulta.programaId)
  if (!programa) return { id: null, erros: [ERRO_PROGRAMA] }

  const supabase = await criarClienteServidor()

  const { data: clienteLinha, error: erroCliente } = await supabase
    .from('clientes')
    .select('id, nome, setor, industria, apto_regional, executivo_linear_360, executivo_digital')
    .eq('id', consulta.clienteId)
    .maybeSingle()

  if (erroCliente) {
    console.error('Falha ao carregar cliente para gravação da consulta:', erroCliente.message)
    return { id: null, erros: [ERRO_GRAVACAO] }
  }
  const cliente = clienteLinha as LinhaDeCliente | null
  if (!cliente) return { id: null, erros: [ERRO_CLIENTE] }

  // 2a. Carteira Siscom: executivo só grava consulta para cliente da própria
  // carteira. Proprietário e PO do produto administram tudo, sem esse filtro.
  // A busca de cliente na tela já esconde quem está fora da carteira — isto
  // é a proteção real, para quem tentar gravar um `clienteId` de fora dela.
  const semRestricaoDeCarteira =
    temPerfil(sessao.perfis, 'proprietario') || temPerfil(sessao.perfis, 'consultor_programa')
  if (!semRestricaoDeCarteira) {
    const nomeDoExecutivo = await resolverNomeDoExecutivoLogado(sessao.email)
    if (!clienteNaCarteiraDoExecutivo(cliente, nomeDoExecutivo)) {
      return { id: null, erros: [ERRO_CLIENTE] }
    }
  }

  // 2b. O segundo portão forjável: perfil autoriza a MODALIDADE, mas nada
  // até aqui checou se ESTE cliente pode comprar regional. A tela só oferece
  // a modalidade quando o cliente é `apto_regional` — esconder é conveniência,
  // esta checagem é a proteção real, ao lado da de perfil.
  if (consulta.modalidade === 'regional' && !podeComprarRegional(cliente)) {
    return { id: null, erros: [ERRO_CLIENTE_NAO_ELEGIVEL_REGIONAL] }
  }

  // 3. Recarrega a disponibilidade NO SERVIDOR, um mês por vez (nunca uma
  // consulta por célula), e revalida a consulta de novo sobre os dias
  // recém-calculados. O que o navegador mandou não é confiável.
  const meses = mesesDistintosDosItens(consulta.itens)
  const cargas = await Promise.all(
    meses.map((am) =>
      carregarDisponibilidade({
        programaId: consulta.programaId!,
        clienteId: consulta.clienteId!,
        modalidade: consulta.modalidade,
        ano: am.ano,
        mes: am.mes,
      }),
    ),
  )

  const cargaComErro = cargas.find((carga) => carga.erro !== null)
  if (cargaComErro) return { id: null, erros: [cargaComErro.erro!] }

  const dias = cargas.flatMap((carga) => carga.dias)
  // `precosRegionais` não varia por mês (é do programa, não da data) — as
  // cargas concordam entre si; a primeira serve para todas.
  const precosRegionais = cargas[0]?.precosRegionais ?? []

  const errosDeConsulta = validarConsulta(
    consulta,
    dias,
    programa.acoes_minimas,
    programa.acoes_maximas,
    programa.max_pracas_por_acao,
  )
  if (errosDeConsulta.length > 0) return { id: null, erros: errosDeConsulta }

  const itensPorData = agruparItensPorData(consulta.itens)

  // Segundo portão: as praças pedidas, re-derivadas contra o que o servidor
  // calculou agora — não o que a tela mandou.
  const errosDePraca = validarPracasContraServidor(itensPorData, dias, consulta.modalidade)
  if (errosDePraca.length > 0) return { id: null, erros: errosDePraca }

  // 4. Monta o retrato de cada data: preço recalculado sobre o que foi
  // EFETIVAMENTE comprado (regional) ou o preço plano do dia (nacional, que
  // não varia por quantidade nem por praça — não existe praça no nacional).
  const porData = new Map(dias.map((dia) => [dia.data, dia]))

  const linhas: LinhaParaGravar[] = [...itensPorData.entries()].map(([data, agrupado]) => {
    const dia = porData.get(data)
    const pracas = [...agrupado.pracas]

    const valorUnitario =
      consulta.modalidade === 'regional'
        ? calcularValorUnitarioRegional(
            pracas,
            precosRegionais,
            programa.custo_producao_regional,
            dia?.periodo_especial?.percentual ?? 0,
          )
        : (dia?.valor_unitario ?? null)

    return {
      data,
      quantidade: agrupado.quantidade,
      pracas,
      valor_unitario: valorUnitario,
      valor_total: valorUnitario !== null ? arredondar(valorUnitario * agrupado.quantidade) : 0,
      periodo_especial_nome: dia?.periodo_especial?.nome ?? null,
      periodo_especial_percentual: dia?.periodo_especial?.percentual ?? null,
    }
  })

  const valorTotal = arredondar(linhas.reduce((total, linha) => total + linha.valor_total, 0))
  const avisos = montarAvisos(consulta.itens, dias)

  // 5. Grava o retrato — `consultas` e `consulta_itens` juntos, numa função
  // de banco que roda como UMA transação (`gravar_consulta`,
  // `supabase/schema-entrega-3.sql`). Dois `.insert()` separados por HTTP
  // não são atômicos: se o segundo falhasse depois do primeiro vingar,
  // ficaria uma consulta órfã, sem item e sem policy de `delete` para
  // limpá-la.
  const { data: idGravado, error: erroGravacao } = await supabase.rpc('gravar_consulta', {
    p_usuario_id: sessao.usuarioId,
    p_cliente_id: cliente.id,
    p_cliente_nome: cliente.nome,
    p_cliente_setor: cliente.setor,
    p_cliente_industria: cliente.industria,
    p_programa_id: programa.id,
    p_programa_nome: programa.nome,
    p_modalidade: consulta.modalidade,
    p_valor_total: valorTotal,
    p_avisos: avisos,
    p_itens: linhas,
  })

  if (erroGravacao || !idGravado) {
    console.error('Falha ao gravar consulta:', erroGravacao?.message)
    return { id: null, erros: [ERRO_GRAVACAO] }
  }

  return { id: idGravado as string, erros: [] }
}

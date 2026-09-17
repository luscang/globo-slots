import { criarClienteServidor } from '../supabase/cliente-servidor'
import { obterPrograma, listarApelidos } from './programas'
import { listarDatasBloqueadas } from './datas-bloqueadas'
import { listarDatasEspeciais } from './datas-especiais'
import { listarAcoesRegionais, listarPrecos, type PrecoDePraca } from './regional'
import { lerPaginado } from './paginacao'
import { montarMapa, ocupaSlot } from '../dominio/formatos'
import { indexarAnunciantes, type ClienteClassificado } from '../dominio/casamento-anunciante'
import {
  acoesRegionaisDistintasNoMes,
  calcularDisponibilidadeDoMes,
  diasDoMes,
  type DiaDeDisponibilidade,
  type InsumosDeDisponibilidade,
  type Modalidade,
  type ProgramaParaDisponibilidade,
} from '../dominio/disponibilidade'
import type { Programa } from '../dominio/cadastro'
import { encontrarProgramaId, montarIndice } from '../dominio/programas'
import { normalizarNome } from '../dominio/texto'
import { regionalConsomeSlotNacional } from '../dominio/regional'

/**
 * `carregarDisponibilidade` — ponto canônico de leitura do calendário.
 * A camada de dados também resolve a identidade efetiva Marca → Anunciante
 * antes de entregar as vendas ao motor puro.
 */

export type ResultadoDeDisponibilidade = {
  dias: DiaDeDisponibilidade[]
  programa: Programa | null
  erro: string | null
  precosRegionais: PrecoDePraca[]
  /** Limite do anunciante no programa/mês; zero = sem teto. */
  limiteMensal: number
  /**
   * Quantas ações já contam para o teto mensal do programa/mês. No nacional,
   * é por anunciante; no regional, são as ações regionais distintas
   * (data + cliente) do PROGRAMA inteiro nesse mês — R16, contagem
   * compartilhada entre todos os clientes, como o campo Bloqueio mensal
   * regional já documenta.
   */
  acoesDoAnuncianteNoMes: number
}

type LinhaDeCliente = {
  id: string
  nome: string
  setor: string | null
  industria: string | null
}

type ClienteDaCarteira = ClienteClassificado & { id: string }

type LinhaDeAcaoVendida = {
  numero_da_entrega: string
  programa: string
  data_de_exibicao: string
  formato: string | null
  anunciante: string | null
  marca: string | null
}

type LinhaDeFormato = { formato: string; categoria: string }

type AliasDoTake = {
  id: string
  nome_normalizado: string
  cliente_id: string | null
}

type MarcaDoTake = {
  id: string
  nome_normalizado: string
}

type RelacaoMarcaAnunciante = {
  anunciante_take_id: string
  marca_id: string
  cliente_id_override: string | null
}

function paraProgramaDeDisponibilidade(programa: Programa): ProgramaParaDisponibilidade {
  return {
    id: programa.id,
    mnemonico: programa.mnemonico,
    dias_da_semana: programa.dias_da_semana,
    slots: programa.slots,
    bloqueio_mensal: programa.bloqueio_mensal,
    prazo_minimo_dias: programa.prazo_minimo_dias,
    custo_midia_tv: programa.custo_midia_tv,
    custo_producao_tv: programa.custo_producao_tv,
    percentual_simulcast: programa.percentual_simulcast,
    aceita_regional: programa.aceita_regional,
    dia_da_semana_regional: programa.dia_da_semana_regional,
    prazo_minimo_regional_dias: programa.prazo_minimo_regional_dias,
    max_pracas_por_acao: programa.max_pracas_por_acao,
    custo_producao_regional: programa.custo_producao_regional,
    bloqueio_mensal_regional: programa.bloqueio_mensal_regional ?? 0,
  }
}

const ERRO_PROGRAMA = 'Programa não encontrado.'
const ERRO_CLIENTE = 'Cliente não encontrado.'
const ERRO_CARREGAMENTO = 'Não foi possível carregar a disponibilidade. Tente novamente.'

function vazio(erro: string): ResultadoDeDisponibilidade {
  return {
    dias: [],
    programa: null,
    erro,
    precosRegionais: [],
    limiteMensal: 0,
    acoesDoAnuncianteNoMes: 0,
  }
}

export async function carregarDisponibilidade(params: {
  programaId: string
  clienteId: string
  modalidade: Modalidade
  ano: number
  mes: number
}): Promise<ResultadoDeDisponibilidade> {
  const { programaId, clienteId, modalidade, ano, mes } = params

  const programa = await obterPrograma(programaId)
  if (!programa) return vazio(ERRO_PROGRAMA)

  const supabase = await criarClienteServidor()
  const dias = diasDoMes(ano, mes)
  const primeiroDia = dias[0]
  const ultimoDia = dias[dias.length - 1]

  const [
    respostaCliente,
    leituraAcoesVendidas,
    respostaFormatos,
    bloqueios,
    periodosEspeciais,
    acoesRegionais,
    precosRegionais,
    apelidos,
    leituraDeCarteira,
  ] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nome, setor, industria')
      .eq('id', clienteId)
      .maybeSingle(),
    lerPaginado<LinhaDeAcaoVendida>((de, ate) =>
      supabase
        .from('acoes_vendidas')
        .select('numero_da_entrega, programa, data_de_exibicao, formato, anunciante, marca')
        .gte('data_de_exibicao', primeiroDia)
        .lte('data_de_exibicao', ultimoDia)
        .range(de, ate),
    ),
    supabase.from('formatos').select('formato, categoria'),
    listarDatasBloqueadas(programaId),
    listarDatasEspeciais(programaId),
    listarAcoesRegionais(programaId, primeiroDia, ultimoDia),
    listarPrecos(programaId),
    listarApelidos(programaId),
    lerPaginado<ClienteDaCarteira>((de, ate) =>
      supabase.from('clientes').select('id, nome, setor, industria').range(de, ate),
    ),
  ])

  if (respostaCliente.error) {
    console.error('Falha ao carregar cliente da consulta:', respostaCliente.error.message)
    return vazio(ERRO_CARREGAMENTO)
  }
  const cliente = respostaCliente.data as LinhaDeCliente | null
  if (!cliente) return vazio(ERRO_CLIENTE)

  if (leituraAcoesVendidas.erro) {
    console.error('Falha ao carregar ações vendidas do mês:', leituraAcoesVendidas.erro)
    return vazio(ERRO_CARREGAMENTO)
  }
  if (respostaFormatos.error) {
    console.error('Falha ao carregar formatos:', respostaFormatos.error.message)
    return vazio(ERRO_CARREGAMENTO)
  }
  if (leituraDeCarteira.erro) {
    console.error('Falha ao carregar a carteira de clientes:', leituraDeCarteira.erro)
    return vazio(ERRO_CARREGAMENTO)
  }

  const acoesVendidas = leituraAcoesVendidas.linhas
  const formatosLinhas = (respostaFormatos.data ?? []) as LinhaDeFormato[]
  const mapaFormatos = montarMapa(formatosLinhas)
  const carteira = leituraDeCarteira.linhas
  const clientePorId = new Map(carteira.map((item) => [item.id, item]))

  // -----------------------------------------------------------------------
  // Resolve o PAR anunciante + marca do Take. Um override manual do par
  // vence o cliente padrão do alias (caso PAGBANK/PORTO SEGURO).
  // -----------------------------------------------------------------------
  const nomesNormalizados = [
    ...new Set(acoesVendidas.map((acao) => normalizarNome(acao.anunciante)).filter(Boolean)),
  ]
  const marcasNormalizadas = [
    ...new Set(acoesVendidas.map((acao) => normalizarNome(acao.marca)).filter(Boolean)),
  ]

  const [aliases, marcas] = await Promise.all([
    nomesNormalizados.length
      ? supabase
          .from('anunciantes_take')
          .select('id, nome_normalizado, cliente_id')
          .in('nome_normalizado', nomesNormalizados)
      : Promise.resolve({ data: [], error: null }),
    marcasNormalizadas.length
      ? supabase
          .from('marcas')
          .select('id, nome_normalizado')
          .in('nome_normalizado', marcasNormalizadas)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (aliases.error || marcas.error) {
    console.error('Falha ao resolver aliases/marcas do Globo Take.')
    return vazio(ERRO_CARREGAMENTO)
  }

  const aliasPorNome = new Map<string, AliasDoTake>(
    ((aliases.data ?? []) as AliasDoTake[]).map((item) => [item.nome_normalizado, item]),
  )
  const marcaPorNome = new Map<string, MarcaDoTake>(
    ((marcas.data ?? []) as MarcaDoTake[]).map((item) => [item.nome_normalizado, item]),
  )

  const aliasIds = [...new Set([...aliasPorNome.values()].map((item) => item.id))]
  const marcaIds = [...new Set([...marcaPorNome.values()].map((item) => item.id))]
  const relacoes = aliasIds.length > 0 && marcaIds.length > 0
    ? await supabase
        .from('anunciante_take_marcas')
        .select('anunciante_take_id, marca_id, cliente_id_override')
        .in('anunciante_take_id', aliasIds)
        .in('marca_id', marcaIds)
    : { data: [], error: null }

  if (relacoes.error) {
    console.error('Falha ao aplicar correções Marca → Anunciante.')
    return vazio(ERRO_CARREGAMENTO)
  }

  const overridePorPar = new Map<string, string>()
  for (const relacao of (relacoes.data ?? []) as RelacaoMarcaAnunciante[]) {
    if (relacao.cliente_id_override) {
      overridePorPar.set(
        `${relacao.anunciante_take_id}|${relacao.marca_id}`,
        relacao.cliente_id_override,
      )
    }
  }

  function clienteEfetivoDaAcao(acao: LinhaDeAcaoVendida): string | null {
    const alias = aliasPorNome.get(normalizarNome(acao.anunciante))
    if (!alias) return null
    const marca = marcaPorNome.get(normalizarNome(acao.marca))
    const override = marca ? overridePorPar.get(`${alias.id}|${marca.id}`) : undefined
    return override ?? alias.cliente_id ?? null
  }

  const acoesResolvidas = acoesVendidas.map((acao) => {
    const clienteEfetivoId = clienteEfetivoDaAcao(acao)
    const clienteEfetivo = clienteEfetivoId ? clientePorId.get(clienteEfetivoId) ?? null : null
    return { acao, clienteEfetivoId, clienteEfetivo }
  })

  // O motor canônico continua recebendo todas as vendas para calcular slots,
  // mas o nome usado na concorrência já é o anunciante oficial efetivo.
  const acoesParaOMotor = acoesResolvidas.map(({ acao, clienteEfetivo }) => ({
    programa: acao.programa,
    data_de_exibicao: acao.data_de_exibicao,
    formato: acao.formato ?? '',
    anunciante: clienteEfetivo?.nome ?? acao.anunciante,
  }))

  const indicePrograma = montarIndice(
    [{ id: programa.id, mnemonico: programa.mnemonico }],
    apelidos.map((apelido) => ({ programa_id: programa.id, texto: apelido.texto })),
  )

  const acoesDoProgramaQueOcupam = acoesResolvidas.filter(
    ({ acao }) =>
      encontrarProgramaId(acao.programa, indicePrograma) === programa.id &&
      ocupaSlot(acao.formato ?? '', mapaFormatos),
  )

  const datasJaCompradasPeloCliente = new Set<string>()
  let acoesDoAnuncianteNoMes = 0
  for (const item of acoesDoProgramaQueOcupam) {
    if (item.clienteEfetivoId !== cliente.id) continue
    datasJaCompradasPeloCliente.add(item.acao.data_de_exibicao)
    acoesDoAnuncianteNoMes += 1
  }

  // Ação regional consome um slot nacional conforme a regra vigente. Para o
  // limite mensal do anunciante, várias praças do mesmo cliente na mesma data
  // contam como UMA ação.
  if (modalidade === 'nacional' && regionalConsomeSlotNacional()) {
    const clienteNormalizado = normalizarNome(cliente.nome)
    const datasRegionaisDoCliente = new Set(
      acoesRegionais
        .filter((acao) => normalizarNome(acao.cliente_nome) === clienteNormalizado)
        .map((acao) => acao.data_de_exibicao),
    )
    for (const data of datasRegionaisDoCliente) {
      if (!datasJaCompradasPeloCliente.has(data)) acoesDoAnuncianteNoMes += 1
      datasJaCompradasPeloCliente.add(data)
    }
  }

  const limiteMensal = modalidade === 'nacional'
    ? Math.max(0, Math.floor(programa.bloqueio_mensal ?? 0))
    : Math.max(0, Math.floor(programa.bloqueio_mensal_regional ?? 0))

  const insumos: InsumosDeDisponibilidade = {
    ano,
    mes,
    hojeIso: new Date().toISOString().slice(0, 10),
    modalidade,
    programa: paraProgramaDeDisponibilidade(programa),
    cliente: { nome: cliente.nome, setor: cliente.setor, industria: cliente.industria },
    formatos: mapaFormatos,
    acoesVendidas: acoesParaOMotor,
    acoesRegionais,
    bloqueios,
    periodosEspeciais,
    indiceDeAnunciantes: indexarAnunciantes(carteira),
    precosRegionais,
    apelidosDoPrograma: apelidos.map((apelido) => apelido.texto),
    ...(modalidade === 'nacional'
      ? {
          datasJaCompradasPeloCliente: [...datasJaCompradasPeloCliente],
          acoesDoClienteNoMes: acoesDoAnuncianteNoMes,
        }
      : {}),
  }

  const acoesRegionaisNoMes =
    modalidade === 'regional' ? acoesRegionaisDistintasNoMes(acoesRegionais, new Set(dias)) : 0

  return {
    dias: calcularDisponibilidadeDoMes(insumos),
    programa,
    erro: null,
    precosRegionais,
    limiteMensal,
    acoesDoAnuncianteNoMes: modalidade === 'nacional' ? acoesDoAnuncianteNoMes : acoesRegionaisNoMes,
  }
}

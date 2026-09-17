import { type AcaoVendida } from './ocupacao'
import { ocupaSlot, normalizarFormato, type MapaDeFormatos } from './formatos'
import { estaBloqueada, dentroDoPrazoMinimo, type DataBloqueada } from './bloqueios'
import { concorrenteNaData, type Anunciante } from './restricoes'
import { periodoEspecialEm, aplicarAcrescimo, type PeriodoEspecial } from './datas-especiais'
import { feriadoEm } from './feriados'
import { classificarAnunciante, type IndiceDeAnunciantes } from './casamento-anunciante'
import { calcularCustoDaAcaoNacional } from './custo-da-acao-nacional'
import { calcularCustoDaAcaoRegional, type PrecoDaPracaParaCalculo } from './custo-da-acao-regional'
import { PRACAS, temSlotRegionalEm, regionalConsomeSlotNacional, type AcaoRegional } from './regional'
import { extrairMnemonico } from './programas'
import { normalizarNome } from './texto'

/**
 * O MOTOR. Único lugar do sistema que sabe em que ORDEM as regras se aplicam.
 *
 * É pura: sem banco, sem tela, sem `Date.now()`. `hojeIso` entra por
 * parâmetro — é o que torna o prazo mínimo testável.
 */

export type EstadoDoDia =
  | 'sem_exibicao'
  | 'fora_do_prazo'
  | 'bloqueado'
  | 'concorrencia'
  | 'ja_comprado'
  | 'limite_mensal'
  | 'esgotado'
  | 'disponivel'

export type Modalidade = 'nacional' | 'regional'

export type PracaNoDia = {
  praca_codigo: string
  disponivel: boolean
  cliente_nome: string | null
}

export type DiaDeDisponibilidade = {
  data: string
  estado: EstadoDoDia
  /** Slots livres no nacional; praças livres no regional. */
  livres: number
  /** Slots do dia no nacional; 5 praças no regional. `0` em dia sem exibição. */
  total: number
  /** TODOS os motivos válidos para a data. */
  motivos: string[]
  /** Ilustração pura — nunca entra em `motivos`, nunca altera `estado`. */
  feriado: string | null
  /** Vazio no nacional. */
  pracas: PracaNoDia[]
  valor_unitario: number | null
  periodo_especial: { nome: string; percentual: number } | null
  /** Ações vendidas na data cujo anunciante não casou com a carteira. */
  acoes_sem_classificacao: number
}

/** O que o motor precisa saber do programa — não o cadastro inteiro. */
export type ProgramaParaDisponibilidade = {
  id: string
  mnemonico: string
  dias_da_semana: number[]
  slots: number
  bloqueio_mensal: number
  prazo_minimo_dias: number
  custo_midia_tv: number | null
  custo_producao_tv: number | null
  percentual_simulcast: number | null
  aceita_regional: boolean
  dia_da_semana_regional: number | null
  prazo_minimo_regional_dias: number | null
  max_pracas_por_acao: number
  custo_producao_regional: number | null
  bloqueio_mensal_regional: number
}

export type AcaoVendidaComAnunciante = AcaoVendida & { anunciante: string | null }

export type InsumosDeDisponibilidade = {
  ano: number
  /** 1 = janeiro … 12 = dezembro. */
  mes: number
  hojeIso: string
  modalidade: Modalidade
  programa: ProgramaParaDisponibilidade
  cliente: Anunciante
  formatos: MapaDeFormatos
  acoesVendidas: AcaoVendidaComAnunciante[]
  acoesRegionais: AcaoRegional[]
  bloqueios: DataBloqueada[]
  periodosEspeciais: PeriodoEspecial[]
  indiceDeAnunciantes: IndiceDeAnunciantes
  precosRegionais: PrecoDaPracaParaCalculo[]
  /**
   * R6 — programas que chegam sem mnemônico dependem de apelido cadastrado.
   */
  apelidosDoPrograma?: string[]
  /**
   * Fatos já resolvidos pela camada de dados usando a identidade efetiva
   * Marca → Anunciante. Quando presentes, ativam as regras por anunciante:
   * uma data já comprada ganha estado próprio e o teto mensal deixa de ser
   * calculado pelo total do programa.
   */
  datasJaCompradasPeloCliente?: string[]
  acoesDoClienteNoMes?: number
}

const UM_DIA_MS = 24 * 60 * 60 * 1000

/** Todos os dias do mês, em ISO. `mes` é 1-based, como as pessoas contam. */
export function diasDoMes(ano: number, mes: number): string[] {
  const dias: string[] = []
  let cursor = Date.UTC(ano, mes - 1, 1)
  while (new Date(cursor).getUTCMonth() === mes - 1) {
    dias.push(new Date(cursor).toISOString().slice(0, 10))
    cursor += UM_DIA_MS
  }
  return dias
}

function diaDaSemana(dataIso: string): number {
  return new Date(`${dataIso}T00:00:00Z`).getUTCDay()
}

/** Ações vendidas deste programa, por mnemônico ou apelido. */
function acoesDoPrograma(
  acoes: AcaoVendidaComAnunciante[],
  programa: ProgramaParaDisponibilidade,
  apelidos: string[] = [],
): AcaoVendidaComAnunciante[] {
  const mnemonicoAlvo = normalizarFormato(programa.mnemonico)
  const apelidosAlvo = new Set(apelidos.map((apelido) => normalizarFormato(apelido)))

  return acoes.filter((acao) => {
    const mnemonico = extrairMnemonico(acao.programa)
    if (mnemonico !== null && mnemonico === mnemonicoAlvo) return true
    return apelidosAlvo.has(normalizarFormato(acao.programa))
  })
}

/** Ações regionais distintas (data + cliente) do mês. */
export function acoesRegionaisDistintasNoMes(acoesRegionais: AcaoRegional[], doMes: Set<string>): number {
  const distintas = new Set(
    acoesRegionais
      .filter((acao) => doMes.has(acao.data_de_exibicao))
      .map((acao) => `${acao.data_de_exibicao}|${acao.cliente_nome}`),
  )
  return distintas.size
}

/**
 * R16 — contagem mensal. No nacional, quando a camada de dados já resolveu
 * `acoesDoClienteNoMes`, esse valor é a fonte da regra de negócio: o teto é
 * do anunciante naquele programa e mês. O cálculo legado pelo total do
 * programa permanece como fallback para os chamadores antigos e para a
 * modalidade regional, até a regra regional ser revisada separadamente.
 */
function acoesNoMes(insumos: InsumosDeDisponibilidade, dias: string[]): number {
  const doMes = new Set(dias)

  if (insumos.modalidade === 'nacional' && insumos.acoesDoClienteNoMes !== undefined) {
    return Math.max(0, Math.floor(insumos.acoesDoClienteNoMes))
  }

  if (insumos.modalidade === 'regional') {
    return acoesRegionaisDistintasNoMes(insumos.acoesRegionais, doMes)
  }

  const vendidas = acoesDoPrograma(
    insumos.acoesVendidas,
    insumos.programa,
    insumos.apelidosDoPrograma,
  ).filter((acao) => doMes.has(acao.data_de_exibicao) && ocupaSlot(acao.formato, insumos.formatos)).length

  const regionais = regionalConsomeSlotNacional()
    ? acoesRegionaisDistintasNoMes(insumos.acoesRegionais, doMes)
    : 0

  return vendidas + regionais
}

export function calcularDisponibilidadeDoMes(
  insumos: InsumosDeDisponibilidade,
): DiaDeDisponibilidade[] {
  const dias = diasDoMes(insumos.ano, insumos.mes)
  const regional = insumos.modalidade === 'regional'
  const programa = insumos.programa
  const doPrograma = acoesDoPrograma(insumos.acoesVendidas, programa, insumos.apelidosDoPrograma)
  const datasJaCompradas = new Set(insumos.datasJaCompradasPeloCliente ?? [])
  const usaRegrasPorAnunciante =
    !regional &&
    (insumos.acoesDoClienteNoMes !== undefined || insumos.datasJaCompradasPeloCliente !== undefined)

  const prazo = regional
    ? (programa.prazo_minimo_regional_dias ?? 0)
    : programa.prazo_minimo_dias

  const tetoMensal = regional ? programa.bloqueio_mensal_regional : programa.bloqueio_mensal
  const mesFechado = tetoMensal > 0 && acoesNoMes(insumos, dias) >= tetoMensal

  return dias.map((data) => {
    const feriado = feriadoEm(data)?.nome ?? null
    const motivos: string[] = []

    const temInventario = regional
      ? temSlotRegionalEm(
          {
            aceita_regional: programa.aceita_regional,
            dia_da_semana_regional: programa.dia_da_semana_regional,
            max_pracas_por_acao: programa.max_pracas_por_acao,
          },
          data,
        )
      : programa.dias_da_semana.includes(diaDaSemana(data))

    if (!temInventario) {
      return {
        data,
        estado: 'sem_exibicao',
        livres: 0,
        total: 0,
        motivos: [],
        feriado,
        pracas: [],
        valor_unitario: null,
        periodo_especial: null,
        acoes_sem_classificacao: 0,
      }
    }

    const vendidasNaData = doPrograma.filter((acao) => acao.data_de_exibicao === data)
    const regionaisNaData = insumos.acoesRegionais.filter((acao) => acao.data_de_exibicao === data)

    const porPraca = new Map(regionaisNaData.map((acao) => [acao.praca_codigo, acao.cliente_nome]))
    // R8 (revista) — uma praça já vendida a OUTRO cliente bloqueia a data
    // inteira; ao próprio cliente da consulta, só a(s) praça(s) que ele já tem.
    const clienteAtual = normalizarNome(insumos.cliente.nome)
    const vendidaAOutroCliente = regionaisNaData.some(
      (acao) => normalizarNome(acao.cliente_nome) !== clienteAtual,
    )
    const pracas: PracaNoDia[] = regional
      ? PRACAS.map((praca) => ({
          praca_codigo: praca,
          disponivel: !porPraca.has(praca) && !vendidaAOutroCliente,
          cliente_nome: porPraca.get(praca) ?? null,
        }))
      : []

    const usadosNacional =
      vendidasNaData.filter((acao) => ocupaSlot(acao.formato, insumos.formatos)).length +
      (regionalConsomeSlotNacional()
        ? new Set(regionaisNaData.map((acao) => acao.cliente_nome)).size
        : 0)

    const total = regional ? PRACAS.length : programa.slots
    const livres = regional
      ? pracas.filter((praca) => praca.disponivel).length
      : Math.max(0, programa.slots - usadosNacional)

    const periodo = periodoEspecialEm(insumos.periodosEspeciais, data)
    const acrescimo = periodo?.percentual_acrescimo ?? 0
    const periodo_especial = periodo ? { nome: periodo.nome, percentual: acrescimo } : null

    const valor_unitario = regional
      ? calcularCustoDaAcaoRegional(
          pracas.filter((praca) => praca.disponivel).map((praca) => praca.praca_codigo),
          acrescimo > 0
            ? insumos.precosRegionais.map((preco) => ({
                ...preco,
                custo_midia_tv: aplicarAcrescimo(preco.custo_midia_tv, acrescimo),
              }))
            : insumos.precosRegionais,
          programa.custo_producao_regional,
        )
      : calcularCustoDaAcaoNacional(
          {
            custo_midia_tv: programa.custo_midia_tv,
            custo_producao_tv: programa.custo_producao_tv,
            percentual_simulcast: programa.percentual_simulcast,
          },
          acrescimo,
        )

    const classificadas = vendidasNaData.map((acao) => ({
      acao,
      cliente: classificarAnunciante(acao.anunciante, insumos.indiceDeAnunciantes),
    }))
    const acoes_sem_classificacao = classificadas.filter((linha) => linha.cliente === null).length

    const concorrente = concorrenteNaData(
      classificadas
        .filter((linha) => linha.cliente !== null)
        .map((linha) => ({
          anunciante: linha.cliente!.nome,
          setor: linha.cliente!.setor,
          industria: linha.cliente!.industria,
        })),
      insumos.cliente,
    )

    const foraDoPrazo = dentroDoPrazoMinimo(insumos.hojeIso, data, prazo)
    if (foraDoPrazo) {
      motivos.push(`Fora do prazo mínimo de ${prazo} dias para este programa.`)
    }

    const bloqueio = estaBloqueada(insumos.bloqueios, data)
    if (bloqueio) motivos.push(bloqueio.motivo)

    if (mesFechado) {
      motivos.push(
        usaRegrasPorAnunciante
          ? `O anunciante atingiu o limite de ${tetoMensal} ações neste programa neste mês.`
          : `O mês já atingiu o limite de ${tetoMensal} ações deste programa.`,
      )
    }

    if (concorrente) {
      motivos.push(
        `${concorrente.anunciante} já tem ação nesta data, na mesma categoria do cliente.`,
      )
    }

    const proprioAnuncianteNaData = usaRegrasPorAnunciante && datasJaCompradas.has(data)
    if (proprioAnuncianteNaData) {
      motivos.push('Este anunciante já possui uma ação nesta data.')
    }

    if (livres === 0) motivos.push('Todos os espaços desta data já foram vendidos.')

    let estado: EstadoDoDia

    if (usaRegrasPorAnunciante) {
      // Regra validada com o negócio: concorrente real continua vermelho;
      // compra do próprio anunciante ganha ✓ azul, inclusive em data passada;
      // o teto mensal só bloqueia novas datas disponíveis daquele mês.
      estado = bloqueio
        ? 'bloqueado'
        : concorrente
          ? 'concorrencia'
          : proprioAnuncianteNaData
            ? 'ja_comprado'
            : foraDoPrazo
              ? 'fora_do_prazo'
              : mesFechado
                ? 'limite_mensal'
                : livres === 0
                  ? 'esgotado'
                  : 'disponivel'
    } else {
      // Ordem histórica preservada para os chamadores legados e regional.
      estado = foraDoPrazo
        ? 'fora_do_prazo'
        : bloqueio || mesFechado
          ? 'bloqueado'
          : concorrente
            ? 'concorrencia'
            : livres === 0
              ? 'esgotado'
              : 'disponivel'
    }

    return {
      data,
      estado,
      livres,
      total,
      motivos,
      feriado,
      pracas,
      valor_unitario,
      periodo_especial,
      acoes_sem_classificacao,
    }
  })
}

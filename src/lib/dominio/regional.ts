import { estaBloqueada, type DataBloqueada } from './bloqueios'
import { normalizarNome } from './texto'

/** As 5 Globos, na ordem em que aparecem na interface. */
export const PRACAS = ['SP', 'RJ', 'BH', 'DF', 'PE1'] as const

export type AcaoRegional = {
  data_de_exibicao: string
  praca_codigo: string
  cliente_nome: string
}

export type ConfiguracaoRegional = {
  aceita_regional: boolean
  dia_da_semana_regional: number | null
  max_pracas_por_acao: number
}

function diaDaSemana(dataIso: string): number {
  return new Date(`${dataIso}T00:00:00Z`).getUTCDay()
}

/**
 * R10 — o slot regional só existe no dia da semana do programa: sextas no
 * Encontro, sábados no É de Casa. Fora dele não há "esgotado", simplesmente
 * não existe ação regional.
 */
export function temSlotRegionalEm(config: ConfiguracaoRegional, dataIso: string): boolean {
  if (!config.aceita_regional) return false
  if (config.dia_da_semana_regional === null) return false
  return diaDaSemana(dataIso) === config.dia_da_semana_regional
}

export function pracasOcupadasEm(acoes: AcaoRegional[], dataIso: string): string[] {
  return acoes.filter((a) => a.data_de_exibicao === dataIso).map((a) => a.praca_codigo)
}

/**
 * R8 (revista) — a data regional é exclusiva de quem primeiro vender ali: uma
 * vez vendida qualquer praça a um cliente, as demais praças da mesma data
 * ficam indisponíveis para QUALQUER OUTRO cliente. O próprio cliente que já
 * comprou pode continuar comprando praças adicionais na mesma data, até o
 * teto de `max_pracas_por_acao` (R9).
 *
 * Sem `clienteNome` (tela ainda não sabe quem está comprando), o comportamento
 * é o mais conservador: qualquer praça já ocupada bloqueia a data inteira.
 */
export function pracasLivresEm(
  config: ConfiguracaoRegional,
  acoes: AcaoRegional[],
  dataIso: string,
  clienteNome?: string,
): string[] {
  if (!temSlotRegionalEm(config, dataIso)) return []
  const ocupacoes = acoes.filter((a) => a.data_de_exibicao === dataIso)
  if (ocupacoes.length === 0) return [...PRACAS]

  const alvo = clienteNome ? normalizarNome(clienteNome) : ''
  const vendidaAOutroCliente = ocupacoes.some((a) => normalizarNome(a.cliente_nome) !== alvo)
  if (vendidaAOutroCliente) return []

  const ocupadas = new Set(ocupacoes.map((a) => a.praca_codigo))
  return PRACAS.filter((praca) => !ocupadas.has(praca))
}

/** As praças que um mesmo cliente JÁ tem naquela data, comparando pelo nome normalizado. */
export function pracasDoClienteEm(
  acoes: AcaoRegional[],
  dataIso: string,
  clienteNome: string,
): string[] {
  const alvo = normalizarNome(clienteNome)
  if (alvo === '') return []
  return acoes
    .filter((a) => a.data_de_exibicao === dataIso && normalizarNome(a.cliente_nome) === alvo)
    .map((a) => a.praca_codigo)
}

/**
 * O que a compra precisa saber além das praças pedidas.
 *
 * Nasceu opcional de propósito: a matriz e a prévia da tela chamam
 * `validarCompra` sem saber quem é o cliente ainda, e a gravação — o único
 * ponto que decide de verdade — preenche os dois campos.
 */
export type ContextoDaCompra = {
  /**
   * Cliente que está comprando. Sem ele, R9 só consegue contar as praças
   * DESTE envio, e um mesmo cliente contorna o teto em duas gravações
   * (SP+RJ+BH, depois DF+PE1, dando 5 praças).
   */
  clienteNome?: string
  /** Datas bloqueadas do programa — R12 vale para o regional igual ao nacional. */
  bloqueios?: DataBloqueada[]
}

/**
 * R9 — um cliente compra até `max_pracas_por_acao` praças, consumindo o slot
 * de cada; e R12 — data bloqueada vence tudo.
 *
 * A ordem importa: um bloqueio de data encerra a validação sozinho, sem
 * enumerar praça livre nenhuma. "Vence tudo" quer dizer exatamente isso —
 * mostrar "a praça SP já está vendida" ao lado de "a data está bloqueada"
 * sugeriria que resolver a primeira liberaria a venda.
 */
export function validarCompra(
  config: ConfiguracaoRegional,
  acoes: AcaoRegional[],
  dataIso: string,
  pracasDesejadas: string[],
  contexto: ContextoDaCompra = {},
): string[] {
  const bloqueio = estaBloqueada(contexto.bloqueios ?? [], dataIso)
  if (bloqueio) {
    return [`Esta data está bloqueada: ${bloqueio.motivo}`]
  }

  const erros: string[] = []

  if (pracasDesejadas.length === 0) {
    erros.push('Selecione ao menos uma praça.')
  }
  if (!temSlotRegionalEm(config, dataIso)) {
    erros.push('Este programa não tem ação regional nesta data.')
  }
  if (pracasDesejadas.length > config.max_pracas_por_acao) {
    erros.push(`Uma ação pode ter no máximo ${config.max_pracas_por_acao} praças.`)
  }

  // R9 conta o que o cliente JÁ tem na data, não só o envio atual.
  const jaTem = contexto.clienteNome
    ? pracasDoClienteEm(acoes, dataIso, contexto.clienteNome)
    : []
  if (jaTem.length > 0 && jaTem.length + pracasDesejadas.length > config.max_pracas_por_acao) {
    erros.push(
      `${contexto.clienteNome} já tem ${jaTem.length} praça${jaTem.length > 1 ? 's' : ''} ` +
        `nesta data (${jaTem.join(', ')}); com mais ${pracasDesejadas.length} passaria do ` +
        `máximo de ${config.max_pracas_por_acao} praças por cliente.`,
    )
  }

  for (const praca of pracasDesejadas) {
    if (!PRACAS.includes(praca as (typeof PRACAS)[number])) {
      erros.push(`Praça desconhecida: ${praca}.`)
    }
  }

  // R8 (revista) — uma praça já vendida a OUTRO cliente bloqueia a data
  // inteira; ao próprio cliente, só a(s) praça(s) que ele já tem.
  const ocupacoes = acoes.filter((a) => a.data_de_exibicao === dataIso)
  const nomeAtual = contexto.clienteNome ? normalizarNome(contexto.clienteNome) : ''
  const donaDeOutroCliente = ocupacoes.find((a) => normalizarNome(a.cliente_nome) !== nomeAtual)
  if (donaDeOutroCliente) {
    erros.push(
      `Esta data já tem praça vendida para outro cliente (${donaDeOutroCliente.cliente_nome}) ` +
        'e fica indisponível para novas vendas regionais.',
    )
  } else {
    const ocupadas = new Set(ocupacoes.map((a) => a.praca_codigo))
    for (const praca of pracasDesejadas) {
      if (PRACAS.includes(praca as (typeof PRACAS)[number]) && ocupadas.has(praca)) {
        erros.push(`A praça ${praca} já está vendida nesta data.`)
      }
    }
  }

  return erros
}

/**
 * R15 (PROVISÓRIO) — a área ainda não confirmou se a ação regional consome
 * também um slot do inventário nacional do dia. Assumimos que sim, por ser o
 * erro menos grave: mostrar menos disponibilidade nacional custa uma venda
 * possível; o contrário faz vender espaço que não existe.
 *
 * Quando a área confirmar, troque o retorno desta função — e só dela.
 */
export function regionalConsomeSlotNacional(): boolean {
  return true
}

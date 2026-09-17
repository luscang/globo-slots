import { normalizarNome } from './texto'

export type LinhaBrutaCarteiraSiscom = Record<string, unknown>

export type ClienteDaCarteiraSiscom = {
  nome: string
  cnpj: string | null
  cod_siscom: string | null
  setor: string | null
  industria: string | null
  head_setor: string | null
  gerente_industria: string | null
  executivo_linear_360: string | null
  executivo_digital: string | null
  apto_regional: boolean
}

function texto(valor: unknown): string | null {
  const limpo = String(valor ?? '').trim()
  return limpo === '' ? null : limpo
}

/** A planilha usa "Sim"/"Não" — qualquer outra coisa (vazio, erro de digitação) vira não elegível. */
function ehElegivelParaRegional(valor: unknown): boolean {
  return normalizarNome(String(valor ?? '')) === 'SIM'
}

/**
 * Projeta uma linha da planilha "Carteira Siscom.xlsx" para o formato gravado
 * em `clientes`. Devolve `null` quando a linha não tem "Cliente" — não dá
 * pra cadastrar um cliente sem nome, e a coluna Cliente é a mesma usada para
 * casar com o Anunciante da API do Globo Take.
 */
export function projetarLinhaCarteiraSiscom(
  bruta: LinhaBrutaCarteiraSiscom,
): ClienteDaCarteiraSiscom | null {
  const nome = texto(bruta['Cliente'])
  if (!nome) return null

  return {
    nome,
    cnpj: texto(bruta['CNPJ']),
    cod_siscom: texto(bruta['Cód SISCOM']),
    setor: texto(bruta['Setor']),
    industria: texto(bruta['Indústria']),
    head_setor: texto(bruta['Head Setor']),
    gerente_industria: texto(bruta['Gerente Indústria']),
    executivo_linear_360: texto(bruta['Executivo Linear (360)']),
    executivo_digital: texto(bruta['Executivo Digital']),
    apto_regional: ehElegivelParaRegional(bruta['Elegível para regional']),
  }
}

/**
 * O mesmo Cliente pode aparecer em mais de uma linha da planilha (na carga de
 * referência, ~9 mil das 23 mil linhas repetem nome — geralmente sub-contas
 * do mesmo cliente). Quando isso acontece, vence a linha com Cód SISCOM
 * preenchido; havendo empate (as duas com código, ou nenhuma), vence a
 * última linha do arquivo.
 */
export function deduplicarPorNome(
  linhas: ClienteDaCarteiraSiscom[],
): ClienteDaCarteiraSiscom[] {
  const porNome = new Map<string, ClienteDaCarteiraSiscom>()

  for (const linha of linhas) {
    const chave = normalizarNome(linha.nome)
    const existente = porNome.get(chave)
    if (!existente) {
      porNome.set(chave, linha)
      continue
    }
    const linhaTemCodigo = linha.cod_siscom !== null
    const existenteTemCodigo = existente.cod_siscom !== null
    if (linhaTemCodigo || !existenteTemCodigo) porNome.set(chave, linha)
  }

  return [...porNome.values()]
}

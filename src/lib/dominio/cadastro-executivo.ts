export type LinhaBrutaCadastroExecutivo = Record<string, unknown>

export type ExecutivoDoCadastro = {
  executivo_linear_360: string
  email: string
  nome_salesforce: string | null
}

function texto(valor: unknown): string | null {
  const limpo = String(valor ?? '').trim()
  return limpo === '' ? null : limpo
}

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Projeta uma linha da planilha "Cadastro Executivo.xlsx". Devolve `null`
 * quando falta "Executivo Linear (360)" ou o e-mail não tem formato válido —
 * é a chave que liga a conta que loga ao nome usado na Carteira Siscom, um
 * e-mail quebrado deixaria a pessoa sem enxergar cliente nenhum sem
 * explicação nenhuma.
 */
export function projetarLinhaCadastroExecutivo(
  bruta: LinhaBrutaCadastroExecutivo,
): ExecutivoDoCadastro | null {
  const nome = texto(bruta['Executivo Linear (360)'])
  const email = texto(bruta['Email'])
  if (!nome || !email || !FORMATO_EMAIL.test(email)) return null

  return {
    executivo_linear_360: nome,
    email: email.toLowerCase(),
    nome_salesforce: texto(bruta['Nome no Salesforce']),
  }
}

/**
 * O e-mail é a chave (constraint única em `carteira_executivo`) — quando o
 * mesmo e-mail aparece mais de uma vez na planilha, vence a última linha.
 */
export function deduplicarPorEmail(
  linhas: ExecutivoDoCadastro[],
): ExecutivoDoCadastro[] {
  const porEmail = new Map<string, ExecutivoDoCadastro>()
  for (const linha of linhas) porEmail.set(linha.email, linha)
  return [...porEmail.values()]
}

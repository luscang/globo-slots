import { criarClienteServidor } from '../supabase/cliente-servidor'

export type ExecutivoCadastrado = {
  id: string
  executivo_linear_360: string
  email: string
  nome_salesforce: string | null
}

/** Lista o Cadastro Executivo inteiro — ~130 linhas hoje, cabe numa tela só. */
export async function listarExecutivos(): Promise<ExecutivoCadastrado[]> {
  const supabase = await criarClienteServidor()
  const { data, error } = await supabase
    .from('carteira_executivo')
    .select('id, executivo_linear_360, email, nome_salesforce')
    .order('executivo_linear_360', { ascending: true })

  if (error) {
    console.error('Falha ao listar o Cadastro Executivo:', error.message)
    return []
  }
  return data ?? []
}

/**
 * Resolve o nome "Executivo Linear (360)" de quem está logado, a partir do
 * e-mail da sessão. `null` quando o e-mail não está em `carteira_executivo` —
 * quem chama decide o que fazer (hoje: não mostrar cliente nenhum).
 */
export async function resolverNomeDoExecutivoLogado(email: string): Promise<string | null> {
  const emailLimpo = email.trim().toLowerCase()
  if (emailLimpo === '') return null

  const supabase = await criarClienteServidor()
  const { data, error } = await supabase
    .from('carteira_executivo')
    .select('executivo_linear_360')
    .eq('email', emailLimpo)
    .maybeSingle()

  if (error || !data) return null
  return data.executivo_linear_360
}

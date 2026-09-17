'use server'

import { criarClienteServidor } from '../supabase/cliente-servidor'
import { obterSessao } from '../sessao-servidor'
import { temPerfil } from '../dominio/perfis'
import { resolverNomeDoExecutivoLogado } from './carteira-executivo'

/** Um cliente da carteira, com as classificações usadas nas regras comerciais. */
export type Cliente = {
  id: string
  nome: string
  cnpj: string | null
  setor: string | null
  industria: string | null
  /** Campo próprio da Carteira. Opcional para compatibilidade com estados antigos da sessão. */
  segmentacao_se?: string | null
  apto_regional: boolean
}

const LIMITE_PADRAO = 20

function escaparCoringasLike(valor: string): string {
  return valor.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Busca clientes da carteira por nome para o campo de seleção.
 *
 * Server Action (não mais chamada direta ao Supabase do navegador): desde a
 * Carteira Siscom, um executivo só pode ver os clientes onde aparece como
 * Executivo Linear (360) ou Executivo Digital — e essa checagem depende da
 * sessão (e-mail de quem está logado), que só o servidor tem. Proprietário e
 * PO do produto continuam vendo a base inteira, como sempre.
 */
export async function buscarClientes(
  termo: string,
  limite: number = LIMITE_PADRAO,
): Promise<Cliente[]> {
  const termoLimpo = termo.trim()
  if (termoLimpo === '') return []

  const sessao = await obterSessao()
  if (!sessao) return []

  const semRestricaoDeCarteira =
    temPerfil(sessao.perfis, 'proprietario') || temPerfil(sessao.perfis, 'consultor_programa')

  let nomeDoExecutivo: string | null = null
  if (!semRestricaoDeCarteira) {
    nomeDoExecutivo = await resolverNomeDoExecutivoLogado(sessao.email)
    if (!nomeDoExecutivo) return []
  }

  const supabase = await criarClienteServidor()
  let consulta = supabase
    .from('clientes')
    .select('id, nome, cnpj, setor, industria, segmentacao_se, apto_regional')
    .ilike('nome', `%${escaparCoringasLike(termoLimpo)}%`)

  // ilike sem coringas compara igualdade sem diferenciar caixa — suficiente
  // aqui porque o mesmo nome de executivo vem das duas planilhas (Carteira
  // Siscom e Cadastro Executivo), mantidas pela mesma área.
  if (nomeDoExecutivo) {
    const nomeEscapado = escaparCoringasLike(nomeDoExecutivo)
    consulta = consulta.or(`executivo_linear_360.ilike.${nomeEscapado},executivo_digital.ilike.${nomeEscapado}`)
  }

  const { data, error } = await consulta.order('nome', { ascending: true }).limit(limite)

  if (error) {
    console.error('Falha ao buscar clientes:', error.message)
    return []
  }

  return (data ?? []).map((cliente) => ({
    ...cliente,
    apto_regional: Boolean(cliente.apto_regional),
  })) as Cliente[]
}

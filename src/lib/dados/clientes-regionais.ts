import { criarClienteServidor } from '../supabase/cliente-servidor'

/**
 * Leitura da elegibilidade regional (`clientes.apto_regional`) — Configurações
 * → Clientes regionais.
 *
 * A elegibilidade é do CLIENTE, GLOBAL: esta tela não pertence a nenhum
 * programa (diferente de `preco_regional`/`acoes_regionais`), por isso as
 * consultas aqui não recebem `programaId`.
 */

export type ClienteElegivel = {
  id: string
  nome: string
  cnpj: string | null
  setor: string | null
  executivo_linear_360: string | null
  executivo_digital: string | null
}

/** Tamanho de página da listagem — são 779 elegíveis, pagina para não trazer tudo de uma vez. */
export const TAMANHO_DA_PAGINA_ELEGIVEIS = 30

/**
 * Escapa os coringas do `LIKE`/`ILIKE` do Postgres antes de interpolar um
 * termo digitado livremente num padrão `%…%`. Mesma lógica de
 * `escaparCoringasLike` em `src/lib/dados/busca-clientes.ts` — duplicada de
 * propósito: aquele arquivo é `'use client'` (roda no navegador), este roda
 * no servidor.
 */
function escaparCoringasLike(valor: string): string {
  return valor.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/** Quantos clientes da carteira estão marcados como elegíveis — alimenta o resumo da aba Regional. */
export async function contarClientesElegiveis(): Promise<number> {
  const supabase = await criarClienteServidor()

  const { count, error } = await supabase
    .from('clientes')
    .select('id', { count: 'exact', head: true })
    .eq('apto_regional', true)

  if (error) {
    console.error('Falha ao contar clientes elegíveis para regional:', error.message)
    return 0
  }

  return count ?? 0
}

/**
 * Uma página da lista de clientes elegíveis, com busca opcional por nome ou
 * CNPJ. `pagina` é 1-based.
 */
export async function listarClientesElegiveis(
  pagina: number,
  busca: string,
): Promise<{ clientes: ClienteElegivel[]; total: number; erro: string | null }> {
  const supabase = await criarClienteServidor()
  const termoLimpo = busca.trim()

  let consulta = supabase
    .from('clientes')
    .select('id, nome, cnpj, setor, executivo_linear_360, executivo_digital', { count: 'exact' })
    .eq('apto_regional', true)

  if (termoLimpo !== '') {
    const termoEscapado = escaparCoringasLike(termoLimpo)
    consulta = consulta.or(`nome.ilike.%${termoEscapado}%,cnpj.ilike.%${termoEscapado}%`)
  }

  const paginaValida = Math.max(1, pagina)
  const de = (paginaValida - 1) * TAMANHO_DA_PAGINA_ELEGIVEIS
  const ate = de + TAMANHO_DA_PAGINA_ELEGIVEIS - 1

  const { data, count, error } = await consulta.order('nome', { ascending: true }).range(de, ate)

  if (error) {
    console.error('Falha ao listar clientes elegíveis para regional:', error.message)
    return { clientes: [], total: 0, erro: 'Não foi possível carregar a lista. Tente novamente.' }
  }

  return { clientes: (data ?? []) as ClienteElegivel[], total: count ?? 0, erro: null }
}

'use server'

import { revalidatePath } from 'next/cache'
import { criarClienteServidor } from '../supabase/cliente-servidor'
import { obterSessao } from '../sessao-servidor'
import { podeAdministrarGovernancaGlobal } from '../dominio/perfis'
import { buscarRelacionamentosMarcas, type RelacionamentoMarcaTake } from '../dados/marcas-take'

const CAMINHO = '/configuracoes/marcas'
const ERRO_SEM_PERMISSAO = 'Somente Proprietário pode alterar relacionamentos de marcas e anunciantes.'

function revalidarRelacionamentos() {
  revalidatePath(CAMINHO)
  revalidatePath('/consulta')
}

function autorizado(perfis: Parameters<typeof podeAdministrarGovernancaGlobal>[0]) {
  return podeAdministrarGovernancaGlobal(perfis)
}

export async function confirmarAnuncianteTake(
  anuncianteTakeId: string,
  clienteId: string,
): Promise<{ erro: string | null }> {
  const sessao = await obterSessao()
  if (!sessao) return { erro: 'Sua sessão expirou. Entre de novo.' }
  if (!autorizado(sessao.perfis)) return { erro: ERRO_SEM_PERMISSAO }
  if (!anuncianteTakeId || !clienteId) return { erro: 'Escolha um cliente da carteira.' }

  const supabase = await criarClienteServidor()
  const { error, count } = await supabase
    .from('anunciantes_take')
    .update({ cliente_id: clienteId, status: 'confirmado' }, { count: 'exact' })
    .eq('id', anuncianteTakeId)

  if (error) return { erro: `Não foi possível salvar o relacionamento. Detalhe técnico: ${error.message}` }
  if (!count) return { erro: 'O banco não deixou gravar. Confira sua permissão.' }

  revalidarRelacionamentos()
  return { erro: null }
}

export async function pesquisarRelacionamentosMarcas(
  termo: string,
): Promise<{ relacionamentos: RelacionamentoMarcaTake[]; erro: string | null }> {
  const sessao = await obterSessao()
  if (!sessao) return { relacionamentos: [], erro: 'Sua sessão expirou. Entre de novo.' }
  if (!autorizado(sessao.perfis)) return { relacionamentos: [], erro: ERRO_SEM_PERMISSAO }
  return { relacionamentos: await buscarRelacionamentosMarcas(termo, 100), erro: null }
}

export async function corrigirRelacionamentoMarca(
  anuncianteTakeId: string,
  marcaId: string,
  clienteId: string,
): Promise<{ erro: string | null }> {
  const sessao = await obterSessao()
  if (!sessao) return { erro: 'Sua sessão expirou. Entre de novo.' }
  if (!autorizado(sessao.perfis)) return { erro: ERRO_SEM_PERMISSAO }
  if (!anuncianteTakeId || !marcaId || !clienteId) return { erro: 'Escolha o anunciante correto da carteira.' }

  const supabase = await criarClienteServidor()
  const { error, count } = await supabase
    .from('anunciante_take_marcas')
    .update(
      {
        cliente_id_override: clienteId,
        corrigido_em: new Date().toISOString(),
        corrigido_por: sessao.usuarioId,
      },
      { count: 'exact' },
    )
    .eq('anunciante_take_id', anuncianteTakeId)
    .eq('marca_id', marcaId)

  if (error) return { erro: `Não foi possível salvar a correção. Detalhe técnico: ${error.message}` }
  if (!count) return { erro: 'O relacionamento informado não foi encontrado.' }

  revalidarRelacionamentos()
  return { erro: null }
}

export async function removerCorrecaoRelacionamentoMarca(
  anuncianteTakeId: string,
  marcaId: string,
): Promise<{ erro: string | null }> {
  const sessao = await obterSessao()
  if (!sessao) return { erro: 'Sua sessão expirou. Entre de novo.' }
  if (!autorizado(sessao.perfis)) return { erro: ERRO_SEM_PERMISSAO }

  const supabase = await criarClienteServidor()
  const { error, count } = await supabase
    .from('anunciante_take_marcas')
    .update({ cliente_id_override: null, corrigido_em: null, corrigido_por: null }, { count: 'exact' })
    .eq('anunciante_take_id', anuncianteTakeId)
    .eq('marca_id', marcaId)

  if (error) return { erro: `Não foi possível remover a correção. Detalhe técnico: ${error.message}` }
  if (!count) return { erro: 'O relacionamento informado não foi encontrado.' }

  revalidarRelacionamentos()
  return { erro: null }
}

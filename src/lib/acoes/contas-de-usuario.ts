import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perfil } from '../dominio/perfis'

/**
 * Cria a conta pela Admin API do Supabase (convite por e-mail — a pessoa
 * define a própria senha) ou reaproveita uma conta já existente com o mesmo
 * e-mail. Compartilhado entre "Criar usuário" (Perfis e acessos) e a
 * aprovação de uma solicitação de acesso.
 *
 * Recebe `servico` (cliente com a chave de serviço) em vez de criá-lo aqui
 * dentro: quem chama já checou que é Proprietário, e essa checagem — não
 * esta função — é a proteção real, já que a chave de serviço ignora RLS.
 */
export async function criarOuReaproveitarConta(
  servico: SupabaseClient,
  email: string,
): Promise<{ usuarioId: string | null; erro: string | null }> {
  const emailNormalizado = email.trim().toLowerCase()

  const convite = await servico.auth.admin.inviteUserByEmail(emailNormalizado)
  if (convite.data.user?.id) return { usuarioId: convite.data.user.id, erro: null }

  // O convite falha quando já existe conta com este e-mail — busca e reaproveita.
  const listagem = await servico.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existente = listagem.data.users.find(
    (usuario) => (usuario.email ?? '').toLowerCase() === emailNormalizado,
  )
  if (existente) return { usuarioId: existente.id, erro: null }

  return {
    usuarioId: null,
    erro: convite.error?.message || 'Não foi possível criar a conta para este e-mail.',
  }
}

/** Substitui os perfis do usuário pelos informados e grava/atualiza o nome. */
export async function definirPerfisDoUsuario(
  servico: SupabaseClient,
  usuarioId: string,
  nome: string,
  perfis: Perfil[],
): Promise<{ erro: string | null }> {
  await servico.from('usuario').upsert({ usuario_id: usuarioId, nome }, { onConflict: 'usuario_id' })
  await servico.from('perfil_usuario').delete().eq('usuario_id', usuarioId)

  const { error } = await servico
    .from('perfil_usuario')
    .insert(perfis.map((perfil) => ({ usuario_id: usuarioId, perfil })))

  return { erro: error?.message ?? null }
}

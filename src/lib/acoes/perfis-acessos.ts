'use server'

import { revalidatePath } from 'next/cache'
import { criarClienteServidor } from '../supabase/cliente-servidor'
import { criarClienteServico } from '../supabase/cliente-servico'
import { criarOuReaproveitarConta, definirPerfisDoUsuario } from './contas-de-usuario'
import { obterSessao } from '../sessao-servidor'
import {
  SECOES_DO_APP,
  SECOES_PADRAO_POR_PERFIL,
  temPerfil,
  type Perfil,
  type SecaoApp,
} from '../dominio/perfis'

export type UsuarioComAcessos = {
  usuario_id: string
  email: string
  nome: string
  cargo: string | null
  perfis: Perfil[]
  programas: string[]
}

export type PermissaoDeSecao = {
  perfil: Perfil
  secao: SecaoApp
  permitido: boolean
}

const PERFIS_VALIDOS: Perfil[] = [
  'executivo',
  'executivo_regional',
  'consultor_programa',
  'proprietario',
]

async function exigirProprietario() {
  const sessao = await obterSessao()
  if (!sessao || !temPerfil(sessao.perfis, 'proprietario')) {
    throw new Error('Apenas o proprietário pode administrar perfis e acessos.')
  }
  return sessao
}

export async function listarUsuariosComAcessos(): Promise<UsuarioComAcessos[]> {
  await exigirProprietario()
  const supabase = await criarClienteServidor()
  const { data, error } = await supabase.rpc('listar_usuarios_acessos')

  if (error) {
    console.error('Falha ao listar usuários e acessos:', error.message)
    return []
  }

  return (data ?? []).map((linha: {
    usuario_id: string
    email: string | null
    nome: string | null
    cargo: string | null
    perfis: string[] | null
    programas: string[] | null
  }) => ({
    usuario_id: linha.usuario_id,
    email: linha.email ?? '',
    nome: linha.nome ?? linha.email ?? '',
    cargo: linha.cargo,
    perfis: (linha.perfis ?? []).filter((perfil): perfil is Perfil =>
      PERFIS_VALIDOS.includes(perfil as Perfil),
    ),
    programas: linha.programas ?? [],
  }))
}

export async function listarPermissoesDeSecoes(): Promise<PermissaoDeSecao[]> {
  await exigirProprietario()
  const supabase = await criarClienteServidor()
  const { data, error } = await supabase
    .from('perfil_secao')
    .select('perfil, secao, permitido')

  if (!error && data) {
    return data
      .filter((linha) =>
        PERFIS_VALIDOS.includes(linha.perfil as Perfil)
        && SECOES_DO_APP.some((secao) => secao.valor === linha.secao),
      )
      .map((linha) => ({
        perfil: linha.perfil as Perfil,
        secao: linha.secao as SecaoApp,
        permitido: Boolean(linha.permitido),
      }))
  }

  // Fallback seguro enquanto a migration ainda não foi executada.
  return PERFIS_VALIDOS.flatMap((perfil) =>
    SECOES_DO_APP.map(({ valor }) => ({
      perfil,
      secao: valor,
      permitido: SECOES_PADRAO_POR_PERFIL[perfil].includes(valor),
    })),
  )
}

export async function salvarSecoesDoPerfil(entrada: {
  perfil: Perfil
  secoes: SecaoApp[]
}): Promise<{ erro: string | null }> {
  await exigirProprietario()
  if (!PERFIS_VALIDOS.includes(entrada.perfil)) return { erro: 'Perfil inválido.' }

  const secoesValidas = [...new Set(entrada.secoes)]
    .filter((secao) => SECOES_DO_APP.some((item) => item.valor === secao))

  const supabase = await criarClienteServidor()
  const { error } = await supabase.rpc('salvar_secoes_do_perfil', {
    p_perfil: entrada.perfil,
    p_secoes: secoesValidas,
  })

  if (error) {
    const texto = error.message.toLowerCase()
    const semMigration = texto.includes('salvar_secoes_do_perfil') || texto.includes('could not find')
    return {
      erro: semMigration
        ? 'Execute schema-entrega-4-secoes-perfis.sql no Supabase para habilitar a matriz de seções.'
        : error.message,
    }
  }

  revalidatePath('/configuracoes/perfis')
  revalidatePath('/inicio')
  return { erro: null }
}

export async function salvarAcessosUsuario(entrada: {
  usuarioId: string
  perfis: Perfil[]
  programas: string[]
}): Promise<{ erro: string | null }> {
  await exigirProprietario()

  const perfis = [...new Set(entrada.perfis)].filter((perfil) => PERFIS_VALIDOS.includes(perfil))
  if (perfis.length === 0) return { erro: 'Selecione ao menos um perfil.' }

  const programas = perfis.includes('consultor_programa')
    ? [...new Set(entrada.programas)]
    : []

  const supabase = await criarClienteServidor()
  const { error } = await supabase.rpc('atualizar_acessos_usuario', {
    p_usuario_id: entrada.usuarioId,
    p_perfis: perfis,
    p_programas: programas,
  })

  if (error) {
    console.error('Falha ao atualizar acessos do usuário:', error.message)
    return { erro: error.message }
  }

  revalidatePath('/configuracoes/perfis')
  return { erro: null }
}

/**
 * Cria uma conta nova direto em Perfis e acessos, sem passar pela tela
 * pública de solicitação — para quando o Proprietário já sabe quem quer
 * incluir e qual perfil dar (ex.: outro Proprietário ou PO do produto).
 */
export async function criarUsuarioComPerfil(entrada: {
  nome: string
  email: string
  perfis: Perfil[]
}): Promise<{ erro: string | null }> {
  await exigirProprietario()

  const nome = entrada.nome.trim()
  const email = entrada.email.trim()
  if (!nome) return { erro: 'Informe o nome.' }
  if (!email) return { erro: 'Informe o e-mail.' }

  const perfis = [...new Set(entrada.perfis)].filter((perfil) => PERFIS_VALIDOS.includes(perfil))
  if (perfis.length === 0) return { erro: 'Selecione ao menos um perfil.' }

  const servico = criarClienteServico()
  const { usuarioId, erro: erroConta } = await criarOuReaproveitarConta(servico, email)
  if (!usuarioId) return { erro: erroConta }

  const { erro: erroPerfil } = await definirPerfisDoUsuario(servico, usuarioId, nome, perfis)
  if (erroPerfil) return { erro: `Conta criada, mas não foi possível gravar o perfil: ${erroPerfil}` }

  revalidatePath('/configuracoes/perfis')
  return { erro: null }
}

async function unicoProprietarioBloqueado(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  usuarioId: string,
): Promise<boolean> {
  const { data: perfisDoUsuario } = await supabase
    .from('perfil_usuario')
    .select('perfil')
    .eq('usuario_id', usuarioId)
  const eraProprietario = (perfisDoUsuario ?? []).some((linha) => linha.perfil === 'proprietario')
  if (!eraProprietario) return false

  const { count } = await supabase
    .from('perfil_usuario')
    .select('usuario_id', { count: 'exact', head: true })
    .eq('perfil', 'proprietario')
  return (count ?? 0) <= 1
}

/** Só revoga os perfis (fallback quando a exclusão da conta é bloqueada). */
async function removerAcessoDoUsuario(usuarioId: string): Promise<{ erro: string | null }> {
  const supabase = await criarClienteServidor()
  const { error } = await supabase.rpc('remover_acessos_usuario', { p_usuario_id: usuarioId })

  if (error) {
    const texto = error.message.toLowerCase()
    if (texto.includes('remover_acessos_usuario') || texto.includes('could not find')) {
      return { erro: 'Execute supabase/schema-entrega-11-solicitacoes-de-acesso.sql no Supabase para habilitar a remoção de acesso.' }
    }
    return { erro: error.message }
  }

  revalidatePath('/configuracoes/perfis')
  return { erro: null }
}

/**
 * Exclui a conta por completo (Admin API do Supabase) — a pessoa some de
 * verdade, inclusive do login.
 *
 * `propostas.usuario_id` e `consultas.usuario_id` têm `on delete
 * restrict`/`cascade` de propósito: histórico comercial nunca pode ficar
 * sem autor. Isso significa que quem já gerou consulta ou proposta NÃO PODE
 * ser excluído — o Postgres recusa a exclusão da conta. Nesse caso, em vez
 * de só devolver um erro, cai automaticamente para revogar o acesso (a
 * conta continua existindo, mas a pessoa não entra mais) e avisa por quê.
 */
export async function excluirUsuario(usuarioId: string): Promise<{ erro: string | null; aviso: string | null }> {
  await exigirProprietario()

  const supabase = await criarClienteServidor()
  if (await unicoProprietarioBloqueado(supabase, usuarioId)) {
    return { erro: 'Não é possível excluir o único Proprietário do sistema.', aviso: null }
  }

  const servico = criarClienteServico()
  const { error } = await servico.auth.admin.deleteUser(usuarioId)

  if (!error) {
    revalidatePath('/configuracoes/perfis')
    return { erro: null, aviso: null }
  }

  const resultadoFallback = await removerAcessoDoUsuario(usuarioId)
  if (resultadoFallback.erro) return { erro: resultadoFallback.erro, aviso: null }

  return {
    erro: null,
    aviso:
      'Esta conta já tem consultas ou propostas registradas, então não pode ser excluída — isso apagaria ' +
      'histórico comercial. O acesso foi removido mesmo assim: a pessoa não consegue mais entrar, mas a ' +
      'conta e o histórico continuam intactos.',
  }
}

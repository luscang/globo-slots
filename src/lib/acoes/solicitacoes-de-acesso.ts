'use server'

import { revalidatePath } from 'next/cache'
import { criarClienteServidor } from '../supabase/cliente-servidor'
import { criarClienteServico } from '../supabase/cliente-servico'
import { obterSessao } from '../sessao-servidor'
import { temPerfil, type Perfil } from '../dominio/perfis'
import { criarOuReaproveitarConta, definirPerfisDoUsuario } from './contas-de-usuario'

const PERFIS_VALIDOS: Perfil[] = ['executivo', 'executivo_regional', 'consultor_programa', 'proprietario']
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type SolicitacaoDeAcesso = {
  id: string
  nome: string
  email: string
  perfil_solicitado: Perfil
  criado_em: string
}

async function exigirProprietario() {
  const sessao = await obterSessao()
  if (!sessao || !temPerfil(sessao.perfis, 'proprietario')) return null
  return sessao
}

/**
 * Pedido de acesso público — chamado de `/solicitar-acesso`, fora do grupo
 * autenticado. Qualquer um pode chamar; a RLS de `solicitacao_de_acesso`
 * (policy "criar publica") é a proteção real, não esta checagem de formato.
 */
export async function solicitarAcesso(entrada: {
  nome: string
  email: string
  perfilSolicitado: string
}): Promise<{ erro: string | null }> {
  const nome = entrada.nome.trim()
  const email = entrada.email.trim().toLowerCase()

  if (!nome) return { erro: 'Informe seu nome.' }
  if (!FORMATO_EMAIL.test(email)) return { erro: 'Informe um e-mail válido.' }
  if (!PERFIS_VALIDOS.includes(entrada.perfilSolicitado as Perfil)) return { erro: 'Selecione um perfil.' }

  const supabase = await criarClienteServidor()
  const { error } = await supabase.from('solicitacao_de_acesso').insert({
    nome,
    email,
    perfil_solicitado: entrada.perfilSolicitado,
  })

  if (error) {
    if (error.code === '23505') {
      return { erro: 'Já existe uma solicitação pendente para este e-mail. Aguarde a análise.' }
    }
    const texto = error.message.toLowerCase()
    if (texto.includes('solicitacao_de_acesso') || texto.includes('could not find')) {
      return { erro: 'Solicitação de acesso ainda não está disponível. Fale com o administrador.' }
    }
    return { erro: 'Não foi possível enviar sua solicitação. Tente novamente.' }
  }

  return { erro: null }
}

export async function listarSolicitacoesPendentes(): Promise<SolicitacaoDeAcesso[]> {
  const sessao = await exigirProprietario()
  if (!sessao) return []

  const supabase = await criarClienteServidor()
  const { data, error } = await supabase
    .from('solicitacao_de_acesso')
    .select('id, nome, email, perfil_solicitado, criado_em')
    .eq('status', 'pendente')
    .order('criado_em', { ascending: true })

  if (error) {
    console.error('Falha ao listar solicitações de acesso:', error.message)
    return []
  }
  return (data ?? []) as SolicitacaoDeAcesso[]
}

/**
 * Aprova um pedido: cria a conta pela Admin API do Supabase (convite por
 * e-mail — a pessoa define a própria senha) e já grava os perfis escolhidos.
 * Se a conta já existir por outro motivo, reaproveita em vez de falhar.
 *
 * `criarClienteServico()` ignora TODO o RLS — a checagem de Proprietário
 * logo abaixo é a única proteção real deste fluxo, não uma policy de banco.
 */
export async function aprovarSolicitacaoDeAcesso(
  solicitacaoId: string,
  perfisConcedidos: Perfil[],
): Promise<{ erro: string | null }> {
  const sessao = await exigirProprietario()
  if (!sessao) return { erro: 'Apenas o Proprietário pode aprovar solicitações de acesso.' }

  const perfisValidos = perfisConcedidos.filter((perfil) => PERFIS_VALIDOS.includes(perfil))
  if (perfisValidos.length === 0) return { erro: 'Escolha ao menos um perfil para conceder.' }

  const supabase = await criarClienteServidor()
  const { data: solicitacao, error: erroSolicitacao } = await supabase
    .from('solicitacao_de_acesso')
    .select('id, nome, email, status')
    .eq('id', solicitacaoId)
    .maybeSingle()

  if (erroSolicitacao || !solicitacao) return { erro: 'Solicitação não encontrada.' }
  if (solicitacao.status !== 'pendente') return { erro: 'Esta solicitação já foi resolvida.' }

  const servico = criarClienteServico()
  const { usuarioId, erro: erroConta } = await criarOuReaproveitarConta(servico, String(solicitacao.email))
  if (!usuarioId) return { erro: erroConta }

  const { erro: erroPerfil } = await definirPerfisDoUsuario(servico, usuarioId, solicitacao.nome, perfisValidos)
  if (erroPerfil) return { erro: `Conta criada, mas não foi possível gravar o perfil: ${erroPerfil}` }

  const { error: erroAtualizar } = await supabase
    .from('solicitacao_de_acesso')
    .update({
      status: 'aprovada',
      perfis_concedidos: perfisValidos,
      resolvido_em: new Date().toISOString(),
      resolvido_por: sessao.usuarioId,
    })
    .eq('id', solicitacaoId)
  if (erroAtualizar) return { erro: `Perfil gravado, mas não foi possível fechar a solicitação: ${erroAtualizar.message}` }

  revalidatePath('/configuracoes/perfis')
  return { erro: null }
}

export async function rejeitarSolicitacaoDeAcesso(solicitacaoId: string): Promise<{ erro: string | null }> {
  const sessao = await exigirProprietario()
  if (!sessao) return { erro: 'Apenas o Proprietário pode rejeitar solicitações de acesso.' }

  const supabase = await criarClienteServidor()
  const { error } = await supabase
    .from('solicitacao_de_acesso')
    .update({
      status: 'rejeitada',
      resolvido_em: new Date().toISOString(),
      resolvido_por: sessao.usuarioId,
    })
    .eq('id', solicitacaoId)
    .eq('status', 'pendente')

  if (error) return { erro: error.message || 'Não foi possível rejeitar a solicitação.' }

  revalidatePath('/configuracoes/perfis')
  return { erro: null }
}

'use server'

import { revalidatePath } from 'next/cache'
import { criarClienteServidor } from '../supabase/cliente-servidor'
import { obterSessao } from '../sessao-servidor'
import { podeEditarPrograma } from '../dominio/perfis'
import { restricaoQueBloqueia, type Restricao as RegraDeRestricao } from '../dominio/restricoes'
import { lerPaginado } from '../dados/paginacao'

export type DadosDeRestricao = {
  anunciante: string | null
  setor: string | null
  industria: string | null
  segmentacao_se: string | null
  motivo: string
}

export type RestricaoAplicadaNaConsulta = {
  tipo: 'Anunciante' | 'Setor e indústria' | 'Segmentação SE'
  alvo: string
  motivo: string
}

const ERRO_SESSAO_EXPIRADA = 'Sua sessão expirou. Entre de novo.'
const ERRO_SEM_PERMISSAO = 'Você não tem permissão para alterar restrições deste programa.'

function validar(dados: Partial<DadosDeRestricao>): string[] {
  const erros: string[] = []

  if (!dados.motivo || dados.motivo.trim() === '') erros.push('Informe o motivo da restrição.')

  const temAnunciante = Boolean(dados.anunciante?.trim())
  const temSetorEIndustria = Boolean(dados.setor?.trim() && dados.industria?.trim())
  const temSegmentacaoSe = Boolean(dados.segmentacao_se?.trim())

  if (!temAnunciante && !temSetorEIndustria && !temSegmentacaoSe) {
    erros.push('Escolha um anunciante, um setor e indústria, ou uma Segmentação SE.')
  }

  if ((dados.setor?.trim() && !dados.industria?.trim()) || (!dados.setor?.trim() && dados.industria?.trim())) {
    erros.push('Para este tipo de restrição, informe Setor e Indústria juntos.')
  }

  return erros
}

export async function salvarRestricao(
  programaId: string,
  dados: Partial<DadosDeRestricao>,
): Promise<{ erros: string[]; id: string | null }> {
  const sessao = await obterSessao()
  if (!sessao) return { erros: [ERRO_SESSAO_EXPIRADA], id: null }
  if (!podeEditarPrograma(sessao.perfis, sessao.programasVinculados, programaId)) {
    return { erros: [ERRO_SEM_PERMISSAO], id: null }
  }

  const erros = validar(dados)
  if (erros.length > 0) return { erros, id: null }

  const supabase = await criarClienteServidor()
  const { data, error } = await supabase
    .from('restricoes_anunciante')
    .insert({
      programa_id: programaId,
      anunciante: dados.anunciante?.trim() || null,
      setor: dados.setor?.trim() || null,
      industria: dados.industria?.trim() || null,
      segmentacao_se: dados.segmentacao_se?.trim() || null,
      motivo: dados.motivo!.trim(),
    })
    .select('id')

  if (error) {
    console.error('Falha ao gravar restrição:', error.message)
    return { erros: [`Não foi possível gravar a restrição. Detalhe técnico: ${error.message}`], id: null }
  }

  if (!data || data.length === 0) {
    return { erros: ['O banco não deixou gravar. Confira sua permissão neste programa.'], id: null }
  }

  revalidatePath(`/configuracoes/programas/${programaId}/restricoes`)
  return { erros: [], id: data[0].id }
}

export async function excluirRestricao(
  programaId: string,
  restricaoId: string,
): Promise<{ erro: string | null }> {
  const sessao = await obterSessao()
  if (!sessao) return { erro: ERRO_SESSAO_EXPIRADA }
  if (!podeEditarPrograma(sessao.perfis, sessao.programasVinculados, programaId)) {
    return { erro: ERRO_SEM_PERMISSAO }
  }

  const supabase = await criarClienteServidor()
  const { error, count } = await supabase
    .from('restricoes_anunciante')
    .delete({ count: 'exact' })
    .eq('id', restricaoId)
    .eq('programa_id', programaId)

  if (error) return { erro: `Não foi possível excluir a restrição. Detalhe técnico: ${error.message}` }
  if (!count) return { erro: 'O banco não deixou excluir. Confira sua permissão neste programa.' }

  revalidatePath(`/configuracoes/programas/${programaId}/restricoes`)
  return { erro: null }
}

/**
 * Valida Programa + Cliente no início da consulta. Segmentação SE é resolvida
 * diretamente da Carteira para continuar correta mesmo em sessões antigas.
 */
export async function verificarRestricaoDaConsulta(
  programaId: string,
  cliente: { nome: string; setor: string | null; industria: string | null },
): Promise<{ restricao: RestricaoAplicadaNaConsulta | null; erro: string | null }> {
  const sessao = await obterSessao()
  if (!sessao) return { restricao: null, erro: ERRO_SESSAO_EXPIRADA }
  if (!programaId.trim()) return { restricao: null, erro: 'Selecione um programa antes do cliente.' }

  const supabase = await criarClienteServidor()

  let consultaCliente = supabase
    .from('clientes')
    .select('segmentacao_se')
    .eq('nome', cliente.nome)
    .limit(20)

  consultaCliente = cliente.setor === null
    ? consultaCliente.is('setor', null)
    : consultaCliente.eq('setor', cliente.setor)
  consultaCliente = cliente.industria === null
    ? consultaCliente.is('industria', null)
    : consultaCliente.eq('industria', cliente.industria)

  const [respostaCliente, respostaRestricoes] = await Promise.all([
    consultaCliente,
    supabase
      .from('restricoes_anunciante')
      .select('anunciante, setor, industria, segmentacao_se, motivo')
      .eq('programa_id', programaId),
  ])

  if (respostaCliente.error || respostaRestricoes.error) {
    console.error(
      'Falha ao validar restrições da Nova Consulta:',
      respostaCliente.error?.message ?? respostaRestricoes.error?.message,
    )
    const detalhe = respostaCliente.error?.message ?? respostaRestricoes.error?.message
    return { restricao: null, erro: `Não foi possível validar as restrições deste programa. Detalhe técnico: ${detalhe}` }
  }

  const segmentacoes = [...new Set(
    (respostaCliente.data ?? [])
      .map((linha) => linha.segmentacao_se?.trim() || null)
      .filter((valor): valor is string => Boolean(valor)),
  )]

  if (segmentacoes.length > 1) {
    return {
      restricao: null,
      erro: 'Há mais de uma Segmentação SE para este cliente na Carteira. Solicite revisão do cadastro antes de continuar.',
    }
  }

  const clienteClassificado = {
    ...cliente,
    segmentacao_se: segmentacoes[0] ?? null,
  }

  const encontrada = restricaoQueBloqueia(
    (respostaRestricoes.data ?? []) as RegraDeRestricao[],
    clienteClassificado,
  )
  if (!encontrada) return { restricao: null, erro: null }

  if (encontrada.anunciante?.trim()) {
    return { restricao: { tipo: 'Anunciante', alvo: encontrada.anunciante.trim(), motivo: encontrada.motivo }, erro: null }
  }

  if (encontrada.setor?.trim() && encontrada.industria?.trim()) {
    return {
      restricao: {
        tipo: 'Setor e indústria',
        alvo: `${encontrada.setor.trim()} · ${encontrada.industria.trim()}`,
        motivo: encontrada.motivo,
      },
      erro: null,
    }
  }

  return {
    restricao: {
      tipo: 'Segmentação SE',
      alvo: encontrada.segmentacao_se?.trim() || 'Segmentação cadastrada',
      motivo: encontrada.motivo,
    },
    erro: null,
  }
}

export async function calcularAlcanceDaRestricao(
  dados: Partial<DadosDeRestricao>,
): Promise<{ alcance: number; totalDaCarteira: number; erro: string | null }> {
  const sessao = await obterSessao()
  if (!sessao) return { alcance: 0, totalDaCarteira: 0, erro: ERRO_SESSAO_EXPIRADA }

  const temAlvo = Boolean(
    dados.anunciante?.trim() ||
    (dados.setor?.trim() && dados.industria?.trim()) ||
    dados.segmentacao_se?.trim(),
  )
  if (!temAlvo) return { alcance: 0, totalDaCarteira: 0, erro: null }

  const supabase = await criarClienteServidor()
  const { linhas, erro } = await lerPaginado<{
    nome: string
    setor: string | null
    industria: string | null
    segmentacao_se: string | null
  }>((de, ate) =>
    supabase.from('clientes').select('nome, setor, industria, segmentacao_se').range(de, ate),
  )

  if (erro) {
    return {
      alcance: 0,
      totalDaCarteira: 0,
      erro: 'Não foi possível calcular quantos clientes esta restrição afeta.',
    }
  }

  const restricaoDeTeste: RegraDeRestricao = {
    anunciante: dados.anunciante?.trim() || null,
    setor: dados.setor?.trim() || null,
    industria: dados.industria?.trim() || null,
    segmentacao_se: dados.segmentacao_se?.trim() || null,
    motivo: dados.motivo?.trim() || '—',
  }

  const alcance = linhas.reduce(
    (total, linha) => restricaoQueBloqueia([restricaoDeTeste], linha) ? total + 1 : total,
    0,
  )

  return { alcance, totalDaCarteira: linhas.length, erro: null }
}

'use server'

import { revalidatePath } from 'next/cache'
import { criarClienteServidor } from '../supabase/cliente-servidor'
import { obterSessao } from '../sessao-servidor'
import { podeEditarPrograma } from '../dominio/perfis'
import { validarPeriodoEspecial } from '../dominio/datas-especiais'
import { listarDatasEspeciais, type PeriodoEspecial } from '../dados/datas-especiais'

/**
 * Cadastro de datas especiais — período com preço diferenciado.
 *
 * A permissão é conferida aqui (para o erro sair em português) e de novo no
 * banco pela policy "escrita consultor" de `datas_especiais`
 * (`supabase/schema-datas-especiais.sql`): consultor só grava no programa a
 * que está vinculado, proprietário em todos.
 *
 * A sobreposição entre períodos do mesmo programa também é conferida aqui,
 * com `validarPeriodoEspecial` (`src/lib/dominio/datas-especiais.ts`) — o
 * banco não tem como recusar isso sozinho sem a extensão `btree_gist`, que
 * este projeto não usa.
 */

const ERRO_SESSAO_EXPIRADA = 'Sua sessão expirou. Entre de novo.'
const ERRO_SEM_PERMISSAO = 'Você não tem permissão para alterar datas especiais deste programa.'

export type NovoPeriodoEspecial = {
  nome: string
  data_inicio: string
  data_fim: string
  percentual_acrescimo: number
  texto_investimento: string | null
  /** 0=domingo … 6=sábado. Vazio ou nulo = todos os dias do período. */
  dias_da_semana: number[] | null
}

export async function criarPeriodoEspecial(
  programaId: string,
  novo: NovoPeriodoEspecial,
): Promise<{ erros: string[] }> {
  const sessao = await obterSessao()
  if (!sessao) return { erros: [ERRO_SESSAO_EXPIRADA] }
  if (!podeEditarPrograma(sessao.perfis, sessao.programasVinculados, programaId)) {
    return { erros: [ERRO_SEM_PERMISSAO] }
  }

  const existentes = await listarDatasEspeciais(programaId)

  const nomeLimpo = novo.nome.trim()
  const diasLimpos = novo.dias_da_semana && novo.dias_da_semana.length > 0 ? novo.dias_da_semana : null

  const erros = validarPeriodoEspecial(
    {
      nome: nomeLimpo,
      data_inicio: novo.data_inicio,
      data_fim: novo.data_fim,
      percentual_acrescimo: novo.percentual_acrescimo,
      dias_da_semana: diasLimpos,
    },
    existentes,
  )

  if (erros.length > 0) return { erros }

  const supabase = await criarClienteServidor()

  const { error } = await supabase.from('datas_especiais').insert({
    programa_id: programaId,
    nome: nomeLimpo,
    data_inicio: novo.data_inicio,
    data_fim: novo.data_fim,
    percentual_acrescimo: novo.percentual_acrescimo,
    texto_investimento: novo.texto_investimento?.trim() || null,
    dias_da_semana: diasLimpos,
    criado_por: sessao.usuarioId,
  })

  if (error) {
    console.error('Falha ao gravar período especial:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })

    const mensagem = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
    if (mensagem.includes('dias_da_semana')) {
      return {
        erros: [
          'A estrutura do banco ainda não possui o campo de dias da semana. Execute o arquivo supabase/schema-datas-especiais-dias.sql no SQL Editor do Supabase e tente novamente.',
        ],
      }
    }

    if (error.code === '42501' || mensagem.includes('row-level security')) {
      return { erros: ['O banco não permitiu gravar este período. Confira seu perfil e vínculo com o programa.'] }
    }

    return { erros: [`Não foi possível gravar o período. Detalhe técnico: ${error.message}`] }
  }

  revalidatePath(`/configuracoes/programas/${programaId}/datas-especiais`)
  return { erros: [] }
}

export async function excluirPeriodoEspecial(
  programaId: string,
  id: string,
): Promise<{ erro: string | null }> {
  const sessao = await obterSessao()
  if (!sessao) return { erro: ERRO_SESSAO_EXPIRADA }
  if (!podeEditarPrograma(sessao.perfis, sessao.programasVinculados, programaId)) {
    return { erro: ERRO_SEM_PERMISSAO }
  }

  const supabase = await criarClienteServidor()

  const { error, count } = await supabase
    .from('datas_especiais')
    .delete({ count: 'exact' })
    .eq('programa_id', programaId)
    .eq('id', id)

  if (error) return { erro: `Não foi possível excluir o período. Detalhe técnico: ${error.message}` }

  // DELETE barrado pelo RLS volta sem erro e sem linhas — sem conferir, a
  // tela diria "excluído" com o registro ainda no banco.
  if (!count) return { erro: 'O banco não deixou excluir. Confira sua permissão neste programa.' }

  revalidatePath(`/configuracoes/programas/${programaId}/datas-especiais`)
  return { erro: null }
}

export type { PeriodoEspecial }

'use server'

import { revalidatePath } from 'next/cache'
import { criarClienteServidor } from '../supabase/cliente-servidor'
import { obterSessao } from '../sessao-servidor'
import { podeEditarPrograma } from '../dominio/perfis'
import { montarMapa, ocupaSlot } from '../dominio/formatos'
import { montarIndice, encontrarProgramaId } from '../dominio/programas'
import { lerPaginado } from '../dados/paginacao'

/**
 * Cadastro de datas bloqueadas — Task 11.
 *
 * A permissão é conferida aqui (para o erro sair em português) e de novo no
 * banco pela policy "escrita consultor" de `datas_bloqueadas`
 * (`supabase/schema-entrega-2.sql`): consultor só grava no programa a que
 * está vinculado, proprietário em todos.
 */

const ERRO_SESSAO_EXPIRADA = 'Sua sessão expirou. Entre de novo.'
const ERRO_SEM_PERMISSAO = 'Você não tem permissão para alterar datas bloqueadas deste programa.'

function formatarDataBR(iso: string): string {
  const data = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(data.getTime())) return iso
  const dia = String(data.getUTCDate()).padStart(2, '0')
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${data.getUTCFullYear()}`
}

function ehViolacaoDeUnicidade(mensagem: string, codigo: string | undefined): boolean {
  return codigo === '23505' || mensagem.toLowerCase().includes('duplicate')
}

/**
 * Bloqueia um lote de datas de uma vez, todas com o mesmo motivo.
 *
 * Tenta gravar o lote inteiro numa única inserção — o caminho comum, sem
 * conflito. Se o banco recusar (uma das datas já estava bloqueada, pela
 * unicidade `(programa_id, data)`), regrava uma a uma para salvar o que der
 * e devolve, por data, qual não entrou — por isso a assinatura devolve uma
 * LISTA de erros, e não um só: um lote de 5 datas em que 1 já estava
 * bloqueada ainda bloqueia as outras 4.
 */
export async function bloquearDatas(
  programaId: string,
  datas: string[],
  motivo: string,
): Promise<{ erros: string[] }> {
  const sessao = await obterSessao()
  if (!sessao) return { erros: [ERRO_SESSAO_EXPIRADA] }
  if (!podeEditarPrograma(sessao.perfis, sessao.programasVinculados, programaId)) {
    return { erros: [ERRO_SEM_PERMISSAO] }
  }

  const motivoLimpo = motivo.trim()
  if (motivoLimpo === '') return { erros: ['Informe o motivo do bloqueio.'] }

  const datasUnicas = [...new Set(datas)]
  if (datasUnicas.length === 0) return { erros: ['Selecione ao menos uma data no calendário.'] }

  const supabase = await criarClienteServidor()

  const { error: erroDoLote } = await supabase
    .from('datas_bloqueadas')
    .insert(datasUnicas.map((data) => ({ programa_id: programaId, data, motivo: motivoLimpo })))

  if (!erroDoLote) {
    revalidatePath(`/configuracoes/programas/${programaId}/datas`)
    return { erros: [] }
  }

  const erros: string[] = []
  for (const data of datasUnicas) {
    const { error } = await supabase
      .from('datas_bloqueadas')
      .insert({ programa_id: programaId, data, motivo: motivoLimpo })

    if (error) {
      erros.push(
        ehViolacaoDeUnicidade(error.message, error.code)
          ? `${formatarDataBR(data)}: já estava bloqueada.`
          : `${formatarDataBR(data)}: não foi possível gravar.`,
      )
    }
  }

  revalidatePath(`/configuracoes/programas/${programaId}/datas`)
  return { erros }
}

export type ImpactoDoBloqueio = {
  nacionais: number
  regionais: number
  /** Datas escolhidas que já têm ação vendida, em ISO — a tela as nomeia. */
  datasAfetadas: string[]
  erro: string | null
}

/**
 * Quantas ações JÁ VENDIDAS caem nas datas prestes a ser bloqueadas — o número
 * que a spec exige à vista antes de confirmar ("Datas bloqueadas mostram
 * quantas ações seriam afetadas antes de confirmar").
 *
 * Sem ele, a tela informava apenas quantas datas estavam selecionadas, que é
 * a única coisa que a pessoa já sabe: ela acabou de clicar nelas. O que ela
 * não sabe, e não tem como descobrir sem sair da página, é que a sexta que
 * está fechando por feriado já tem três ações vendidas. Bloquear data com
 * venda é decisão legítima — acontece quando o feriado é confirmado depois da
 * venda —, mas é decisão que muda de natureza com o número na frente.
 *
 * Conta os dois inventários:
 *
 * - **Nacionais**, de `acoes_vendidas`, restritas a este programa (pelo
 *   mnemônico ou apelido, mesma regra da ocupação) e só o que ocupa slot —
 *   `ocupaSlot`: comercial, vinheta e chamada estão na base mas não são ação
 *   de conteúdo, e contá-las inflaria o aviso.
 * - **Regionais**, de `acoes_regionais`, uma linha por praça vendida.
 *
 * `formatos` é lida com `lerPaginado` porque cresce com a origem (73 hoje) e
 * um formato que ficasse fora das primeiras 1000 linhas seria classificado
 * pelo padrão conservador, mudando a contagem em silêncio.
 */
export async function contarAcoesNasDatas(
  programaId: string,
  datas: string[],
): Promise<ImpactoDoBloqueio> {
  const vazio: ImpactoDoBloqueio = { nacionais: 0, regionais: 0, datasAfetadas: [], erro: null }

  const sessao = await obterSessao()
  if (!sessao) return { ...vazio, erro: ERRO_SESSAO_EXPIRADA }

  const datasUnicas = [...new Set(datas)]
  if (datasUnicas.length === 0) return vazio

  const supabase = await criarClienteServidor()

  const [nacionais, regionais, programas, apelidos, leituraDeFormatos] = await Promise.all([
    supabase
      .from('acoes_vendidas')
      .select('programa, data_de_exibicao, formato')
      .in('data_de_exibicao', datasUnicas),
    supabase
      .from('acoes_regionais')
      .select('data_de_exibicao')
      .eq('programa_id', programaId)
      .in('data_de_exibicao', datasUnicas),
    supabase.from('programas').select('id, mnemonico'),
    supabase.from('programa_apelidos').select('programa_id, texto'),
    lerPaginado<{ formato: string; categoria: string }>((de, ate) =>
      supabase.from('formatos').select('formato, categoria').range(de, ate),
    ),
  ])

  if (nacionais.error || regionais.error) {
    return { ...vazio, erro: 'Não foi possível conferir as ações já vendidas nestas datas.' }
  }

  const indice = montarIndice(programas.data ?? [], apelidos.data ?? [])
  const mapaDeFormatos = montarMapa(leituraDeFormatos.linhas)

  const nacionaisDoPrograma = (nacionais.data ?? []).filter(
    (linha) =>
      encontrarProgramaId(linha.programa, indice) === programaId &&
      ocupaSlot(linha.formato, mapaDeFormatos),
  )

  const datasAfetadas = [
    ...new Set([
      ...nacionaisDoPrograma.map((linha) => linha.data_de_exibicao),
      ...(regionais.data ?? []).map((linha) => linha.data_de_exibicao),
    ]),
  ].sort()

  return {
    nacionais: nacionaisDoPrograma.length,
    regionais: (regionais.data ?? []).length,
    datasAfetadas,
    erro: null,
  }
}

/** Remove um único bloqueio de data — a linha "Desbloquear" da listagem. */
export async function desbloquearData(programaId: string, data: string): Promise<{ erro: string | null }> {
  const sessao = await obterSessao()
  if (!sessao) return { erro: ERRO_SESSAO_EXPIRADA }
  if (!podeEditarPrograma(sessao.perfis, sessao.programasVinculados, programaId)) {
    return { erro: ERRO_SEM_PERMISSAO }
  }

  const supabase = await criarClienteServidor()

  const { error, count } = await supabase
    .from('datas_bloqueadas')
    .delete({ count: 'exact' })
    .eq('programa_id', programaId)
    .eq('data', data)

  if (error) return { erro: `Não foi possível desbloquear a data. Detalhe técnico: ${error.message}` }

  // DELETE barrado pelo RLS volta sem erro e sem linhas — sem conferir, a
  // tela diria "desbloqueada" com o registro ainda no banco.
  if (!count) return { erro: 'O banco não deixou desbloquear. Confira sua permissão neste programa.' }

  revalidatePath(`/configuracoes/programas/${programaId}/datas`)
  return { erro: null }
}

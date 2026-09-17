import { criarClienteServidor } from '../supabase/cliente-servidor'
import {
  ordenarSlidesDoModelo,
  type ModalidadeDoModelo,
  type SlideDoModeloDeProposta,
} from '../dominio/modelo-proposta'

export type {
  ModalidadeDoModelo,
  SecaoDoModeloDeProposta,
  SlideDoModeloDeProposta,
} from '../dominio/modelo-proposta'

/**
 * Sem `modalidade`, devolve os dois conjuntos juntos (nacional + regional) —
 * é o que a tela de edição do modelo precisa, já que administra ambos ao
 * mesmo tempo. Passar `modalidade` filtra no servidor: é o caminho usado na
 * hora de gerar o PDF de uma proposta de verdade, que só pode enxergar o
 * modelo da própria modalidade.
 */
export async function listarSlidesDoModelo(
  programaId: string,
  modalidade?: ModalidadeDoModelo,
): Promise<SlideDoModeloDeProposta[]> {
  const supabase = await criarClienteServidor()
  let consulta = supabase
    .from('programa_modelo_slides')
    .select('id, programa_id, imagem_url, secao, modalidade, ordem, criado_em, atualizado_em')
    .eq('programa_id', programaId)
  if (modalidade) consulta = consulta.eq('modalidade', modalidade)

  const { data, error } = await consulta

  if (error) {
    console.error('Falha ao listar slides do modelo de proposta:', error.message)
    return []
  }

  return ordenarSlidesDoModelo((data ?? []) as SlideDoModeloDeProposta[])
}

export const SECOES_DO_MODELO = [
  'capa',
  'conteudo',
  'digital',
  'redes_sociais',
  'valor',
  'observacoes',
  'contracapa',
] as const

export type SecaoDoModeloDeProposta = (typeof SECOES_DO_MODELO)[number]

/** Nacional e regional têm modelos independentes — ver R (modelo de proposta regional). */
export type ModalidadeDoModelo = 'nacional' | 'regional'

export type SlideDoModeloDeProposta = {
  id: string
  programa_id: string
  imagem_url: string
  secao: SecaoDoModeloDeProposta
  modalidade: ModalidadeDoModelo
  ordem: number
  criado_em: string
  atualizado_em: string
}

const ORDEM_DAS_SECOES = new Map<SecaoDoModeloDeProposta, number>(
  SECOES_DO_MODELO.map((secao, indice) => [secao, indice] as const),
)

export function ordenarSlidesDoModelo(
  slides: SlideDoModeloDeProposta[],
): SlideDoModeloDeProposta[] {
  return [...slides].sort((a, b) => {
    const secaoA = ORDEM_DAS_SECOES.get(a.secao) ?? 99
    const secaoB = ORDEM_DAS_SECOES.get(b.secao) ?? 99
    if (secaoA !== secaoB) return secaoA - secaoB
    if (a.ordem !== b.ordem) return a.ordem - b.ordem
    return a.criado_em.localeCompare(b.criado_em)
  })
}

export function slidesDaSecao(
  slides: SlideDoModeloDeProposta[],
  secao: SecaoDoModeloDeProposta,
  modalidade: ModalidadeDoModelo,
): SlideDoModeloDeProposta[] {
  return ordenarSlidesDoModelo(
    slides.filter((slide) => slide.secao === secao && slide.modalidade === modalidade),
  )
}

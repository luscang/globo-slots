import { normalizarNome } from './texto'

export type ClienteParaCarteira = {
  executivo_linear_360: string | null
  executivo_digital: string | null
}

/**
 * Um cliente fica visível para um executivo quando o nome dele bate com
 * Executivo Linear (360) OU Executivo Digital do cliente — as duas colunas
 * da Carteira Siscom que carregam responsáveis. Comparação normalizada
 * (maiúsculas, sem acento) porque o mesmo nome pode vir grafado de formas
 * diferentes entre a Carteira Siscom e o Cadastro Executivo.
 */
export function clienteNaCarteiraDoExecutivo(
  cliente: ClienteParaCarteira,
  nomeDoExecutivo: string | null,
): boolean {
  const alvo = normalizarNome(nomeDoExecutivo)
  if (alvo === '') return false
  return (
    normalizarNome(cliente.executivo_linear_360) === alvo ||
    normalizarNome(cliente.executivo_digital) === alvo
  )
}

'use server'

import { revalidatePath } from 'next/cache'
import { criarClienteServidor } from '../supabase/cliente-servidor'
import { obterSessao } from '../sessao-servidor'
import { temPerfil } from '../dominio/perfis'

const BUCKET = 'oportunidades'

function caminhoDaImagem(url: string | null) {
  if (!url) return null
  const marcador = `/storage/v1/object/public/${BUCKET}/`
  const indice = url.indexOf(marcador)
  if (indice < 0) return null
  try {
    return decodeURIComponent(url.slice(indice + marcador.length))
  } catch {
    return url.slice(indice + marcador.length)
  }
}

export async function excluirOportunidade(id: string): Promise<{ ok: boolean; erro?: string }> {
  const sessao = await obterSessao()
  if (!sessao) return { ok: false, erro: 'Sua sessão expirou. Entre novamente.' }

  if (!temPerfil(sessao.perfis, 'consultor_programa')) {
    return { ok: false, erro: 'Somente PO do produto pode excluir oportunidades.' }
  }

  const oportunidadeId = id.trim()
  if (!oportunidadeId) return { ok: false, erro: 'Oportunidade não informada.' }

  const supabase = await criarClienteServidor()
  const atual = await supabase
    .from('oportunidades')
    .select('id, programa_id, imagem_url')
    .eq('id', oportunidadeId)
    .maybeSingle()

  if (atual.error || !atual.data) return { ok: false, erro: 'Oportunidade não encontrada.' }
  if (!sessao.programasVinculados.includes(atual.data.programa_id)) {
    return { ok: false, erro: 'Você não é o PO do produto responsável por este programa.' }
  }

  const exclusao = await supabase
    .from('oportunidades')
    .delete()
    .eq('id', oportunidadeId)

  if (exclusao.error) return { ok: false, erro: `Não foi possível excluir: ${exclusao.error.message}` }

  const caminho = caminhoDaImagem(atual.data.imagem_url)
  if (caminho) {
    const remocaoImagem = await supabase.storage.from(BUCKET).remove([caminho])
    if (remocaoImagem.error) console.warn('Oportunidade excluída, mas a imagem não pôde ser removida:', remocaoImagem.error.message)
  }

  revalidatePath('/oportunidades')
  revalidatePath('/calendario')
  return { ok: true }
}

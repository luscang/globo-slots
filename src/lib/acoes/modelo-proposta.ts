'use server'

import { revalidatePath } from 'next/cache'
import { criarClienteServidor } from '../supabase/cliente-servidor'
import { obterSessao } from '../sessao-servidor'
import { podeEditarPrograma, type Perfil } from '../dominio/perfis'
import type { ModalidadeDoModelo, SecaoDoModeloDeProposta } from '../dados/modelo-proposta'

const BUCKET = 'programas'
const TAMANHO_MAXIMO_BYTES = 8 * 1024 * 1024
const SECOES_DE_SLIDE_UNICO = new Set<SecaoDoModeloDeProposta>(['capa', 'valor', 'contracapa'])
const SECOES_VALIDAS = new Set<SecaoDoModeloDeProposta>([
  'capa', 'conteudo', 'digital', 'redes_sociais', 'valor', 'observacoes', 'contracapa',
])
const MODALIDADES_VALIDAS = new Set<ModalidadeDoModelo>(['nacional', 'regional'])

type SlideBasico = {
  id: string
  ordem: number
  secao: SecaoDoModeloDeProposta
  modalidade: ModalidadeDoModelo
  imagem_url?: string
}

function autorizado(
  perfis: Perfil[],
  programasVinculados: string[],
  programaId: string,
): boolean {
  return podeEditarPrograma(perfis, programasVinculados, programaId)
}

function extensaoDe(nome: string): 'png' | 'jpg' {
  return nome.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
}

function caminhoPublicoDaUrl(url: string): string | null {
  const marcador = `/storage/v1/object/public/${BUCKET}/`
  const indice = url.indexOf(marcador)
  if (indice < 0) return null
  return decodeURIComponent(url.slice(indice + marcador.length))
}

function secaoValida(valor: string): valor is SecaoDoModeloDeProposta {
  return SECOES_VALIDAS.has(valor as SecaoDoModeloDeProposta)
}

function modalidadeValida(valor: string): valor is ModalidadeDoModelo {
  return MODALIDADES_VALIDAS.has(valor as ModalidadeDoModelo)
}

function validarArquivos(arquivos: File[]): string | null {
  if (arquivos.length === 0) return 'Escolha uma ou mais imagens para adicionar.'
  for (const arquivo of arquivos) {
    if (!['image/png', 'image/jpeg'].includes(arquivo.type)) {
      return `O arquivo “${arquivo.name}” não é PNG ou JPG.`
    }
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
      return `O arquivo “${arquivo.name}” passa de 8 MB. Reduza a imagem e tente de novo.`
    }
  }
  return null
}

export async function adicionarSlidesAoModelo(
  programaId: string,
  secaoInformada: string,
  modalidadeInformada: string,
  formulario: FormData,
): Promise<{ erro: string | null; adicionados: number }> {
  const sessao = await obterSessao()
  if (!sessao) return { erro: 'Sua sessão expirou. Entre de novo.', adicionados: 0 }
  if (!autorizado(sessao.perfis, sessao.programasVinculados, programaId)) {
    return { erro: 'Você não tem permissão para alterar o modelo deste programa.', adicionados: 0 }
  }
  if (!secaoValida(secaoInformada)) {
    return { erro: 'Seção de proposta inválida.', adicionados: 0 }
  }
  if (!modalidadeValida(modalidadeInformada)) {
    return { erro: 'Modalidade de proposta inválida.', adicionados: 0 }
  }

  const secao = secaoInformada
  const modalidade = modalidadeInformada
  const arquivos = formulario
    .getAll('arquivos')
    .filter((item): item is File => item instanceof File && item.size > 0)

  const erroArquivos = validarArquivos(arquivos)
  if (erroArquivos) return { erro: erroArquivos, adicionados: 0 }

  if (SECOES_DE_SLIDE_UNICO.has(secao) && arquivos.length > 1) {
    return {
      erro: 'Capa, Valor e Contracapa aceitam uma imagem por vez. Selecione apenas um arquivo.',
      adicionados: 0,
    }
  }

  const supabase = await criarClienteServidor()
  const uploads: Array<{ caminho: string; url: string }> = []

  for (const arquivo of arquivos) {
    const caminho = `modelos/${programaId}/${modalidade}/${secao}/${crypto.randomUUID()}.${extensaoDe(arquivo.name)}`
    const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
      contentType: arquivo.type,
      upsert: false,
    })

    if (erroUpload) {
      if (uploads.length > 0) await supabase.storage.from(BUCKET).remove(uploads.map((item) => item.caminho))
      return { erro: `Não foi possível enviar “${arquivo.name}”: ${erroUpload.message}`, adicionados: 0 }
    }

    const { data: publico } = supabase.storage.from(BUCKET).getPublicUrl(caminho)
    uploads.push({ caminho, url: publico.publicUrl })
  }

  if (SECOES_DE_SLIDE_UNICO.has(secao)) {
    const { data: existente } = await supabase
      .from('programa_modelo_slides')
      .select('id, imagem_url')
      .eq('programa_id', programaId)
      .eq('secao', secao)
      .eq('modalidade', modalidade)
      .maybeSingle()

    if (existente?.id) {
      const { error: erroAtualizar } = await supabase
        .from('programa_modelo_slides')
        .update({ imagem_url: uploads[0].url, ordem: 1, atualizado_em: new Date().toISOString() })
        .eq('id', existente.id)
        .eq('programa_id', programaId)

      if (erroAtualizar) {
        await supabase.storage.from(BUCKET).remove([uploads[0].caminho])
        return { erro: `Não foi possível substituir o slide: ${erroAtualizar.message}`, adicionados: 0 }
      }

      const caminhoAntigo = existente.imagem_url ? caminhoPublicoDaUrl(existente.imagem_url) : null
      if (caminhoAntigo) await supabase.storage.from(BUCKET).remove([caminhoAntigo])
    } else {
      const { error: erroRegistro } = await supabase.from('programa_modelo_slides').insert({
        programa_id: programaId,
        imagem_url: uploads[0].url,
        secao,
        modalidade,
        ordem: 1,
      })
      if (erroRegistro) {
        await supabase.storage.from(BUCKET).remove([uploads[0].caminho])
        return { erro: `Não foi possível adicionar o slide: ${erroRegistro.message}`, adicionados: 0 }
      }
    }
  } else {
    const { data: ultimo } = await supabase
      .from('programa_modelo_slides')
      .select('ordem')
      .eq('programa_id', programaId)
      .eq('secao', secao)
      .eq('modalidade', modalidade)
      .order('ordem', { ascending: false })
      .limit(1)
      .maybeSingle()

    const primeiraOrdem = (ultimo?.ordem ?? 0) + 1
    const registros = uploads.map((upload, indice) => ({
      programa_id: programaId,
      imagem_url: upload.url,
      secao,
      modalidade,
      ordem: primeiraOrdem + indice,
    }))

    const { error: erroRegistro } = await supabase.from('programa_modelo_slides').insert(registros)
    if (erroRegistro) {
      await supabase.storage.from(BUCKET).remove(uploads.map((item) => item.caminho))
      return { erro: `Não foi possível adicionar os slides: ${erroRegistro.message}`, adicionados: 0 }
    }
  }

  revalidatePath(`/configuracoes/programas/${programaId}/modelo`)
  return { erro: null, adicionados: uploads.length }
}

export async function moverSlideDoModelo(
  programaId: string,
  slideId: string,
  direcao: 'subir' | 'descer',
): Promise<{ erro: string | null }> {
  const sessao = await obterSessao()
  if (!sessao) return { erro: 'Sua sessão expirou. Entre de novo.' }
  if (!autorizado(sessao.perfis, sessao.programasVinculados, programaId)) {
    return { erro: 'Você não tem permissão para alterar o modelo deste programa.' }
  }

  const supabase = await criarClienteServidor()
  const { data: atual, error: erroAtual } = await supabase
    .from('programa_modelo_slides')
    .select('id, ordem, secao, modalidade')
    .eq('id', slideId)
    .eq('programa_id', programaId)
    .maybeSingle()

  if (erroAtual || !atual) return { erro: 'Slide não encontrado.' }
  const secao = atual.secao as SecaoDoModeloDeProposta
  if (SECOES_DE_SLIDE_UNICO.has(secao)) return { erro: null }

  const { data, error } = await supabase
    .from('programa_modelo_slides')
    .select('id, ordem, secao, modalidade')
    .eq('programa_id', programaId)
    .eq('secao', secao)
    .eq('modalidade', atual.modalidade)
    .order('ordem', { ascending: true })
    .order('criado_em', { ascending: true })

  if (error) return { erro: 'Não foi possível carregar a ordem dos slides.' }
  const slides = (data ?? []) as SlideBasico[]
  const indice = slides.findIndex((slide) => slide.id === slideId)
  if (indice < 0) return { erro: 'Slide não encontrado.' }

  const destino = direcao === 'subir' ? indice - 1 : indice + 1
  if (destino < 0 || destino >= slides.length) return { erro: null }

  const novaOrdem = [...slides]
  ;[novaOrdem[indice], novaOrdem[destino]] = [novaOrdem[destino], novaOrdem[indice]]

  for (let i = 0; i < novaOrdem.length; i += 1) {
    const { error: erroAtualizar } = await supabase
      .from('programa_modelo_slides')
      .update({ ordem: i + 1, atualizado_em: new Date().toISOString() })
      .eq('id', novaOrdem[i].id)
      .eq('programa_id', programaId)
    if (erroAtualizar) return { erro: 'Não foi possível reordenar os slides.' }
  }

  revalidatePath(`/configuracoes/programas/${programaId}/modelo`)
  return { erro: null }
}

export async function removerSlideDoModelo(
  programaId: string,
  slideId: string,
): Promise<{ erro: string | null }> {
  const sessao = await obterSessao()
  if (!sessao) return { erro: 'Sua sessão expirou. Entre de novo.' }
  if (!autorizado(sessao.perfis, sessao.programasVinculados, programaId)) {
    return { erro: 'Você não tem permissão para alterar o modelo deste programa.' }
  }

  const supabase = await criarClienteServidor()
  const { data: slide } = await supabase
    .from('programa_modelo_slides')
    .select('imagem_url, secao, modalidade')
    .eq('id', slideId)
    .eq('programa_id', programaId)
    .maybeSingle()

  const { error } = await supabase
    .from('programa_modelo_slides')
    .delete()
    .eq('id', slideId)
    .eq('programa_id', programaId)

  if (error) return { erro: 'Não foi possível remover o slide.' }

  const caminho = slide?.imagem_url ? caminhoPublicoDaUrl(slide.imagem_url) : null
  if (caminho) await supabase.storage.from(BUCKET).remove([caminho])

  const secao = slide?.secao as SecaoDoModeloDeProposta | undefined
  if (secao && !SECOES_DE_SLIDE_UNICO.has(secao)) {
    const { data: restantes } = await supabase
      .from('programa_modelo_slides')
      .select('id, ordem, secao, modalidade')
      .eq('programa_id', programaId)
      .eq('secao', secao)
      .eq('modalidade', slide?.modalidade ?? 'nacional')
      .order('ordem', { ascending: true })
      .order('criado_em', { ascending: true })

    const itensRestantes = (restantes ?? []) as SlideBasico[]
    for (let i = 0; i < itensRestantes.length; i += 1) {
      await supabase
        .from('programa_modelo_slides')
        .update({ ordem: i + 1, atualizado_em: new Date().toISOString() })
        .eq('id', itensRestantes[i].id)
    }
  }

  revalidatePath(`/configuracoes/programas/${programaId}/modelo`)
  return { erro: null }
}

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'
import type { ResumoFinanceiroDaProposta } from '../dominio/resumo-financeiro'
import { PRACAS } from '../dominio/regional'
import { descreverAcaoDaProposta } from '../dominio/texto-proposta'
import { deveExibirClienteComMarca, nomePrincipalDaProposta } from '../dominio/exibicao-marca-cliente'
import {
  slidesDaSecao,
  type SlideDoModeloDeProposta,
} from '../dominio/modelo-proposta'

const LARGURA = 960
const ALTURA = 540
const ROSA = rgb(0.96, 0.04, 0.42)
const TEXTO = rgb(0.22, 0.19, 0.23)
const CINZA = rgb(0.57, 0.55, 0.59)
const LINHA = rgb(0.88, 0.87, 0.89)
const BRANCO = rgb(1, 1, 1)

const X_ESQUERDA = 88
const LARGURA_ESQUERDA = 310
const X_FINANCEIRO = 515
const X_VALOR = 842
const LARGURA_FINANCEIRO = X_VALOR - X_FINANCEIRO

const ARQUIVOS_GLOBOTIPO = {
  corporativaRegular: 'GlobotipoCorporativa-Regular.ttf',
  corporativaBold: 'GlobotipoCorporativa-Bold.ttf',
  textosRegular: 'GlobotipoCorporativaTextos-Regular.ttf',
  textosBold: 'GlobotipoCorporativaTextos-Bold.ttf',
} as const

type FontesDaProposta = {
  titulo: PDFFont
  tituloNegrito: PDFFont
  texto: PDFFont
  textoNegrito: PDFFont
}

type LinhaFinanceira = {
  rotulo: string
  valor: number
  destaque?: boolean
}

function moeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

async function carregarFontesDaProposta(pdf: PDFDocument): Promise<FontesDaProposta> {
  try {
    pdf.registerFontkit(fontkit)
    // Fontes corporativas usadas exclusivamente no servidor para composição
    // do PDF. Mantidas fora de /public para não serem expostas como assets HTTP.
    const pasta = path.join(process.cwd(), 'assets', 'fonts')
    const [corporativaRegular, corporativaBold, textosRegular, textosBold] = await Promise.all([
      readFile(path.join(pasta, ARQUIVOS_GLOBOTIPO.corporativaRegular)),
      readFile(path.join(pasta, ARQUIVOS_GLOBOTIPO.corporativaBold)),
      readFile(path.join(pasta, ARQUIVOS_GLOBOTIPO.textosRegular)),
      readFile(path.join(pasta, ARQUIVOS_GLOBOTIPO.textosBold)),
    ])

    const [titulo, tituloNegrito, texto, textoNegrito] = await Promise.all([
      pdf.embedFont(corporativaRegular, { subset: true }),
      pdf.embedFont(corporativaBold, { subset: true }),
      pdf.embedFont(textosRegular, { subset: true }),
      pdf.embedFont(textosBold, { subset: true }),
    ])

    return { titulo, tituloNegrito, texto, textoNegrito }
  } catch (erro) {
    console.error('Falha ao carregar Globotipo Corporativa; usando fonte de contingência.', erro)
    const [regular, negrito] = await Promise.all([
      pdf.embedFont(StandardFonts.Helvetica),
      pdf.embedFont(StandardFonts.HelveticaBold),
    ])
    return {
      titulo: regular,
      tituloNegrito: negrito,
      texto: regular,
      textoNegrito: negrito,
    }
  }
}

async function carregarImagemDoSlide(pdf: PDFDocument, slide: SlideDoModeloDeProposta) {
  let resposta: Response
  try {
    resposta = await fetch(slide.imagem_url, { cache: 'no-store' })
  } catch {
    throw new Error('Não foi possível carregar uma imagem do modelo de proposta.')
  }
  if (!resposta.ok) {
    throw new Error('Não foi possível carregar uma imagem do modelo de proposta.')
  }

  const bytes = new Uint8Array(await resposta.arrayBuffer())
  const tipo = resposta.headers.get('content-type')?.toLowerCase() ?? ''
  return tipo.includes('png') || slide.imagem_url.toLowerCase().includes('.png')
    ? pdf.embedPng(bytes)
    : pdf.embedJpg(bytes)
}

async function adicionarSlideImagem(
  pdf: PDFDocument,
  slide: SlideDoModeloDeProposta,
): Promise<PDFPage> {
  const imagem = await carregarImagemDoSlide(pdf, slide)
  const pagina = pdf.addPage([LARGURA, ALTURA])
  pagina.drawRectangle({ x: 0, y: 0, width: LARGURA, height: ALTURA, color: rgb(1, 1, 1) })

  const escala = Math.min(LARGURA / imagem.width, ALTURA / imagem.height)
  const largura = imagem.width * escala
  const altura = imagem.height * escala
  pagina.drawImage(imagem, {
    x: (LARGURA - largura) / 2,
    y: (ALTURA - altura) / 2,
    width: largura,
    height: altura,
  })

  return pagina
}

async function novaPaginaDeValor(
  pdf: PDFDocument,
  fundo: SlideDoModeloDeProposta | undefined,
): Promise<PDFPage> {
  if (fundo) return adicionarSlideImagem(pdf, fundo)

  const pagina = pdf.addPage([LARGURA, ALTURA])
  pagina.drawRectangle({ x: 0, y: 0, width: LARGURA, height: ALTURA, color: rgb(1, 0.02, 0.47) })
  pagina.drawRectangle({ x: 54, y: 58, width: 365, height: 410, color: rgb(1, 1, 1) })
  pagina.drawRectangle({ x: 452, y: 92, width: 430, height: 350, color: rgb(1, 1, 1) })
  return pagina
}

function quebrarLinhas(texto: string, fonte: PDFFont, tamanho: number, larguraMaxima: number): string[] {
  const paragrafos = texto.split(/\r?\n/).map((paragrafo) => paragrafo.replace(/\s+/g, ' ').trim())
  const linhas: string[] = []

  for (const paragrafo of paragrafos) {
    if (!paragrafo) {
      linhas.push('')
      continue
    }
    const palavras = paragrafo.split(' ').filter(Boolean)
    let atual = ''
    for (const palavra of palavras) {
      const candidata = atual ? `${atual} ${palavra}` : palavra
      if (fonte.widthOfTextAtSize(candidata, tamanho) <= larguraMaxima) {
        atual = candidata
      } else {
        if (atual) linhas.push(atual)
        atual = palavra
      }
    }
    if (atual) linhas.push(atual)
  }

  return linhas
}

function escreverBloco(params: {
  pagina: PDFPage
  texto: string
  fonte: PDFFont
  tamanho: number
  x: number
  y: number
  largura: number
  entrelinhas?: number
  maxLinhas?: number
  cor?: ReturnType<typeof rgb>
}): number {
  const entrelinhas = params.entrelinhas ?? params.tamanho * 1.35
  const linhas = quebrarLinhas(params.texto, params.fonte, params.tamanho, params.largura)
  const maxLinhas = params.maxLinhas ?? linhas.length
  const visiveis = linhas.slice(0, maxLinhas)

  if (linhas.length > maxLinhas && visiveis.length > 0) {
    const ultima = visiveis.length - 1
    const base = visiveis[ultima]
    let reduzida = base
    while (
      reduzida.length > 0
      && params.fonte.widthOfTextAtSize(`${reduzida}…`, params.tamanho) > params.largura
    ) {
      reduzida = reduzida.slice(0, -1)
    }
    visiveis[ultima] = `${reduzida.trimEnd()}…`
  }

  visiveis.forEach((linha, indice) => {
    params.pagina.drawText(linha, {
      x: params.x,
      y: params.y - indice * entrelinhas,
      size: params.tamanho,
      font: params.fonte,
      color: params.cor ?? TEXTO,
    })
  })

  return params.y - visiveis.length * entrelinhas
}

async function adicionarCapasDaProposta(params: {
  pdf: PDFDocument
  fontes: FontesDaProposta
  slides: SlideDoModeloDeProposta[]
  marcaNome: string | null
  clienteNome: string
}) {
  const marca = nomePrincipalDaProposta(params.marcaNome, params.clienteNome)
  const cliente = params.clienteNome.trim()
  const exibirCliente = deveExibirClienteComMarca(params.marcaNome, params.clienteNome)

  for (const [indice, slide] of params.slides.entries()) {
    const pagina = await adicionarSlideImagem(params.pdf, slide)
    if (indice !== 0) continue

    // Posição baseada no template 16:9 aprovado: bloco textual no terço
    // esquerdo, preservando a fotografia e os elementos gráficos da capa.
    const depoisMarca = escreverBloco({
      pagina,
      texto: marca,
      fonte: params.fontes.textoNegrito,
      tamanho: 40,
      x: 20,
      y: 330,
      largura: 475,
      entrelinhas: 46,
      maxLinhas: 2,
      cor: BRANCO,
    })

    if (exibirCliente) {
      escreverBloco({
        pagina,
        texto: cliente,
        fonte: params.fontes.texto,
        tamanho: 16,
        x: 20,
        y: Math.min(286, depoisMarca - 10),
        largura: 475,
        entrelinhas: 20,
        maxLinhas: 2,
        cor: BRANCO,
      })
    }
  }
}

function rotulo(pagina: PDFPage, fonte: PDFFont, texto: string, x: number, y: number) {
  pagina.drawText(texto.toUpperCase(), {
    x,
    y,
    size: 9.4,
    font: fonte,
    color: CINZA,
  })
}

function linhaDeValor(params: {
  pagina: PDFPage
  fonte: PDFFont
  negrito: PDFFont
  rotulo: string
  valor: number
  y: number
  destaque?: boolean
  separadorApos?: boolean
}) {
  const fonteRotulo = params.destaque ? params.negrito : params.fonte
  const fonteValor = params.destaque ? params.negrito : params.fonte
  const tamanho = params.destaque ? 12.6 : 10.2
  const valor = moeda(params.valor)

  params.pagina.drawText(params.rotulo, {
    x: X_FINANCEIRO,
    y: params.y,
    size: tamanho,
    font: fonteRotulo,
    color: params.destaque ? TEXTO : CINZA,
  })
  params.pagina.drawText(valor, {
    x: X_VALOR - fonteValor.widthOfTextAtSize(valor, tamanho),
    y: params.y,
    size: tamanho,
    font: fonteValor,
    color: ROSA,
  })

  params.pagina.drawLine({
    start: { x: X_FINANCEIRO, y: params.y - 8 },
    end: { x: X_VALOR, y: params.y - 8 },
    thickness: params.separadorApos ? 1.35 : params.destaque ? 0.9 : 0.55,
    color: LINHA,
  })
}

function rotuloVisualDaPraca(codigo: string): string {
  return codigo === 'PE1' ? 'PE' : codigo
}

function linhasDeMidiaRegional(resumo: ResumoFinanceiroDaProposta): LinhaFinanceira[] {
  const totais = new Map<string, number>()

  for (const linha of resumo.linhas) {
    for (const detalhe of linha.detalhe_pracas) {
      totais.set(
        detalhe.praca_codigo,
        (totais.get(detalhe.praca_codigo) ?? 0) + detalhe.midia_tv,
      )
    }
  }

  return PRACAS
    .filter((praca) => (totais.get(praca) ?? 0) > 0)
    .map((praca) => ({
      rotulo: `Mídia ${rotuloVisualDaPraca(praca)}`,
      valor: totais.get(praca) ?? 0,
    }))
}

function linhasFinanceirasPrincipais(
  resumo: ResumoFinanceiroDaProposta,
  modalidade: 'nacional' | 'regional',
): LinhaFinanceira[] {
  const linhasDeMidia = modalidade === 'regional'
    ? linhasDeMidiaRegional(resumo)
    : [{ rotulo: 'Mídia', valor: resumo.midia_tv }]

  // Fallback defensivo para snapshots antigos que ainda não tenham
  // `detalhe_pracas`, sem perder o valor total de mídia no PDF.
  const midia = linhasDeMidia.length > 0
    ? linhasDeMidia
    : [{ rotulo: 'Mídia', valor: resumo.midia_tv }]

  return [
    ...midia,
    resumo.incluir_digital && resumo.midia_digital > 0
      ? { rotulo: 'Digital', valor: resumo.midia_digital }
      : null,
    resumo.incluir_redes_sociais && resumo.redes_sociais > 0
      ? { rotulo: 'Redes Sociais', valor: resumo.redes_sociais }
      : null,
    resumo.simulcast > 0
      ? { rotulo: 'Globoplay Simulcast', valor: resumo.simulcast }
      : null,
    { rotulo: 'Total', valor: resumo.total_comercial, destaque: true },
  ].filter((linha): linha is LinhaFinanceira => Boolean(linha))
}

function linhasFinanceirasSecundarias(resumo: ResumoFinanceiroDaProposta): LinhaFinanceira[] {
  return [
    resumo.direitos_tv > 0
      ? { rotulo: 'Direitos e Conexos', valor: resumo.direitos_tv }
      : null,
    resumo.incluir_digital && resumo.direitos_digital > 0
      ? { rotulo: 'Direitos e Conexos Digital', valor: resumo.direitos_digital }
      : null,
    resumo.producao_tv > 0
      ? { rotulo: 'Custo de Produção', valor: resumo.producao_tv }
      : null,
    resumo.incluir_digital && resumo.producao_digital > 0
      ? { rotulo: 'Custo de Produção Digital', valor: resumo.producao_digital }
      : null,
    resumo.incluir_redes_sociais && resumo.producao_redes_sociais > 0
      ? { rotulo: 'Produção Redes Sociais', valor: resumo.producao_redes_sociais }
      : null,
  ].filter((linha): linha is LinhaFinanceira => Boolean(linha))
}

function condicoesEspeciais(resumo: ResumoFinanceiroDaProposta): string[] {
  const mapa = new Map<string, string>()
  for (const linha of resumo.linhas) {
    if (!linha.periodo_especial_nome) continue
    const chave = `${linha.periodo_especial_nome}|${linha.periodo_especial_percentual}|${linha.periodo_especial_texto ?? ''}`
    const texto = linha.periodo_especial_texto?.trim()
      || `${linha.periodo_especial_nome} · +${linha.periodo_especial_percentual}% sobre a mídia`
    mapa.set(chave, texto)
  }
  return [...mapa.values()]
}

function renderizarBlocoFinanceiro(params: {
  pagina: PDFPage
  fontes: FontesDaProposta
  resumo: ResumoFinanceiroDaProposta
  modalidade: 'nacional' | 'regional'
}): number {
  const principais = linhasFinanceirasPrincipais(params.resumo, params.modalidade)
  const secundarias = linhasFinanceirasSecundarias(params.resumo)
  const quantidadeDeLinhas = principais.length + secundarias.length
  const layoutDenso = quantidadeDeLinhas >= 12
  const passoPrincipal = layoutDenso ? 21 : quantidadeDeLinhas >= 9 ? 25 : 29
  const passoSecundario = layoutDenso ? 18 : quantidadeDeLinhas >= 9 ? 21 : 24
  const indiceTotal = principais.findIndex((linha) => linha.destaque)

  let y = 370
  for (const [indice, linha] of principais.entries()) {
    const separadorApos = indice === indiceTotal - 1
    linhaDeValor({
      pagina: params.pagina,
      fonte: params.fontes.texto,
      negrito: params.fontes.textoNegrito,
      rotulo: linha.rotulo,
      valor: linha.valor,
      y,
      destaque: linha.destaque,
      separadorApos,
    })

    if (linha.destaque) {
      y -= passoPrincipal + (layoutDenso ? 11 : 16)
    } else if (separadorApos) {
      y -= passoPrincipal + (layoutDenso ? 4 : 7)
    } else {
      y -= passoPrincipal
    }
  }

  if (secundarias.length > 0) y -= layoutDenso ? 4 : 8

  for (const linha of secundarias) {
    linhaDeValor({
      pagina: params.pagina,
      fonte: params.fontes.texto,
      negrito: params.fontes.textoNegrito,
      rotulo: linha.rotulo,
      valor: linha.valor,
      y,
    })
    y -= passoSecundario
  }

  return y
}

function renderizarCondicaoEspecial(params: {
  pagina: PDFPage
  fontes: FontesDaProposta
  condicoes: string[]
  yDepoisDosCustos: number
}) {
  if (params.condicoes.length === 0) return

  const ySeparador = Math.max(76, params.yDepoisDosCustos - 2)
  params.pagina.drawLine({
    start: { x: X_FINANCEIRO, y: ySeparador },
    end: { x: X_VALOR, y: ySeparador },
    thickness: 0.8,
    color: LINHA,
  })

  params.pagina.drawText('CONDIÇÃO ESPECIAL', {
    x: X_FINANCEIRO,
    y: ySeparador - 18,
    size: 7.8,
    font: params.fontes.textoNegrito,
    color: ROSA,
  })

  escreverBloco({
    pagina: params.pagina,
    texto: params.condicoes.join(' · '),
    fonte: params.fontes.texto,
    tamanho: 8.3,
    x: X_FINANCEIRO,
    y: ySeparador - 34,
    largura: LARGURA_FINANCEIRO,
    entrelinhas: 11,
    maxLinhas: 3,
    cor: TEXTO,
  })
}

async function adicionarPropostaComercial(params: {
  pdf: PDFDocument
  fontes: FontesDaProposta
  fundo?: SlideDoModeloDeProposta
  marcaNome: string | null
  clienteNome: string
  programaNome: string
  objetivo: string
  modalidade: 'nacional' | 'regional'
  resumo: ResumoFinanceiroDaProposta
}) {
  const pagina = await novaPaginaDeValor(params.pdf, params.fundo)
  const marca = nomePrincipalDaProposta(params.marcaNome, params.clienteNome)
  const anunciante = params.clienteNome.trim()
  const exibirCliente = deveExibirClienteComMarca(params.marcaNome, params.clienteNome)
  const textoAcao = descreverAcaoDaProposta({
    programaNome: params.programaNome,
    modalidade: params.modalidade,
    itens: params.resumo.linhas.map((linha) => ({
      data: linha.data,
      quantidade: linha.quantidade,
      pracas: linha.pracas,
    })),
    incluirDigital: params.resumo.incluir_digital,
    incluirRedesSociais: params.resumo.incluir_redes_sociais,
  })

  // Marca é o identificador comercial principal. O anunciante oficial só é
  // repetido quando acrescenta informação, evitando redundância no slide.
  rotulo(pagina, params.fontes.textoNegrito, 'Marca', X_ESQUERDA, 438)
  escreverBloco({
    pagina,
    texto: marca,
    fonte: params.fontes.tituloNegrito,
    tamanho: 21,
    x: X_ESQUERDA,
    y: 416,
    largura: LARGURA_ESQUERDA,
    entrelinhas: 24,
    maxLinhas: 2,
    cor: ROSA,
  })

  let yConteudo = 348

  if (exibirCliente) {
    rotulo(pagina, params.fontes.textoNegrito, 'Anunciante', X_ESQUERDA, 382)
    escreverBloco({
      pagina,
      texto: anunciante,
      fonte: params.fontes.textoNegrito,
      tamanho: 13.8,
      x: X_ESQUERDA,
      y: 358,
      largura: LARGURA_ESQUERDA,
      entrelinhas: 17,
      maxLinhas: 2,
      cor: ROSA,
    })
    yConteudo = 306
  }

  rotulo(pagina, params.fontes.textoNegrito, 'Conteúdo', X_ESQUERDA, yConteudo)
  const depoisConteudo = escreverBloco({
    pagina,
    texto: textoAcao,
    fonte: params.fontes.texto,
    tamanho: 12,
    x: X_ESQUERDA,
    y: yConteudo - 23,
    largura: LARGURA_ESQUERDA,
    entrelinhas: 16.8,
    maxLinhas: 5,
    cor: ROSA,
  })

  const limiteObjetivo = exibirCliente ? 194 : 244
  const yObjetivo = Math.min(limiteObjetivo, depoisConteudo - 18)
  rotulo(pagina, params.fontes.textoNegrito, 'Objetivo', X_ESQUERDA, yObjetivo)
  escreverBloco({
    pagina,
    texto: params.objetivo,
    fonte: params.fontes.texto,
    tamanho: 11.5,
    x: X_ESQUERDA,
    y: yObjetivo - 23,
    largura: LARGURA_ESQUERDA,
    entrelinhas: 16.2,
    maxLinhas: 7,
    cor: ROSA,
  })

  // Coluna direita: hierarquia editorial, sem aparência de tabela de planilha.
  pagina.drawText('PROPOSTA COMERCIAL', {
    x: X_FINANCEIRO,
    y: 410,
    size: 18.5,
    font: params.fontes.tituloNegrito,
    color: ROSA,
  })

  const yDepoisDosCustos = renderizarBlocoFinanceiro({
    pagina,
    fontes: params.fontes,
    resumo: params.resumo,
    modalidade: params.modalidade,
  })

  renderizarCondicaoEspecial({
    pagina,
    fontes: params.fontes,
    condicoes: condicoesEspeciais(params.resumo),
    yDepoisDosCustos,
  })
}

async function adicionarSlides(
  pdf: PDFDocument,
  slides: SlideDoModeloDeProposta[],
) {
  for (const slide of slides) await adicionarSlideImagem(pdf, slide)
}

export async function gerarPdfDaProposta(params: {
  propostaId: string
  marcaNome: string | null
  clienteNome: string
  programaNome: string
  objetivo: string
  modalidade: 'nacional' | 'regional'
  resumo: ResumoFinanceiroDaProposta
  slides?: SlideDoModeloDeProposta[]
  modoTeste?: boolean
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const fontes = await carregarFontesDaProposta(pdf)
  const slides = params.slides ?? []

  await adicionarCapasDaProposta({
    pdf,
    fontes,
    slides: slidesDaSecao(slides, 'capa', params.modalidade),
    marcaNome: params.marcaNome,
    clienteNome: params.clienteNome,
  })
  await adicionarSlides(pdf, slidesDaSecao(slides, 'conteudo', params.modalidade))

  if (params.resumo.incluir_digital) {
    await adicionarSlides(pdf, slidesDaSecao(slides, 'digital', params.modalidade))
  }

  if (params.resumo.incluir_redes_sociais) {
    await adicionarSlides(pdf, slidesDaSecao(slides, 'redes_sociais', params.modalidade))
  }

  await adicionarPropostaComercial({
    pdf,
    fontes,
    fundo: slidesDaSecao(slides, 'valor', params.modalidade)[0],
    marcaNome: params.marcaNome,
    clienteNome: params.clienteNome,
    programaNome: params.programaNome,
    objetivo: params.objetivo,
    modalidade: params.modalidade,
    resumo: params.resumo,
  })

  await adicionarSlides(pdf, slidesDaSecao(slides, 'observacoes', params.modalidade))
  await adicionarSlides(pdf, slidesDaSecao(slides, 'contracapa', params.modalidade))

  if (params.modoTeste) {
    for (const pagina of pdf.getPages()) {
      pagina.drawText('PRÉVIA - TESTE', {
        x: LARGURA - 122,
        y: 12,
        size: 7.5,
        font: fontes.textoNegrito,
        color: ROSA,
        opacity: 0.78,
      })
    }
  }

  pdf.setTitle(`Proposta - ${nomePrincipalDaProposta(params.marcaNome, params.clienteNome)} - ${params.programaNome}`)
  pdf.setSubject(params.modoTeste ? 'Prévia do modelo de proposta' : 'Proposta comercial')
  pdf.setCreator('Globo Slots')

  return pdf.save()
}
'use server'

import { criarClienteServidor } from '../supabase/cliente-servidor'
import { obterSessao } from '../sessao-servidor'
import { obterPrograma } from '../dados/programas'
import { listarDatasEspeciais } from '../dados/datas-especiais'
import { listarPrecos } from '../dados/regional'
import { carregarDisponibilidade } from '../dados/disponibilidade'
import { listarSlidesDoModelo } from '../dados/modelo-proposta'
import { emailAutomaticoAtivo } from '../dados/email-programa'
import { calcularResumoFinanceiro, type ItemParaResumoFinanceiro } from '../dominio/resumo-financeiro'
import { gravarConsulta } from './consultas'
import { gerarPdfDaProposta } from '../propostas/pdf'
import { enviarEmailMicrosoft, enviarPropostaPorEmail, emailMicrosoftConfigurado } from '../propostas/email-microsoft'
import { assuntoDoEmailDaProposta, montarEmailDaProposta } from '../propostas/template-email'
import { assuntoSolicitacaoAprovacao, montarEmailSolicitacaoAprovacao } from '../propostas/template-aprovacao'

const VALIDADE_LINK_PDF_SEGUNDOS = 60 * 60 * 24 * 30
const SCHEMA_FECHAMENTO = 'supabase/schema-entrega-4-fechamento-propostas.sql'
const SCHEMA_APROVACAO = 'supabase/schema-entrega-5-fluxo-aprovacao.sql'

export type EntradaGerarProposta = {
  marcaId: string | null
  marcaNome: string | null
  clienteId: string
  clienteNome: string
  programaId: string
  programaNome: string
  produto: string
  objetivo: string
  modalidade: 'nacional' | 'regional'
  itens: ItemParaResumoFinanceiro[]
}

export type ResultadoGerarProposta = {
  propostaId: string | null
  consultaId: string | null
  pdfGerado: boolean
  pdfUrl: string | null
  emailAtivo: boolean
  emailEnviado: boolean
  emailConfigurado: boolean
  destinatarios: string[]
  aprovacaoStatus: 'nao_requerida' | 'pendente' | 'aprovada' | 'rejeitada'
  aprovacaoErro: string | null
  erro: string | null
  emailErro: string | null
}

type DestinatarioRpc = {
  usuario_id: string
  email: string
  tipo: 'executivo' | 'responsavel_programa' | 'consultor_programa'
}

type ConsultorAprovacao = { usuario_id: string; email: string; nome: string }

function resultadoFalha(erro: string, extras: Partial<ResultadoGerarProposta> = {}): ResultadoGerarProposta {
  return {
    propostaId: null,
    consultaId: null,
    pdfGerado: false,
    pdfUrl: null,
    emailAtivo: false,
    emailEnviado: false,
    emailConfigurado: emailMicrosoftConfigurado(),
    destinatarios: [],
    aprovacaoStatus: 'nao_requerida',
    aprovacaoErro: null,
    erro,
    emailErro: null,
    ...extras,
  }
}

function erroDeSchemaDaProposta(mensagem: string | undefined): string | null {
  if (!mensagem) return null
  const normalizada = mensagem.toLowerCase()
  const colunasIncrementais = [
    'produto', 'objetivo', 'inclui_digital', 'inclui_redes_sociais', 'valor_redes_sociais',
    'valor_producao_tv', 'valor_producao_digital', 'valor_producao_redes_sociais', 'aprovacao_status',
  ]
  const menciona = colunasIncrementais.some((coluna) => normalizada.includes(coluna))
  const schema = normalizada.includes('does not exist') || normalizada.includes('could not find') || normalizada.includes('schema cache')
  if (!menciona || !schema) return null
  if (normalizada.includes('aprovacao_')) return `O banco ainda não possui o fluxo de aprovação. Execute ${SCHEMA_APROVACAO} no Supabase e tente novamente.`
  return 'O banco ainda não possui todos os campos da proposta. Execute no Supabase o arquivo supabase/schema-correcao-proposta-datas-especiais.sql e tente novamente.'
}

function mesesDaEntrada(itens: ItemParaResumoFinanceiro[]): { ano: number; mes: number; quantidade: number }[] {
  const mapa = new Map<string, Set<string>>()
  for (const item of itens) {
    const chave = item.data.slice(0, 7)
    const datas = mapa.get(chave) ?? new Set<string>()
    datas.add(item.data)
    mapa.set(chave, datas)
  }
  return [...mapa.entries()].map(([chave, datas]) => {
    const [ano, mes] = chave.split('-').map(Number)
    return { ano, mes, quantidade: datas.size }
  })
}

/**
 * R16 — teto mensal, incluindo o caso de a MESMA consulta reunir mais de uma
 * data do mês além do que já existe gravado (`carga.acoesDoAnuncianteNoMes`
 * só enxerga o que já está no banco; sem somar `mes.quantidade`, duas datas
 * novas do mesmo mês na mesma consulta passavam direto, porque nenhuma das
 * duas via a outra).
 *
 * No regional a contagem é do PROGRAMA inteiro no mês (todos os clientes),
 * não por anunciante — mesma regra do campo Bloqueio mensal regional que já
 * vale para o cálculo de disponibilidade (`carregarDisponibilidade`).
 */
async function validarLimiteMensal(entrada: EntradaGerarProposta): Promise<string | null> {
  for (const mes of mesesDaEntrada(entrada.itens)) {
    const carga = await carregarDisponibilidade({ programaId: entrada.programaId, clienteId: entrada.clienteId, modalidade: entrada.modalidade, ano: mes.ano, mes: mes.mes })
    if (carga.erro) return carga.erro
    if (carga.limiteMensal > 0 && carga.acoesDoAnuncianteNoMes + mes.quantidade > carga.limiteMensal) {
      const mesFormatado = `${String(mes.mes).padStart(2, '0')}/${mes.ano}`
      return entrada.modalidade === 'nacional'
        ? `O anunciante ultrapassaria o limite de ${carga.limiteMensal} ações no programa em ${mesFormatado}.`
        : `Esta consulta ultrapassaria o limite de ${carga.limiteMensal} ação(ões) regional(is) por mês neste programa em ${mesFormatado}.`
    }
  }
  return null
}

async function criarLinkDoPdf(supabase: Awaited<ReturnType<typeof criarClienteServidor>>, pdfPath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('propostas').createSignedUrl(pdfPath, VALIDADE_LINK_PDF_SEGUNDOS)
  if (error) { console.error('Falha ao assinar link da proposta:', error.message); return null }
  return data?.signedUrl ?? null
}

async function atualizarStatusEmail(supabase: Awaited<ReturnType<typeof criarClienteServidor>>, propostaId: string, valores: Record<string, unknown>) {
  const { error } = await supabase.from('propostas').update(valores).eq('id', propostaId)
  if (error) {
    const texto = error.message.toLowerCase()
    if (texto.includes('email_status') || texto.includes('email_erro') || texto.includes('could not find')) {
      console.warn(`Schema de e-mail ainda não aplicado. Execute ${SCHEMA_FECHAMENTO}.`)
      return
    }
    console.error('Falha ao atualizar status de e-mail:', error.message)
  }
}

async function registrarEmailAprovacao(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  propostaId: string,
  status: 'nao_configurado' | 'enviando' | 'enviado' | 'falha',
  erro: string | null = null,
) {
  const { error } = await supabase.rpc('registrar_email_workflow_aprovacao', {
    p_proposta_id: propostaId,
    p_fase: 'solicitacao',
    p_status: status,
    p_erro: erro,
  })
  if (error) console.error('Falha ao registrar e-mail da solicitação de aprovação:', error.message)
}

export async function gerarProposta(entrada: EntradaGerarProposta): Promise<ResultadoGerarProposta> {
  const sessao = await obterSessao()
  if (!sessao) return resultadoFalha('Sessão expirada. Entre de novo.')
  if (entrada.itens.length === 0) return resultadoFalha('Selecione ao menos uma data para gerar a proposta.')

  const produto = entrada.produto.trim()
  const objetivo = entrada.objetivo.trim()
  if (!produto) return resultadoFalha('Informe o Produto antes de gerar a proposta.')
  if (!objetivo) return resultadoFalha('Informe o Objetivo antes de gerar a proposta.')

  const erroLimite = await validarLimiteMensal(entrada)
  if (erroLimite) return resultadoFalha(erroLimite)

  const consulta = await gravarConsulta({ clienteId: entrada.clienteId, programaId: entrada.programaId, modalidade: entrada.modalidade, itens: entrada.itens })
  if (!consulta.id || consulta.erros.length > 0) return resultadoFalha(consulta.erros[0] ?? 'Não foi possível validar a consulta antes da proposta.')

  const programa = await obterPrograma(entrada.programaId)
  if (!programa) return resultadoFalha('Programa não encontrado.', { consultaId: consulta.id })
  const requerAprovacao = programa.possui_fluxo_aprovacao === true
  const agoraAprovacao = requerAprovacao ? new Date().toISOString() : null

  const [periodosEspeciais, precosRegionais, slides] = await Promise.all([
    listarDatasEspeciais(entrada.programaId),
    entrada.modalidade === 'regional' ? listarPrecos(entrada.programaId) : Promise.resolve([]),
    listarSlidesDoModelo(entrada.programaId, entrada.modalidade),
  ])

  const resumo = calcularResumoFinanceiro({ programa, modalidade: entrada.modalidade, itens: entrada.itens, periodosEspeciais, precosRegionais })
  const supabase = await criarClienteServidor()

  const { data: proposta, error: erroProposta } = await supabase.from('propostas').insert({
    consulta_id: consulta.id,
    usuario_id: sessao.usuarioId,
    marca_id: entrada.marcaId,
    marca_nome: entrada.marcaNome,
    cliente_id: entrada.clienteId,
    cliente_nome: entrada.clienteNome,
    programa_id: entrada.programaId,
    programa_nome: entrada.programaNome,
    produto,
    objetivo,
    modalidade: entrada.modalidade,
    inclui_digital: resumo.incluir_digital,
    inclui_redes_sociais: resumo.incluir_redes_sociais,
    valor_midia_tv: resumo.midia_tv,
    valor_midia_digital: resumo.midia_digital,
    valor_redes_sociais: resumo.redes_sociais,
    valor_simulcast: resumo.simulcast,
    valor_total_comercial: resumo.total_comercial,
    valor_producao_tv: resumo.producao_tv,
    valor_producao_digital: resumo.producao_digital,
    valor_producao_redes_sociais: resumo.producao_redes_sociais,
    valor_producao: resumo.producao,
    valor_direitos_tv: resumo.direitos_tv,
    valor_direitos_digital: resumo.direitos_digital,
    valor_direitos_total: resumo.direitos_total,
    valor_total_geral: resumo.total_geral,
    status: 'gerando',
    email_status: requerAprovacao ? 'pendente' : 'desativado',
    aprovacao_status: requerAprovacao ? 'pendente' : 'nao_requerida',
    aprovacao_solicitada_em: agoraAprovacao,
  }).select('id').single()

  if (erroProposta || !proposta?.id) {
    const orientacao = erroDeSchemaDaProposta(erroProposta?.message)
    if (orientacao) return resultadoFalha(orientacao, { consultaId: consulta.id })
    console.error('Falha ao criar proposta:', erroProposta?.message)
    return resultadoFalha('Não foi possível criar a proposta.', { consultaId: consulta.id })
  }

  const propostaId = proposta.id as string
  const pdfPath = `${sessao.usuarioId}/${propostaId}.pdf`

  try {
    const pdf = await gerarPdfDaProposta({ propostaId, marcaNome: entrada.marcaNome, clienteNome: entrada.clienteNome, programaNome: entrada.programaNome, objetivo, modalidade: entrada.modalidade, resumo, slides })
    const { error: erroUpload } = await supabase.storage.from('propostas').upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true })
    if (erroUpload) throw new Error(erroUpload.message)
    await supabase.from('propostas').update({ pdf_path: pdfPath, status: 'gerada', erro: null }).eq('id', propostaId)
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Falha ao gerar o PDF.'
    await supabase.from('propostas').update({ status: 'falha', erro: mensagem }).eq('id', propostaId)
    return resultadoFalha(mensagem, { propostaId, consultaId: consulta.id, aprovacaoStatus: requerAprovacao ? 'pendente' : 'nao_requerida' })
  }

  // Programas com aprovação: PDF existe internamente, mas não ganha link para o executivo.
  if (requerAprovacao) {
    await supabase.from('proposta_aprovacoes').insert({ proposta_id: propostaId, acao: 'solicitada', usuario_id: sessao.usuarioId })

    const resultadoBase: ResultadoGerarProposta = {
      propostaId,
      consultaId: consulta.id,
      pdfGerado: true,
      pdfUrl: null,
      emailAtivo: false,
      emailEnviado: false,
      emailConfigurado: emailMicrosoftConfigurado(),
      destinatarios: [],
      aprovacaoStatus: 'pendente',
      aprovacaoErro: null,
      erro: null,
      emailErro: null,
    }

    const { data: consultoresData, error: erroConsultores } = await supabase.rpc('consultores_da_aprovacao', { p_proposta_id: propostaId })
    if (erroConsultores) {
      const mensagem = `Proposta gerada e pendente. Execute ${SCHEMA_APROVACAO} no Supabase para habilitar o fluxo de aprovação.`
      return { ...resultadoBase, aprovacaoErro: mensagem }
    }
    const consultores = ((consultoresData ?? []) as ConsultorAprovacao[]).filter((item) => Boolean(item.email))
    if (consultores.length === 0) {
      const mensagem = 'A proposta ficou pendente, mas este programa não possui PO do produto vinculado para receber a aprovação.'
      await registrarEmailAprovacao(supabase, propostaId, 'falha', mensagem)
      return { ...resultadoBase, aprovacaoErro: mensagem }
    }
    if (!emailMicrosoftConfigurado()) {
      const mensagem = 'A proposta ficou pendente de aprovação, mas o Microsoft 365 ainda não está configurado para avisar os consultores.'
      await registrarEmailAprovacao(supabase, propostaId, 'nao_configurado', mensagem)
      return { ...resultadoBase, destinatarios: consultores.map((item) => item.email), aprovacaoErro: mensagem }
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    const dadosAprovacao = {
      executivoNome: sessao.nome,
      clienteNome: entrada.clienteNome,
      marcaNome: entrada.marcaNome,
      produto,
      programaNome: entrada.programaNome,
      modalidade: entrada.modalidade,
      objetivo,
      itens: entrada.itens,
      totalComercial: resumo.total_comercial,
      linkAprovacoes: baseUrl ? `${baseUrl}/aprovacoes` : null,
    } as const

    try {
      await registrarEmailAprovacao(supabase, propostaId, 'enviando')
      await enviarEmailMicrosoft({
        para: consultores,
        assunto: assuntoSolicitacaoAprovacao(dadosAprovacao),
        html: montarEmailSolicitacaoAprovacao(dadosAprovacao),
      })
      await registrarEmailAprovacao(supabase, propostaId, 'enviado')
      return { ...resultadoBase, destinatarios: consultores.map((item) => item.email) }
    } catch (erroEmail) {
      const mensagem = erroEmail instanceof Error ? erroEmail.message : 'Falha ao notificar os consultores da aprovação.'
      await registrarEmailAprovacao(supabase, propostaId, 'falha', mensagem)
      return { ...resultadoBase, destinatarios: consultores.map((item) => item.email), aprovacaoErro: mensagem }
    }
  }

  const pdfUrl = await criarLinkDoPdf(supabase, pdfPath)
  const emailAtivo = await emailAutomaticoAtivo(entrada.programaId)
  const resultadoBase: ResultadoGerarProposta = {
    propostaId, consultaId: consulta.id, pdfGerado: true, pdfUrl, emailAtivo,
    emailEnviado: false, emailConfigurado: emailMicrosoftConfigurado(), destinatarios: [],
    aprovacaoStatus: 'nao_requerida', aprovacaoErro: null, erro: null, emailErro: null,
  }

  if (!emailAtivo) { await atualizarStatusEmail(supabase, propostaId, { email_status: 'desativado', email_erro: null }); return resultadoBase }
  if (!emailMicrosoftConfigurado()) {
    const mensagem = 'O disparo automático está ativo, mas o Microsoft 365 ainda não foi configurado.'
    await atualizarStatusEmail(supabase, propostaId, { email_status: 'nao_configurado', email_erro: mensagem })
    return { ...resultadoBase, emailErro: mensagem }
  }
  if (!pdfUrl) {
    const mensagem = 'PDF gerado, mas não foi possível criar o link seguro para o e-mail.'
    await atualizarStatusEmail(supabase, propostaId, { email_status: 'falha', email_erro: mensagem })
    return { ...resultadoBase, emailErro: mensagem }
  }

  const { data: destinatariosRpc, error: erroDestinatarios } = await supabase.rpc('destinatarios_da_proposta', { p_programa_id: entrada.programaId, p_executivo_id: sessao.usuarioId })
  if (erroDestinatarios) {
    const texto = erroDestinatarios.message.toLowerCase()
    const mensagem = texto.includes('destinatarios_da_proposta') || texto.includes('could not find') ? `PDF gerado. Execute ${SCHEMA_FECHAMENTO} no Supabase para habilitar o novo envio por e-mail.` : 'PDF gerado, mas não foi possível resolver os destinatários do e-mail.'
    await atualizarStatusEmail(supabase, propostaId, { email_status: 'falha', email_erro: mensagem })
    return { ...resultadoBase, emailErro: mensagem }
  }

  const destinatarios = ((destinatariosRpc ?? []) as DestinatarioRpc[]).filter((item) => Boolean(item.email))
  const para = destinatarios.filter((item) => item.tipo === 'executivo')
  const cc = destinatarios.filter((item) => item.tipo === 'responsavel_programa')
  if (para.length === 0) {
    const mensagem = 'PDF gerado, mas o executivo não possui e-mail cadastrado no Globo Slots.'
    await atualizarStatusEmail(supabase, propostaId, { email_status: 'falha', email_erro: mensagem })
    return { ...resultadoBase, destinatarios: destinatarios.map((item) => item.email), emailErro: mensagem }
  }

  if (destinatarios.length > 0) {
    await supabase.from('proposta_destinatarios').upsert(destinatarios.map((item) => ({ proposta_id: propostaId, usuario_id: item.usuario_id, email: item.email, tipo: item.tipo, status: 'pendente', erro: null, enviado_em: null })), { onConflict: 'proposta_id,email' })
  }

  const dadosEmail = { executivoNome: sessao.nome, clienteNome: entrada.clienteNome, marcaNome: entrada.marcaNome, produto, programaNome: entrada.programaNome, modalidade: entrada.modalidade, objetivo, itens: entrada.itens, totalComercial: resumo.total_comercial, linkPdf: pdfUrl } as const

  try {
    await atualizarStatusEmail(supabase, propostaId, { email_status: 'enviando', email_erro: null })
    await enviarPropostaPorEmail({ para, cc, assunto: assuntoDoEmailDaProposta(dadosEmail), html: montarEmailDaProposta(dadosEmail) })
    const agora = new Date().toISOString()
    await Promise.all([
      atualizarStatusEmail(supabase, propostaId, { email_status: 'enviado', email_erro: null, email_enviado_em: agora, enviado_em: agora }),
      supabase.from('proposta_destinatarios').update({ status: 'enviado', erro: null, enviado_em: agora }).eq('proposta_id', propostaId),
    ])
    return { ...resultadoBase, emailEnviado: true, destinatarios: destinatarios.map((item) => item.email) }
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Falha ao enviar a proposta por e-mail.'
    await Promise.all([
      atualizarStatusEmail(supabase, propostaId, { email_status: 'falha', email_erro: mensagem }),
      supabase.from('proposta_destinatarios').update({ status: 'falha', erro: mensagem }).eq('proposta_id', propostaId),
    ])
    return { ...resultadoBase, destinatarios: destinatarios.map((item) => item.email), emailErro: mensagem }
  }
}

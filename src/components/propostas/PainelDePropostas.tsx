'use client'

import { useMemo, useState } from 'react'
import type { PropostaDaLista, StatusEmailDaProposta, StatusNegociacao, StatusAprovacaoDaProposta } from '@/lib/dados/propostas'
import { deveExibirClienteComMarca, nomePrincipalDaProposta } from '@/lib/dominio/exibicao-marca-cliente'
import { BotaoReenviarEmail } from '@/components/propostas/BotaoReenviarEmail'
import { PainelNegociacaoProposta } from '@/components/propostas/PainelNegociacaoProposta'
import { BotaoNovaVersao } from '@/components/propostas/BotaoNovaVersao'

type Props = { propostas: PropostaDaLista[]; usuarioId: string | null; proprietario: boolean }
type FiltroStatus = 'todos' | StatusNegociacao
type FiltroModalidade = 'todas' | 'nacional' | 'regional'
type FiltroPeriodo = 'todos' | '30' | '90' | '365'
type Grupo = { id: string; atual: PropostaDaLista; versoes: PropostaDaLista[] }

const ITENS_POR_PAGINA = 10
const STATUS: Record<StatusNegociacao, string> = { em_negociacao: 'Em negociação', fechada: 'Fechada', perdida: 'Perdida', cancelada: 'Cancelada', substituida: 'Substituída' }
const APROVACAO: Record<StatusAprovacaoDaProposta, string> = { nao_requerida: 'Sem aprovação', pendente: 'Pendente de aprovação', aprovada: 'Aprovada', rejeitada: 'Rejeitada' }
const ROTULO_PDF: Record<string, string> = { gerando: 'Gerando PDF', gerada: 'PDF gerado', enviando: 'PDF gerado', enviada: 'PDF gerado', falha: 'Falha no PDF' }
const ROTULO_EMAIL: Record<StatusEmailDaProposta, string> = { desativado: 'E-mail desativado', nao_configurado: 'E-mail não configurado', pendente: 'E-mail pendente', enviando: 'Enviando e-mail', enviado: 'E-mail enviado', falha: 'Falha no e-mail' }

function moeda(valor: number): string { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor) }
function dataHora(valor: string): string { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor)) }
function dataCurta(valor: string): string { return new Intl.DateTimeFormat('pt-BR').format(new Date(valor)) }

function agrupar(propostas: PropostaDaLista[]): Grupo[] {
  const porGrupo = new Map<string, PropostaDaLista[]>()
  for (const proposta of propostas) {
    const chave = proposta.grupo_versao_id || proposta.id
    const lista = porGrupo.get(chave) ?? []
    lista.push(proposta); porGrupo.set(chave, lista)
  }
  return [...porGrupo.entries()].map(([id, versoes]) => {
    const ordenadas = [...versoes].sort((a, b) => b.versao - a.versao || b.criado_em.localeCompare(a.criado_em))
    const vigente = ordenadas.find((item) => item.negociacao_status !== 'substituida') ?? ordenadas[0]
    return { id, atual: vigente, versoes: ordenadas }
  }).sort((a, b) => b.atual.criado_em.localeCompare(a.atual.criado_em))
}

export function PainelDePropostas({ propostas, usuarioId, proprietario }: Props) {
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState<FiltroStatus>('todos')
  const [programa, setPrograma] = useState('todos')
  const [modalidade, setModalidade] = useState<FiltroModalidade>('todas')
  const [periodo, setPeriodo] = useState<FiltroPeriodo>('todos')
  const [pagina, setPagina] = useState(1)

  const chaveFiltros = `${busca}|${status}|${programa}|${modalidade}|${periodo}`
  const [chaveFiltrosAnterior, setChaveFiltrosAnterior] = useState(chaveFiltros)
  if (chaveFiltros !== chaveFiltrosAnterior) {
    // Ajuste de estado durante a renderização: troca de filtro sempre volta
    // para a página 1, sem precisar de um efeito reagindo depois do commit.
    setChaveFiltrosAnterior(chaveFiltros)
    setPagina(1)
  }

  const grupos = useMemo(() => agrupar(propostas), [propostas])
  const programas = useMemo(() => [...new Set(grupos.map((grupo) => grupo.atual.programa_nome))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [grupos])
  // `Date.now()` é impuro e não pode ser chamado durante a renderização; o
  // inicializador preguiçoso do useState é o único lugar sancionado para lê-lo
  // uma vez. O filtro por período usa esta referência fixa desde que a tela abriu.
  const [agora] = useState(() => Date.now())
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    const dias = periodo === 'todos' ? null : Number(periodo)
    return grupos.filter((grupo) => {
      const item = grupo.atual
      if (termo && !`${item.marca_nome ?? ''} ${item.cliente_nome} ${item.programa_nome}`.toLocaleLowerCase('pt-BR').includes(termo)) return false
      if (status !== 'todos' && item.negociacao_status !== status) return false
      if (programa !== 'todos' && item.programa_nome !== programa) return false
      if (modalidade !== 'todas' && item.modalidade !== modalidade) return false
      if (dias !== null && agora - new Date(item.criado_em).getTime() > dias * 86400000) return false
      return true
    })
  }, [agora, busca, grupos, modalidade, periodo, programa, status])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA))
  const paginaSegura = Math.min(pagina, totalPaginas)
  const paginados = filtrados.slice((paginaSegura - 1) * ITENS_POR_PAGINA, paginaSegura * ITENS_POR_PAGINA)

  function limparFiltros() { setBusca(''); setStatus('todos'); setPrograma('todos'); setModalidade('todas'); setPeriodo('todos') }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_190px_150px_150px]">
          <label className="grid gap-1"><span className="text-[9.5px] font-bold uppercase tracking-[.06em] text-[var(--texto-3)]">Buscar</span><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Marca, anunciante ou programa" className="h-10 rounded-[10px] border border-[var(--borda-forte)] bg-white px-3 text-[12px] outline-none focus:border-[var(--roxo)]" /></label>
          <Filtro rotulo="Status" valor={status} aoMudar={(v) => setStatus(v as FiltroStatus)} opcoes={[["todos", "Todos"], ['em_negociacao', 'Em negociação'], ['fechada', 'Fechadas'], ['perdida', 'Perdidas'], ['cancelada', 'Canceladas']]} />
          <Filtro rotulo="Programa" valor={programa} aoMudar={setPrograma} opcoes={[["todos", "Todos os programas"], ...programas.map((p) => [p, p] as [string, string])]} />
          <Filtro rotulo="Modalidade" valor={modalidade} aoMudar={(v) => setModalidade(v as FiltroModalidade)} opcoes={[["todas", "Todas"], ['nacional', 'Nacional'], ['regional', 'Regional']]} />
          <Filtro rotulo="Período" valor={periodo} aoMudar={(v) => setPeriodo(v as FiltroPeriodo)} opcoes={[["todos", "Todo período"], ['30', '30 dias'], ['90', '90 dias'], ['365', '12 meses']]} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--borda)] pt-3"><p className="text-[10.5px] text-[var(--texto-3)]">{filtrados.length} oportunidade{filtrados.length === 1 ? '' : 's'} · 10 por página · versões agrupadas</p>{(busca || status !== 'todos' || programa !== 'todos' || modalidade !== 'todas' || periodo !== 'todos') && <button type="button" onClick={limparFiltros} className="text-[10.5px] font-bold text-[var(--roxo)]">Limpar filtros</button>}</div>
      </section>

      {totalPaginas > 1 && (
        <Paginacao pagina={paginaSegura} total={totalPaginas} totalItens={filtrados.length} aoMudar={setPagina} />
      )}

      {filtrados.length === 0 ? (
        <div className="rounded-[var(--raio-card)] border border-dashed border-[var(--borda-forte)] bg-[var(--superficie)] p-10 text-center"><p className="text-[14px] font-bold text-[var(--texto)]">Nenhuma proposta neste recorte</p><p className="mt-1 text-[12px] text-[var(--texto-3)]">Altere os filtros ou gere uma nova proposta.</p></div>
      ) : paginados.map((grupo) => <CardGrupo key={grupo.id} grupo={grupo} usuarioId={usuarioId} proprietario={proprietario} />)}
    </div>
  )
}

function Filtro({ rotulo, valor, aoMudar, opcoes }: { rotulo: string; valor: string; aoMudar: (valor: string) => void; opcoes: [string, string][] }) {
  return <label className="grid gap-1"><span className="text-[9.5px] font-bold uppercase tracking-[.06em] text-[var(--texto-3)]">{rotulo}</span><select value={valor} onChange={(e) => aoMudar(e.target.value)} className="h-10 rounded-[10px] border border-[var(--borda-forte)] bg-white px-3 text-[11.5px] font-semibold text-[var(--texto)] outline-none focus:border-[var(--roxo)]">{opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
}

function Paginacao({ pagina, total, totalItens, aoMudar }: { pagina: number; total: number; totalItens: number; aoMudar: (n: number) => void }) {
  const inicio = (pagina - 1) * ITENS_POR_PAGINA + 1; const fim = Math.min(pagina * ITENS_POR_PAGINA, totalItens)
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--raio-card)] border border-[var(--borda)] bg-white px-4 py-3"><p className="text-[10.5px] text-[var(--texto-3)]">Mostrando {inicio}–{fim} de {totalItens}</p><div className="flex items-center gap-2"><button type="button" disabled={pagina === 1} onClick={() => aoMudar(pagina - 1)} className="rounded-[9px] border border-[var(--borda-forte)] px-3 py-2 text-[10.5px] font-bold disabled:opacity-35">← Anterior</button><span className="px-2 text-[10.5px] font-bold text-[var(--texto-2)]">{pagina} / {total}</span><button type="button" disabled={pagina === total} onClick={() => aoMudar(pagina + 1)} className="rounded-[9px] border border-[var(--borda-forte)] px-3 py-2 text-[10.5px] font-bold disabled:opacity-35">Próxima →</button></div></div>
}

function CardGrupo({ grupo, usuarioId, proprietario }: { grupo: Grupo; usuarioId: string | null; proprietario: boolean }) {
  const p = grupo.atual
  const marca = nomePrincipalDaProposta(p.marca_nome, p.cliente_nome)
  const exibirCliente = deveExibirClienteComMarca(p.marca_nome, p.cliente_nome)
  const pdfDisponivel = Boolean(p.pdf_url)
  const autor = Boolean(usuarioId && p.usuario_id === usuarioId)
  const liberadaComercialmente = p.aprovacao_status === 'nao_requerida' || p.aprovacao_status === 'aprovada'
  const podeEditarNegociacao = (autor || proprietario) && liberadaComercialmente
  const podeReenviar = autor && pdfDisponivel && liberadaComercialmente
  const podeNovaVersao = (autor || proprietario) && p.negociacao_status !== 'substituida' && (pdfDisponivel || p.aprovacao_status === 'rejeitada')

  return (
    <details className="group rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] open:shadow-[var(--sombra-janela)]">
      <summary className="cursor-pointer list-none p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_190px] sm:items-center">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-[14px] font-bold text-[var(--texto)]">{marca} · {p.programa_nome}</h2><span className="rounded-full border border-[#DDD6FE] bg-[#F8F6FF] px-2 py-0.5 text-[9px] font-bold text-[var(--roxo)]">v{p.versao}</span>{grupo.versoes.length > 1 && <span className="text-[9.5px] text-[var(--texto-3)]">{grupo.versoes.length - 1} anterior{grupo.versoes.length - 1 === 1 ? '' : 'es'}</span>}</div><p className="mt-1 truncate text-[10.5px] text-[var(--texto-3)]">{exibirCliente && <>{p.cliente_nome} · </>}{p.modalidade === 'regional' ? 'Regional' : 'Nacional'} · {dataHora(p.criado_em)}</p></div>
          <div className="sm:text-right"><p className="text-[9.5px] uppercase text-[var(--texto-3)]">Total comercial</p><p className="mt-0.5 text-[14px] font-bold text-[var(--texto)]">{moeda(p.valor_total_comercial)}</p></div>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">{p.aprovacao_status !== 'nao_requerida' && <span className={`rounded-full px-2.5 py-1 text-[9.5px] font-bold ${classeAprovacao(p.aprovacao_status)}`}>{APROVACAO[p.aprovacao_status]}</span>}<span className={`rounded-full px-2.5 py-1 text-[9.5px] font-bold ${classeStatus(p.negociacao_status)}`}>{STATUS[p.negociacao_status]}</span><span className="text-[11px] font-bold text-[var(--roxo)] group-open:hidden">Detalhes ↓</span><span className="hidden text-[11px] font-bold text-[var(--roxo)] group-open:inline">Fechar ↑</span></div>
        </div>
      </summary>

      <div className="border-t border-[var(--borda)] p-4 sm:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px_260px] xl:items-start">
          <div>
            <div className="flex flex-wrap gap-1.5"><Selo texto={p.aprovacao_status === 'pendente' ? 'PDF aguardando aprovação' : p.aprovacao_status === 'rejeitada' ? 'PDF não liberado' : (ROTULO_PDF[p.status] ?? p.status)} classe={p.status === 'falha' && !pdfDisponivel ? 'erro' : 'ok'} /><Selo texto={p.aprovacao_status === 'pendente' ? 'E-mail após aprovação' : ROTULO_EMAIL[p.email_status]} classe={p.email_status === 'falha' ? 'erro' : p.email_status === 'enviado' ? 'ok' : 'neutro'} /><Selo texto="TV" />{p.inclui_digital && <Selo texto="Digital" />}{p.inclui_redes_sociais && <Selo texto="Redes sociais" />}</div>
            {p.aprovacao_status === 'pendente' && <p className="mt-3 text-[11px] font-semibold text-[#8A5700]">Esta proposta aguarda decisão do PO do produto. O executivo ainda não tem acesso ao PDF.</p>}
            {p.aprovacao_status === 'rejeitada' && <p className="mt-3 text-[11px] font-semibold text-[var(--concorrencia-texto)]">Proposta rejeitada. {p.aprovacao_justificativa ? `Justificativa: ${p.aprovacao_justificativa}` : 'Crie uma nova versão para corrigir.'}</p>}
            {p.email_enviado_em && <p className="mt-3 text-[10.5px] text-[var(--texto-3)]">Último envio: {dataHora(p.email_enviado_em)}</p>}
            {p.observacao_negociacao && <p className="mt-2 text-[11px] text-[var(--texto-2)]"><strong>Observação:</strong> {p.observacao_negociacao}</p>}
            {p.motivo_perda && <p className="mt-1 text-[10.5px] text-[var(--texto-3)]">Motivo da perda: {p.motivo_perda}</p>}
            {p.email_erro && <p className="mt-2 text-[10.5px] text-[#A65A00]">E-mail: {p.email_erro}</p>}
            {p.erro && p.status === 'falha' && <p className="mt-2 text-[10.5px] text-[var(--concorrencia-texto)]">PDF: {p.erro}</p>}
            <LinhaDoTempo proposta={p} versoes={grupo.versoes} />
            {grupo.versoes.length > 1 && <VersoesAnteriores versoes={grupo.versoes.filter((v) => v.id !== p.id)} />}
          </div>

          <div className="rounded-[10px] bg-[var(--superficie-suave)] p-4 xl:text-right"><p className="text-[9.5px] uppercase text-[var(--texto-3)]">Proposto</p><p className="mt-1 text-[16px] font-bold text-[var(--texto)]">{moeda(p.valor_total_comercial)}</p>{p.negociacao_status === 'fechada' && p.valor_final_negociado !== null && <><p className="mt-3 text-[9.5px] uppercase text-[var(--texto-3)]">Fechado</p><p className="mt-1 text-[15px] font-bold text-[var(--disponivel-texto)]">{moeda(p.valor_final_negociado)}</p>{p.data_fechamento && <p className="mt-1 text-[9.5px] text-[var(--texto-3)]">{dataCurta(`${p.data_fechamento}T12:00:00`)}</p>}</>}</div>

          <PainelNegociacaoProposta propostaId={p.id} statusInicial={p.negociacao_status} valorProposto={p.valor_total_comercial} valorFinalInicial={p.valor_final_negociado} dataFechamentoInicial={p.data_fechamento} observacaoInicial={p.observacao_negociacao} motivoPerdaInicial={p.motivo_perda} podeEditar={podeEditarNegociacao} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--borda)] pt-4">{p.pdf_url ? <a href={p.pdf_url} target="_blank" rel="noreferrer" className="inline-flex rounded-[9px] px-4 py-2 text-[11.5px] font-bold text-white" style={{ background: 'var(--marca)' }}>Abrir PDF</a> : <span className="text-[10.5px] text-[var(--texto-3)]">{p.aprovacao_status === 'pendente' ? 'PDF será liberado após aprovação' : p.aprovacao_status === 'rejeitada' ? 'PDF não liberado nesta versão' : 'PDF indisponível'}</span>}{podeReenviar && <BotaoReenviarEmail propostaId={p.id} />}{podeNovaVersao && <BotaoNovaVersao propostaId={p.id} />}</div>
      </div>
    </details>
  )
}

function Selo({ texto, classe = 'neutro' }: { texto: string; classe?: 'ok' | 'erro' | 'neutro' }) { const estilo = classe === 'ok' ? 'bg-[var(--disponivel-fundo)] text-[var(--disponivel-texto)]' : classe === 'erro' ? 'bg-[var(--concorrencia-fundo)] text-[var(--concorrencia-texto)]' : 'bg-[var(--superficie-suave)] text-[var(--texto-3)]'; return <span className={`rounded-full px-2.5 py-1 text-[9.5px] font-bold ${estilo}`}>{texto}</span> }

function LinhaDoTempo({ proposta, versoes }: { proposta: PropostaDaLista; versoes: PropostaDaLista[] }) {
  const eventos: { data: string; texto: string }[] = [{ data: proposta.criado_em, texto: `v${proposta.versao} criada` }]
  if (proposta.aprovacao_solicitada_em) eventos.push({ data: proposta.aprovacao_solicitada_em, texto: 'Enviada para aprovação' })
  if (proposta.aprovacao_decidida_em) eventos.push({ data: proposta.aprovacao_decidida_em, texto: proposta.aprovacao_status === 'aprovada' ? 'Proposta aprovada' : 'Proposta rejeitada' })
  if (proposta.email_enviado_em) eventos.push({ data: proposta.email_enviado_em, texto: 'E-mail enviado' })
  if (proposta.data_fechamento && proposta.negociacao_status === 'fechada') eventos.push({ data: `${proposta.data_fechamento}T12:00:00`, texto: 'Negociação fechada' })
  if (versoes.length > 1) eventos.push({ data: proposta.criado_em, texto: `${versoes.length} versões registradas` })
  eventos.sort((a, b) => b.data.localeCompare(a.data))
  return <div className="mt-5 border-t border-[var(--borda)] pt-4"><h3 className="text-[11.5px] font-bold text-[var(--texto)]">Atividade</h3><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">{eventos.map((evento, i) => <span key={`${evento.texto}-${i}`} className="text-[10px] text-[var(--texto-3)]">{dataHora(evento.data)} · <strong className="text-[var(--texto-2)]">{evento.texto}</strong></span>)}</div></div>
}

function VersoesAnteriores({ versoes }: { versoes: PropostaDaLista[] }) { return <div className="mt-4 rounded-[10px] border border-[var(--borda)] bg-[var(--superficie-suave)] p-3"><p className="text-[10px] font-bold uppercase tracking-[.05em] text-[var(--texto-3)]">Versões anteriores</p><div className="mt-2 divide-y divide-[var(--borda)]">{versoes.map((v) => <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[10.5px]"><span><strong>v{v.versao}</strong> · {dataHora(v.criado_em)} · {v.aprovacao_status !== 'nao_requerida' ? APROVACAO[v.aprovacao_status] : STATUS[v.negociacao_status]}</span>{v.pdf_url && <a href={v.pdf_url} target="_blank" rel="noreferrer" className="font-bold text-[var(--roxo)]">Abrir PDF</a>}</div>)}</div></div> }

function classeStatus(status: StatusNegociacao): string { if (status === 'fechada') return 'bg-[var(--disponivel-fundo)] text-[var(--disponivel-texto)]'; if (status === 'perdida') return 'bg-[var(--concorrencia-fundo)] text-[var(--concorrencia-texto)]'; if (status === 'cancelada' || status === 'substituida') return 'bg-[var(--superficie-suave)] text-[var(--texto-3)]'; return 'bg-[#FFF4E5] text-[#8A5700]' }
function classeAprovacao(status: StatusAprovacaoDaProposta): string { if (status === 'aprovada') return 'bg-[var(--disponivel-fundo)] text-[var(--disponivel-texto)]'; if (status === 'rejeitada') return 'bg-[var(--concorrencia-fundo)] text-[var(--concorrencia-texto)]'; return 'bg-[#FFF4E5] text-[#8A5700]' }

'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useConsulta, useGuardaDoPasso } from '@/components/consulta/ProvedorDaConsulta'
import { CarregandoDoPasso } from '@/components/consulta/CarregandoDoPasso'
import { carregarResumoFinanceiro } from '@/lib/acoes/resumo-financeiro'
import { gerarPropostaAcompanhada } from '@/lib/acoes/acompanhamento-propostas'
import type { ResultadoGerarProposta } from '@/lib/acoes/propostas'
import type { DetalheFinanceiroDaPraca, ResumoFinanceiroDaProposta } from '@/lib/dominio/resumo-financeiro'
import { descreverAcaoDaProposta } from '@/lib/dominio/texto-proposta'

function moeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-')
  return `${dia}/${mes}/${ano}`
}

type ResultadoResumo = { chave: string; resumo: ResumoFinanceiroDaProposta | null; erro: string | null }

export default function PassoResumo() {
  const pronto = useGuardaDoPasso('resumo')
  const { estado, finalizar, limpar } = useConsulta()
  const [resultadoResumo, setResultadoResumo] = useState<ResultadoResumo | null>(null)
  const [gerando, setGerando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoGerarProposta | null>(null)

  const chaveItens = useMemo(() => JSON.stringify(estado.itens), [estado.itens])
  const chaveAtual = `${estado.programaId}|${estado.modalidade}|${chaveItens}|${estado.incluirDigital}|${estado.incluirRedesSociais}`
  const carregandoResumo = estado.itens.length > 0 && (!resultadoResumo || resultadoResumo.chave !== chaveAtual)
  const resumo = !carregandoResumo && resultadoResumo?.chave === chaveAtual ? resultadoResumo.resumo : null
  const erroResumo = !carregandoResumo && resultadoResumo?.chave === chaveAtual ? resultadoResumo.erro : null
  const totalPracas = useMemo(
    () => estado.itens.reduce((total, item) => total + item.pracas.length, 0),
    [estado.itens],
  )
  const textoDaAcao = useMemo(() => {
    if (!estado.programaNome || estado.itens.length === 0) return ''
    return descreverAcaoDaProposta({
      programaNome: estado.programaNome,
      modalidade: estado.modalidade,
      itens: estado.itens,
      incluirDigital: estado.incluirDigital,
      incluirRedesSociais: estado.incluirRedesSociais,
    })
  }, [estado.programaNome, estado.modalidade, estado.itens, estado.incluirDigital, estado.incluirRedesSociais])

  useEffect(() => {
    if (!estado.programaId || estado.itens.length === 0) return
    let ativo = true
    const chave = chaveAtual

    carregarResumoFinanceiro({
      programaId: estado.programaId,
      modalidade: estado.modalidade,
      itens: estado.itens,
    }).then((retorno) => {
      if (!ativo) return
      setResultadoResumo({ chave, resumo: retorno.resumo, erro: retorno.erro })
    }).catch(() => {
      if (ativo) setResultadoResumo({ chave, resumo: null, erro: 'Não foi possível calcular os valores da proposta.' })
    })

    return () => { ativo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.programaId, estado.modalidade, chaveItens, estado.incluirDigital, estado.incluirRedesSociais, chaveAtual])

  if (!pronto || !estado.cliente || !estado.programaId) return <CarregandoDoPasso />

  async function aoGerar() {
    if (!resumo || !estado.cliente || !estado.programaId || estado.finalizada) return
    setGerando(true)
    setResultado(null)
    try {
      const retorno = await gerarPropostaAcompanhada({
        marcaId: estado.marcaId,
        marcaNome: estado.marcaNome,
        clienteId: estado.cliente.id,
        clienteNome: estado.cliente.nome,
        programaId: estado.programaId,
        programaNome: estado.programaNome ?? 'Programa',
        produto: estado.produto,
        objetivo: estado.objetivo,
        modalidade: estado.modalidade,
        itens: estado.itens,
        propostaAnteriorId: estado.propostaAnteriorId,
      })
      setResultado(retorno)
      if (retorno.pdfGerado && retorno.propostaId) {
        finalizar(retorno.propostaId)
        window.setTimeout(() => document.getElementById('resultado-proposta')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
      }
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[19px] font-bold text-[var(--texto)]" style={{ fontFamily: 'var(--fonte-titulo)' }}>Resumo da proposta</h2>
          {estado.propostaAnteriorId && !estado.finalizada && (
            <span className="rounded-full bg-[#F5F3FF] px-2.5 py-1 text-[10px] font-bold text-[var(--roxo)]">Nova versão</span>
          )}
        </div>
        <p className="mt-1 text-[13px] text-[var(--texto-3)]">
          {estado.finalizada
            ? 'Consulta finalizada. Acompanhe a liberação do PDF e o andamento comercial pela seção Propostas.'
            : estado.propostaAnteriorId
              ? 'Revise os ajustes. A nova versão será emitida sem alterar a anterior; se o programa exigir aprovação, a versão anterior continua válida até a nova ser aprovada.'
              : 'Confira o contexto, as datas, o texto da ação e todos os valores antes de gerar a proposta.'}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] p-5">
          <Campo rotulo="Marca" valor={estado.marcaNome ?? '—'} />
          <Campo rotulo="Anunciante" valor={estado.cliente.nome} />
          <Campo rotulo="Setor / indústria" valor={`${estado.cliente.setor ?? '—'} · ${estado.cliente.industria ?? '—'}`} />
          <Campo rotulo="Programa" valor={estado.programaNome ?? '—'} />
          <Campo rotulo="Produto" valor={estado.produto} />
          <Campo rotulo="Objetivo" valor={estado.objetivo} />
          <Campo rotulo="Modalidade" valor={estado.modalidade === 'regional' ? 'Regional' : 'Nacional'} />
          <Campo rotulo={estado.modalidade === 'regional' ? 'Ações regionais' : 'Novas ações'} valor={String(estado.itens.length)} />
          {estado.modalidade === 'regional' && <Campo rotulo="Praças selecionadas" valor={String(totalPracas)} />}
          <Campo rotulo="Digital" valor={estado.incluirDigital ? 'Incluído em todas as ações' : 'Não incluído'} />
          <Campo rotulo="Redes sociais" valor={estado.incluirRedesSociais ? 'Incluído em todas as ações' : 'Não incluído'} />
        </aside>

        <div className="flex flex-col gap-4">
          {textoDaAcao && (
            <section className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] p-5">
              <p className="text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--roxo)]">Texto da ação no PDF</p>
              <p className="mt-2 text-[13.5px] leading-[1.65] text-[var(--texto)]">{textoDaAcao}</p>
              <div className="mt-4 border-t border-[var(--borda)] pt-3">
                <p className="text-[10.5px] font-bold uppercase text-[var(--texto-3)]">Objetivo</p>
                <p className="mt-1 text-[12.5px] leading-[1.55] text-[var(--texto-2)]">{estado.objetivo}</p>
              </div>
            </section>
          )}

          {!resumo && !erroResumo && (
            <div className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] p-8 text-center text-[13px] text-[var(--texto-3)]">Calculando valores…</div>
          )}
          {erroResumo && (
            <div role="alert" className="rounded-[var(--raio-card)] border border-[var(--concorrencia)] bg-[var(--concorrencia-fundo)] p-4 text-[13px] text-[var(--concorrencia-texto)]">{erroResumo}</div>
          )}

          {resumo && (
            <>
              <section className="overflow-hidden rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)]">
                <header className="border-b border-[var(--borda)] bg-[var(--superficie-suave)] px-4 py-3">
                  <h3 className="text-[13.5px] font-bold text-[var(--texto)]">{estado.modalidade === 'regional' ? 'Ações regionais e valores' : 'Datas e valores'}</h3>
                </header>
                <div className="divide-y divide-[var(--borda)]">
                  {resumo.linhas.map((linha) => (
                    <div key={linha.data}>
                      <div className="grid gap-3 px-4 py-4 xl:grid-cols-[150px_1fr_150px]">
                        <div>
                          <p className="text-[13px] font-bold text-[var(--texto)]">{formatarData(linha.data)}</p>
                          {linha.pracas.length > 0 && <p className="mt-1 text-[11px] font-semibold text-[var(--roxo)]">{linha.pracas.join(' · ')}</p>}
                          {linha.periodo_especial_nome && <p className="mt-1 text-[10.5px] font-semibold text-[var(--roxo)]">{linha.periodo_especial_nome} · +{linha.periodo_especial_percentual}%</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-[11.5px] text-[var(--texto-2)] sm:grid-cols-3">
                          <Valor rotulo="Mídia TV" valor={linha.midia_tv} />
                          {resumo.incluir_digital && <Valor rotulo="Digital" valor={linha.midia_digital} />}
                          {resumo.incluir_redes_sociais && <Valor rotulo="Redes sociais" valor={linha.redes_sociais} />}
                          <Valor rotulo="Simulcast" valor={linha.simulcast} />
                          <Valor rotulo="Produção" valor={linha.producao} />
                          <Valor rotulo="Direitos TV" valor={linha.direitos_tv} />
                          {resumo.incluir_digital && <Valor rotulo="Direitos Digital" valor={linha.direitos_digital} />}
                        </div>
                        <div className="text-right">
                          <p className="text-[10.5px] uppercase text-[var(--texto-3)]">Total comercial</p>
                          <p className="mt-1 text-[15px] font-bold text-[var(--texto)]">{moeda(linha.total_comercial)}</p>
                        </div>
                      </div>

                      {estado.modalidade === 'regional' && linha.detalhe_pracas.length > 0 && (
                        <div className="border-t border-[var(--borda)] bg-[var(--superficie-suave)] px-4 py-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-[10.5px] font-bold uppercase tracking-[.05em] text-[var(--texto-3)]">Detalhamento por regional</p>
                              <p className="mt-0.5 text-[10.5px] text-[var(--texto-3)]">Mídia e direitos variam por praça. A produção regional é cobrada uma única vez por ação.</p>
                            </div>
                            <span className="rounded-full bg-[#EDE9FE] px-2.5 py-1 text-[10px] font-bold text-[var(--roxo)]">{linha.detalhe_pracas.length} {linha.detalhe_pracas.length === 1 ? 'praça' : 'praças'}</span>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {linha.detalhe_pracas.map((praca) => (
                              <DetalheDaPraca key={praca.praca_codigo} praca={praca} incluirDigital={resumo.incluir_digital} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] p-5">
                <h3 className="text-[13.5px] font-bold text-[var(--texto)]">Composição financeira</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <CartaoValor rotulo="Mídia TV" valor={resumo.midia_tv} />
                  {resumo.incluir_digital && <CartaoValor rotulo="Mídia Digital" valor={resumo.midia_digital} />}
                  {resumo.incluir_redes_sociais && <CartaoValor rotulo="Redes sociais" valor={resumo.redes_sociais} />}
                  <CartaoValor rotulo="Simulcast" valor={resumo.simulcast} />
                </div>
                <div className="mt-4 flex items-center justify-between rounded-[12px] bg-[#F5F3FF] px-4 py-4">
                  <strong className="text-[13px] text-[var(--texto)]">Total Comercial</strong>
                  <strong className="text-[20px] text-[var(--roxo)]">{moeda(resumo.total_comercial)}</strong>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <CartaoValor rotulo="Produção" valor={resumo.producao} subtitulo={`TV ${moeda(resumo.producao_tv)}${resumo.incluir_digital ? ` · Digital ${moeda(resumo.producao_digital)}` : ''}${resumo.incluir_redes_sociais ? ` · Redes ${moeda(resumo.producao_redes_sociais)}` : ''}`} />
                  <CartaoValor rotulo="Direitos e conexos" valor={resumo.direitos_total} subtitulo={`TV ${moeda(resumo.direitos_tv)}${resumo.incluir_digital ? ` · Digital ${moeda(resumo.direitos_digital)}` : ''}`} />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[var(--borda)] pt-4">
                  <span className="text-[12px] font-semibold text-[var(--texto-3)]">Total geral para registro</span>
                  <strong className="text-[16px] text-[var(--texto)]">{moeda(resumo.total_geral)}</strong>
                </div>
              </section>
            </>
          )}

          {estado.finalizada && !resultado && (
            <section className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--disponivel-fundo)] p-5">
              <h3 className="text-[15px] font-bold text-[var(--texto)]">✓ Consulta finalizada</h3>
              <p className="mt-1 text-[12px] text-[var(--texto-2)]">Esta consulta já gerou uma proposta e não pode mais ser alterada. Consulte em Propostas se o documento está liberado ou aguardando aprovação.</p>
              <Link href="/propostas" className="mt-3 inline-flex rounded-[9px] bg-white px-4 py-2 text-[11.5px] font-bold text-[var(--roxo)]">Acompanhar proposta →</Link>
            </section>
          )}

          {resultado && <ResultadoDaGeracao resultado={resultado} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--borda)] pt-6">
        {estado.finalizada ? (
          <div>
            <p className="text-[12.5px] font-bold text-[var(--disponivel-texto)]">✓ Consulta encerrada</p>
            <p className="mt-0.5 text-[10.5px] text-[var(--texto-3)]">Para alterar dados, inicie uma nova consulta ou use Nova versão pela seção Propostas.</p>
          </div>
        ) : (
          <Link href="/consulta/calendario" className="rounded-[11px] border border-[var(--borda-forte)] px-5 py-[11px] text-[13.5px] font-bold text-[var(--texto-2)]">← Voltar ao calendário</Link>
        )}

        {estado.finalizada ? (
          <Link href="/consulta" onClick={limpar} className="rounded-[11px] px-6 py-[11px] text-[13.5px] font-bold text-white" style={{ background: 'var(--marca)', boxShadow: 'var(--sombra-botao)' }}>+ Nova consulta</Link>
        ) : (
          <button type="button" disabled={!resumo || gerando} onClick={aoGerar} className="rounded-[11px] px-6 py-[11px] text-[13.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ background: 'var(--marca)', boxShadow: 'var(--sombra-botao)' }}>{gerando ? 'Gerando proposta…' : estado.propostaAnteriorId ? 'Gerar nova versão →' : 'Gerar proposta →'}</button>
        )}
      </div>
    </div>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <div className="border-b border-[var(--borda)] py-3 first:pt-0 last:border-0 last:pb-0"><p className="text-[10px] font-bold uppercase tracking-[.05em] text-[var(--texto-3)]">{rotulo}</p><p className="mt-1 whitespace-pre-wrap text-[13px] font-semibold leading-[1.45] text-[var(--texto)]">{valor}</p></div>
}
function Valor({ rotulo, valor }: { rotulo: string; valor: number }) { return <p><span className="text-[var(--texto-3)]">{rotulo}: </span><strong className="text-[var(--texto)]">{moeda(valor)}</strong></p> }
function CartaoValor({ rotulo, valor, subtitulo }: { rotulo: string; valor: number; subtitulo?: string }) { return <div className="rounded-[11px] border border-[var(--borda)] bg-[var(--superficie-suave)] p-3"><p className="text-[10.5px] font-bold uppercase text-[var(--texto-3)]">{rotulo}</p><p className="mt-1 text-[15px] font-bold text-[var(--texto)]">{moeda(valor)}</p>{subtitulo && <p className="mt-1 text-[10px] text-[var(--texto-3)]">{subtitulo}</p>}</div> }

function DetalheDaPraca({ praca, incluirDigital }: { praca: DetalheFinanceiroDaPraca; incluirDigital: boolean }) {
  const totalComercial = praca.midia_tv + praca.midia_digital + praca.simulcast
  return (
    <div className="rounded-[11px] border border-[var(--borda)] bg-white p-3">
      <div className="flex items-center justify-between gap-3"><span className="flex h-7 min-w-9 items-center justify-center rounded-[8px] bg-[#F5F3FF] px-2 text-[11px] font-bold text-[var(--roxo)]">{praca.praca_codigo}</span><strong className="text-[12.5px] text-[var(--texto)]">{moeda(totalComercial)}</strong></div>
      <div className="mt-2.5 grid gap-1 text-[10.5px] text-[var(--texto-2)]">
        <ValorCompacto rotulo="Mídia TV" valor={praca.midia_tv} />
        {incluirDigital && <ValorCompacto rotulo="Digital" valor={praca.midia_digital} />}
        <ValorCompacto rotulo="Simulcast" valor={praca.simulcast} />
        <ValorCompacto rotulo="Direitos TV" valor={praca.direitos_tv} />
        {incluirDigital && <ValorCompacto rotulo="Direitos Digital" valor={praca.direitos_digital} />}
      </div>
    </div>
  )
}
function ValorCompacto({ rotulo, valor }: { rotulo: string; valor: number }) { return <div className="flex items-center justify-between gap-3"><span>{rotulo}</span><strong className="whitespace-nowrap text-[var(--texto)]">{moeda(valor)}</strong></div> }

function ResultadoDaGeracao({ resultado }: { resultado: ResultadoGerarProposta }) {
  const sucessoPdf = resultado.pdfGerado
  const aguardandoAprovacao = sucessoPdf && resultado.aprovacaoStatus === 'pendente'

  return (
    <section id="resultado-proposta" className="scroll-mt-5 overflow-hidden rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)]">
      <div className={`p-5 ${sucessoPdf ? (aguardandoAprovacao ? 'bg-[#FFF8EC]' : 'bg-[var(--disponivel-fundo)]') : 'bg-[var(--concorrencia-fundo)]'}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-[16px] font-bold text-[var(--texto)]">
              {!sucessoPdf ? 'Não foi possível gerar a proposta' : aguardandoAprovacao ? '✓ Proposta enviada para aprovação' : '✓ Proposta gerada com sucesso'}
            </h3>
            {resultado.propostaId && <p className="mt-1 text-[11px] text-[var(--texto-3)]">Código {resultado.propostaId.slice(0, 8).toUpperCase()}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {aguardandoAprovacao ? (
              <>
                <span className="rounded-full bg-white px-3 py-1 text-[10.5px] font-bold text-[#8A5700]">Aprovação · Pendente</span>
                <span className="rounded-full bg-white px-3 py-1 text-[10.5px] font-bold text-[var(--texto-2)]">PDF · Gerado internamente</span>
              </>
            ) : (
              <>
                <span className={`rounded-full bg-white px-3 py-1 text-[10.5px] font-bold ${sucessoPdf ? 'text-[var(--disponivel-texto)]' : 'text-[var(--concorrencia-texto)]'}`}>PDF · {sucessoPdf ? 'Gerado' : 'Falha'}</span>
                {sucessoPdf && <span className={`rounded-full bg-white px-3 py-1 text-[10.5px] font-bold ${resultado.emailEnviado ? 'text-[var(--disponivel-texto)]' : 'text-[var(--texto-2)]'}`}>E-mail · {resultado.emailEnviado ? 'Enviado' : resultado.emailAtivo ? 'Pendente' : 'Desativado'}</span>}
              </>
            )}
          </div>
        </div>

        {resultado.erro && <p className="mt-3 text-[12px] font-semibold text-[var(--concorrencia-texto)]">{resultado.erro}</p>}

        {aguardandoAprovacao ? (
          <div className="mt-3 text-[12px] leading-[1.55] text-[var(--texto-2)]">
            <p><strong>O PDF foi gerado, mas ainda não foi liberado.</strong> O documento ficará disponível para o executivo somente depois que um PO do produto aprovar esta versão.</p>
            {resultado.aprovacaoErro ? <p className="mt-2 font-semibold text-[#A65A00]">A proposta continua pendente. {resultado.aprovacaoErro}</p> : <p className="mt-2">A solicitação de aprovação foi enviada aos POs de produto vinculados ao programa.</p>}
            {resultado.destinatarios.length > 0 && <p className="mt-1 text-[10.5px] text-[var(--texto-3)]">POs de produto notificados: {resultado.destinatarios.join(', ')}</p>}
          </div>
        ) : sucessoPdf ? (
          <div className="mt-3 text-[12px] leading-[1.55] text-[var(--texto-2)]">
            {resultado.emailEnviado ? <p><strong>E-mail enviado.</strong> O executivo recebeu a proposta em “Para” e os responsáveis configurados no programa receberam em cópia.</p> : !resultado.emailAtivo ? <p>O PDF foi gerado. O disparo automático de e-mail está desativado para este programa.</p> : !resultado.emailConfigurado ? <p>O PDF foi gerado. O disparo está ativo, mas o Microsoft 365 ainda precisa ser configurado.</p> : resultado.emailErro ? <p className="font-semibold text-[#A65A00]">PDF gerado; o e-mail não foi enviado: {resultado.emailErro}</p> : <p>PDF gerado. O status do e-mail será registrado separadamente.</p>}
            {resultado.destinatarios.length > 0 && <p className="mt-1 text-[10.5px] text-[var(--texto-3)]">Destinatários: {resultado.destinatarios.join(', ')}</p>}
          </div>
        ) : null}
      </div>

      {aguardandoAprovacao && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div><p className="text-[11px] font-bold uppercase tracking-[.06em] text-[var(--roxo)]">Próximo passo</p><p className="mt-1 text-[11.5px] text-[var(--texto-3)]">Acompanhe a decisão em Propostas. Se houver rejeição, a justificativa ficará registrada e você poderá criar uma nova versão.</p></div>
          <Link href="/propostas" className="rounded-[9px] border border-[var(--borda-forte)] bg-white px-4 py-2 text-[11.5px] font-bold text-[var(--roxo)]">Acompanhar proposta →</Link>
        </div>
      )}

      {sucessoPdf && !aguardandoAprovacao && resultado.pdfUrl && (
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[11px] font-bold uppercase tracking-[.06em] text-[var(--roxo)]">Prévia do PDF</p><p className="mt-0.5 text-[11px] text-[var(--texto-3)]">A proposta já está aberta aqui. O link seguro desta geração é válido por 30 dias.</p></div>
            <div className="flex flex-wrap gap-2"><a href={resultado.pdfUrl} target="_blank" rel="noreferrer" className="rounded-[9px] px-4 py-2 text-[11.5px] font-bold text-white" style={{ background: 'var(--marca)' }}>Abrir em nova aba ↗</a><Link href="/propostas" className="rounded-[9px] border border-[var(--borda-forte)] bg-white px-4 py-2 text-[11.5px] font-bold text-[var(--texto-2)]">Ver propostas</Link></div>
          </div>
          <iframe title="Prévia da proposta comercial" src={resultado.pdfUrl} className="h-[720px] w-full rounded-[12px] border border-[var(--borda)] bg-[#F5F3F7]" />
        </div>
      )}

      {sucessoPdf && !aguardandoAprovacao && !resultado.pdfUrl && (
        <div className="p-5 text-[12px] text-[var(--texto-2)]">O PDF foi salvo, mas a prévia segura não pôde ser criada. Consulte o status na seção Propostas.</div>
      )}
    </section>
  )
}

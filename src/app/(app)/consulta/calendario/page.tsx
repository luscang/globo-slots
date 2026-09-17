'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useConsulta, useGuardaDoPasso } from '@/components/consulta/ProvedorDaConsulta'
import { CarregandoDoPasso } from '@/components/consulta/CarregandoDoPasso'
import { GradeDoMes } from '@/components/consulta/GradeDoMes'
import { LegendaDeEstados } from '@/components/consulta/LegendaDeEstados'
import { EstadoVazio } from '@/components/comum/EstadoVazio'
import { carregarDisponibilidadeDoCalendario } from '@/lib/acoes/disponibilidade'
import type { ResultadoDeDisponibilidade } from '@/lib/dados/disponibilidade'

const NOMES_DOS_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const ERRO_GENERICO = 'Não foi possível carregar a disponibilidade. Tente novamente.'

type Resultado =
  | { chave: string; tipo: 'ok'; dados: ResultadoDeDisponibilidade }
  | { chave: string; tipo: 'erro'; mensagem: string }

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-')
  return `${dia}/${mes}/${ano}`
}

export default function PassoCalendario() {
  const pronto = useGuardaDoPasso('calendario')
  const { estado, atualizar } = useConsulta()

  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [avisoLimite, setAvisoLimite] = useState<string | null>(null)
  const idDaConsulta = useRef(0)

  const clienteId = estado.cliente?.id ?? null
  const programaId = estado.programaId
  const { modalidade, ano, mes } = estado
  const chaveAtual = `${programaId}|${clienteId}|${modalidade}|${ano}-${mes}|${tentativa}`

  useEffect(() => {
    if (!programaId || !clienteId) return
    const numero = ++idDaConsulta.current

    carregarDisponibilidadeDoCalendario({ programaId, clienteId, modalidade, ano, mes })
      .then((dados) => {
        if (numero !== idDaConsulta.current) return
        if (dados.erro) setResultado({ chave: chaveAtual, tipo: 'erro', mensagem: dados.erro })
        else setResultado({ chave: chaveAtual, tipo: 'ok', dados })
      })
      .catch(() => {
        if (numero !== idDaConsulta.current) return
        setResultado({ chave: chaveAtual, tipo: 'erro', mensagem: ERRO_GENERICO })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programaId, clienteId, modalidade, ano, mes, tentativa])

  const carregando = resultado === null || resultado.chave !== chaveAtual
  const comErro = !carregando && resultado?.tipo === 'erro'
  const dados = !carregando && resultado?.tipo === 'ok' ? resultado.dados : null
  const dias = dados?.dias ?? []
  const programa = dados?.programa ?? null

  // Digital e Redes Sociais só existem no Nacional — e lá deixaram de ser
  // opcionais: sempre entram quando o programa os oferece e tem preço
  // cadastrado. No Regional, nunca existem, independentemente do cadastro.
  const digitalOfertado = modalidade === 'nacional' && programa?.contem_digital === true
  const digitalComPreco = programa?.custo_midia_digital !== null && programa?.custo_midia_digital !== undefined
  const digitalIncluido = digitalOfertado && digitalComPreco
  const redesOfertadas = modalidade === 'nacional' && programa?.redes_sociais === true
  const redesComPreco = programa?.custo_midia_redes_sociais !== null && programa?.custo_midia_redes_sociais !== undefined
  const redesIncluidas = redesOfertadas && redesComPreco

  useEffect(() => {
    if (!programa) return
    if (estado.incluirDigital !== digitalIncluido || estado.incluirRedesSociais !== redesIncluidas) {
      atualizar({ incluirDigital: digitalIncluido, incluirRedesSociais: redesIncluidas })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programa, digitalIncluido, redesIncluidas])

  if (!pronto) return <CarregandoDoPasso />
  if (!estado.cliente || !programaId) return <CarregandoDoPasso />
  const cliente = estado.cliente

  const mesTodoSemExibicao = !carregando && !comErro && dias.length > 0 && dias.every((dia) => dia.estado === 'sem_exibicao')

  const prefixoMes = `${ano}-${String(mes).padStart(2, '0')}-`
  // R16 — no regional, o teto é do PROGRAMA no mês (todos os clientes), não
  // por anunciante, mas o mecanismo de "travar as outras datas do mês assim
  // que a seleção atinge o teto" é o mesmo dos dois lados: `carregarDisponibilidade`
  // já devolve `limiteMensal`/`acoesDoAnuncianteNoMes` corretos para as duas
  // modalidades (`src/lib/dados/disponibilidade.ts`).
  const limiteMensal = dados?.limiteMensal ?? 0
  const acoesCompradasNoMes = dados?.acoesDoAnuncianteNoMes ?? 0
  const selecionadasNoMes = estado.itens.filter((item) => item.data.startsWith(prefixoMes)).length
  const totalComSelecao = acoesCompradasNoMes + selecionadasNoMes
  const limiteAtingidoComSelecao = limiteMensal > 0 && totalComSelecao >= limiteMensal
  const datasSelecionadas = [...estado.itens].sort((a, b) => a.data.localeCompare(b.data))
  const totalPracasSelecionadas = estado.itens.reduce((total, item) => total + item.pracas.length, 0)
  const maxPracasPorAcao = Math.max(1, programa?.max_pracas_por_acao ?? 3)

  const diasParaExibir = dias.map((dia) => {
    const selecionada = estado.itens.some((item) => item.data === dia.data)
    if (limiteAtingidoComSelecao && !selecionada && dia.estado === 'disponivel') {
      return {
        ...dia,
        estado: 'limite_mensal' as const,
        motivos: [
          ...dia.motivos,
          modalidade === 'nacional'
            ? `O anunciante atingiu o limite de ${limiteMensal} ações neste programa no mês.`
            : `${cliente.nome} já atingiu o limite de ${limiteMensal} ação(ões) regional(is) neste programa no mês.`,
        ],
      }
    }
    return dia
  })

  function irParaMes(delta: number) {
    let novoMes = estado.mes + delta
    let novoAno = estado.ano
    if (novoMes < 1) { novoMes = 12; novoAno -= 1 }
    else if (novoMes > 12) { novoMes = 1; novoAno += 1 }
    atualizar({ ano: novoAno, mes: novoMes })
    setAvisoLimite(null)
  }

  function alternarData(data: string) {
    if (modalidade === 'regional') return

    const jaSelecionada = estado.itens.some((item) => item.data === data)
    if (jaSelecionada) {
      atualizar({ itens: estado.itens.filter((item) => item.data !== data) })
      setAvisoLimite(null)
      return
    }

    if (data.startsWith(prefixoMes) && limiteMensal > 0 && totalComSelecao >= limiteMensal) {
      setAvisoLimite(`${cliente.nome} já atingiu o limite de ${limiteMensal} ações de ${estado.programaNome ?? 'este programa'} neste mês, considerando as compras existentes e esta seleção.`)
      return
    }

    atualizar({ itens: [...estado.itens, { data, quantidade: 1, pracas: [] }] })
    setAvisoLimite(null)
  }

  function alternarPraca(data: string, pracaCodigo: string) {
    if (modalidade !== 'regional') return

    const dia = dias.find((item) => item.data === data)
    const praca = dia?.pracas.find((item) => item.praca_codigo === pracaCodigo)
    if (!dia || dia.estado !== 'disponivel' || !praca?.disponivel) return

    const itemAtual = estado.itens.find((item) => item.data === data)
    const pracasAtuais = itemAtual?.pracas ?? []
    const jaSelecionada = pracasAtuais.includes(pracaCodigo)

    if (jaSelecionada) {
      const novasPracas = pracasAtuais.filter((codigo) => codigo !== pracaCodigo)
      const novosItens = novasPracas.length === 0
        ? estado.itens.filter((item) => item.data !== data)
        : estado.itens.map((item) => item.data === data ? { ...item, pracas: novasPracas } : item)
      atualizar({ itens: novosItens })
      setAvisoLimite(null)
      return
    }

    if (pracasAtuais.length >= maxPracasPorAcao) {
      setAvisoLimite(`Cada ação regional de ${estado.programaNome ?? 'este programa'} pode combinar no máximo ${maxPracasPorAcao} ${maxPracasPorAcao === 1 ? 'praça' : 'praças'}. Remova uma praça antes de selecionar outra.`)
      return
    }

    // R16 — uma data NOVA (ainda sem praça nesta consulta) não entra se o mês
    // já bateu o teto regional, contando o que já foi vendido de fato mais o
    // que esta consulta já reservou em outras datas. Uma segunda praça na
    // MESMA data (`itemAtual` já existe) não conta de novo — o teto é por
    // data, não por praça.
    if (!itemAtual && data.startsWith(prefixoMes) && limiteMensal > 0 && totalComSelecao >= limiteMensal) {
      setAvisoLimite(`${cliente.nome} já atingiu o limite de ${limiteMensal} ação(ões) regional(is) de ${estado.programaNome ?? 'este programa'} neste mês, considerando as vendas existentes e esta seleção.`)
      return
    }

    if (itemAtual) {
      atualizar({
        itens: estado.itens.map((item) =>
          item.data === data
            ? { ...item, pracas: [...item.pracas, pracaCodigo] }
            : item,
        ),
      })
    } else {
      atualizar({ itens: [...estado.itens, { data, quantidade: 1, pracas: [pracaCodigo] }] })
    }
    setAvisoLimite(null)
  }

  function removerItem(data: string) {
    atualizar({ itens: estado.itens.filter((item) => item.data !== data) })
    setAvisoLimite(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--borda)] bg-[var(--superficie-suave)] px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--roxo)]">Programa em consulta</p>
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <h2 className="text-[24px] font-bold leading-tight text-[var(--texto)]" style={{ fontFamily: 'var(--fonte-titulo)' }}>{estado.programaNome ?? programa?.nome ?? 'Programa'}</h2>
              <span className="rounded-full bg-[#F5F3FF] px-3 py-1 text-[10.5px] font-bold text-[var(--roxo)]">{modalidade === 'regional' ? 'Regional' : 'Nacional'}</span>
            </div>
            <p className="mt-1 text-[11.5px] text-[var(--texto-3)]">{programa?.canal ? `${programa.canal} · ` : ''}Disponibilidade para <strong className="text-[var(--texto-2)]">{cliente.nome}</strong></p>
          </div>
          <Link href="/consulta" className="rounded-[9px] border border-[var(--borda-forte)] bg-white px-3.5 py-2 text-[11px] font-bold text-[var(--texto-2)]">Trocar programa</Link>
        </div>
        <p className="px-5 py-3 text-[12px] leading-[1.5] text-[var(--texto-3)] sm:px-6">
          {modalidade === 'regional'
            ? `Selecione diretamente as praças verdes de cada data. Você pode combinar até ${maxPracasPorAcao} ${maxPracasPorAcao === 1 ? 'praça' : 'praças'} por ação.`
            : 'Selecione as datas verdes e configure os complementos no painel ao lado.'}
        </p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4 rounded-[var(--raio-card)] border border-[var(--borda)] p-4 sm:p-5" style={{ background: 'var(--superficie)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => irParaMes(-1)} aria-label="Mês anterior" className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[var(--borda-forte)] text-[15px] font-bold text-[var(--texto-2)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--roxo)]">‹</button>
              <p className="min-w-[150px] text-center text-[15px] font-bold text-[var(--texto)]" style={{ fontFamily: 'var(--fonte-titulo)' }}>{NOMES_DOS_MESES[estado.mes - 1]} {estado.ano}</p>
              <button type="button" onClick={() => irParaMes(1)} aria-label="Próximo mês" className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[var(--borda-forte)] text-[15px] font-bold text-[var(--texto-2)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--roxo)]">›</button>
            </div>
            <LegendaDeEstados />
          </div>

          {modalidade === 'regional' && !carregando && !comErro && (
            <div className="rounded-[10px] border border-[#DDD6FE] bg-[#F5F3FF] px-4 py-3 text-[11px] leading-[1.5] text-[var(--texto-2)]">
              <strong className="text-[var(--roxo)]">Como selecionar:</strong> clique em SP, RJ, BH, DF ou PE dentro da própria data. Verde = livre, roxo = selecionada e escuro = já ocupada.
            </div>
          )}

          {carregando && <EsqueletoDaGrade />}

          {comErro && (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-[var(--raio-card)] border px-4 py-10 text-center" style={{ background: 'var(--concorrencia-fundo)', borderColor: 'var(--concorrencia)' }}>
              <p className="text-[13.5px] font-bold" style={{ color: 'var(--concorrencia-texto)' }}>{resultado && resultado.tipo === 'erro' ? resultado.mensagem : ERRO_GENERICO}</p>
              <button type="button" onClick={() => setTentativa((n) => n + 1)} className="rounded-[10px] px-5 py-2 text-[13px] font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--roxo)]" style={{ background: 'var(--marca)' }}>Tentar de novo</button>
            </div>
          )}

          {mesTodoSemExibicao && <EstadoVazio titulo={`${estado.programaNome ?? 'Este programa'} não vai ao ar em ${NOMES_DOS_MESES[estado.mes - 1].toLowerCase()} de ${estado.ano}`} explicacao="Navegue para outro mês, ou volte e escolha outro programa." />}

          {!carregando && !comErro && !mesTodoSemExibicao && (
            <GradeDoMes
              dias={diasParaExibir}
              ano={estado.ano}
              mes={estado.mes}
              modalidade={modalidade}
              itensSelecionados={estado.itens}
              aoAlternar={alternarData}
              aoAlternarPraca={alternarPraca}
            />
          )}
        </div>

        <aside className="flex h-fit flex-col rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie-suave)] p-5 xl:sticky xl:top-5">
          <div>
            <h3 className="text-[14px] font-bold text-[var(--texto)]">{modalidade === 'regional' ? 'Ações regionais selecionadas' : 'Datas selecionadas'}</h3>
            <p className="mt-1 text-[11.5px] text-[var(--texto-3)]">
              {modalidade === 'regional'
                ? 'Cada data representa uma ação. Escolha uma ou mais praças livres para compor essa ação.'
                : 'A seleção fica salva enquanto você navega entre os meses.'}
            </p>
          </div>

          <div className="mt-4 flex max-h-[300px] flex-col gap-2 overflow-y-auto">
            {datasSelecionadas.length === 0 ? (
              <div className="rounded-[var(--raio-card)] border border-dashed border-[var(--borda-forte)] bg-white p-4 text-[12px] leading-[1.5] text-[var(--texto-3)]">
                {modalidade === 'regional'
                  ? 'Selecione uma ou mais praças verdes diretamente no calendário.'
                  : 'Selecione uma ou mais datas verdes no calendário.'}
              </div>
            ) : datasSelecionadas.map((item) => (
              <div key={item.data} className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--disponivel)]" />
                    <div>
                      <p className="text-[12.5px] font-bold text-[var(--texto)]">{formatarData(item.data)}</p>
                      <p className="mt-0.5 text-[10.5px] text-[var(--texto-3)]">
                        {modalidade === 'regional'
                          ? `1 ação regional · ${item.pracas.length} ${item.pracas.length === 1 ? 'praça' : 'praças'}`
                          : '1 nova ação'}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => removerItem(item.data)} aria-label={`Remover ${formatarData(item.data)}`} className="cursor-pointer text-[16px] text-[var(--texto-3)]">×</button>
                </div>

                {modalidade === 'regional' && item.pracas.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 pl-[18px]">
                    {item.pracas.map((codigo) => (
                      <button
                        key={codigo}
                        type="button"
                        onClick={() => alternarPraca(item.data, codigo)}
                        className="rounded-full bg-[#F5F3FF] px-2.5 py-1 text-[10px] font-bold text-[var(--roxo)] outline-none hover:bg-[#EDE9FE] focus-visible:ring-2 focus-visible:ring-[var(--roxo)]"
                        title={`Remover ${codigo}`}
                      >
                        {codigo} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[var(--raio-card)] border border-[var(--borda)] bg-white p-4">
            <div className="flex justify-between text-[12px] text-[var(--texto-2)]"><span>Datas</span><strong className="text-[var(--texto)]">{estado.itens.length}</strong></div>
            <div className="mt-2 flex justify-between text-[12px] text-[var(--texto-2)]"><span>{modalidade === 'regional' ? 'Ações regionais' : 'Novas ações'}</span><strong className="text-[var(--texto)]">{estado.itens.length}</strong></div>
            {modalidade === 'regional' && (
              <div className="mt-2 flex justify-between text-[12px] text-[var(--texto-2)]"><span>Praças selecionadas</span><strong className="text-[var(--roxo)]">{totalPracasSelecionadas}</strong></div>
            )}
            {!carregando && !comErro && modalidade === 'nacional' && limiteMensal > 0 && (
              <div className="mt-3 border-t border-[var(--borda)] pt-3">
                <div className="flex justify-between gap-3 text-[11.5px] text-[var(--texto-2)]"><span>Ações já compradas neste mês</span><strong className="whitespace-nowrap text-[var(--texto)]">{acoesCompradasNoMes}/{limiteMensal}</strong></div>
                {selecionadasNoMes > 0 && <div className="mt-2 flex justify-between gap-3 text-[11.5px] text-[var(--texto-2)]"><span>Com esta seleção</span><strong className="whitespace-nowrap text-[var(--roxo)]">{totalComSelecao}/{limiteMensal}</strong></div>}
              </div>
            )}
          </div>

          {modalidade === 'nacional' && (
            <div className="mt-4 rounded-[var(--raio-card)] border border-[var(--borda)] bg-white p-4">
              <div>
                <p className="text-[12px] font-bold text-[var(--texto)]">Complementos da proposta</p>
                <p className="mt-1 text-[10.5px] leading-[1.45] text-[var(--texto-3)]">Fazem parte de todas as ações deste programa, sem precisar escolher.</p>
              </div>
              <div className="mt-3 flex flex-col gap-2.5">
                <StatusComplemento titulo="Digital" incluido={digitalIncluido} />
                <StatusComplemento titulo="Redes sociais" incluido={redesIncluidas} />
              </div>
            </div>
          )}

          {avisoLimite && <div className="mt-3 rounded-[var(--raio-card)] border border-[#DDD6FE] bg-[#F5F3FF] px-4 py-3 text-[11px] leading-[1.5] text-[var(--roxo)]">{avisoLimite}</div>}

          <div className="mt-4 rounded-[var(--raio-card)] bg-[var(--prazo-fundo)] px-4 py-3 text-[10.5px] leading-[1.5] text-[var(--texto-2)]">A consulta valida a disponibilidade neste momento. A seleção ainda não reserva o inventário.</div>

          {estado.itens.length > 0 ? (
            <Link href="/consulta/resumo" className="mt-3 flex h-[46px] w-full items-center justify-center rounded-[12px] text-[13px] font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--roxo)]" style={{ background: 'var(--marca)', boxShadow: 'var(--sombra-botao)' }}>Continuar para resumo →</Link>
          ) : (
            <button type="button" disabled className="mt-3 h-[46px] w-full cursor-not-allowed rounded-[12px] text-[13px] font-bold text-white opacity-45" style={{ background: 'var(--marca)' }}>Continuar para resumo →</button>
          )}

          <Link href="/consulta/programa" className="mt-3 text-center text-[12px] font-bold text-[var(--texto-2)] underline-offset-2 hover:underline">← Voltar para programa</Link>
        </aside>
      </div>
    </div>
  )
}

function StatusComplemento({ titulo, incluido }: { titulo: string; incluido: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border p-3" style={{ borderColor: incluido ? 'var(--roxo)' : 'var(--borda)', background: incluido ? '#F5F3FF' : 'var(--superficie-suave)' }}>
      <span className="text-[11.5px] font-bold text-[var(--texto)]">{titulo}</span>
      <span
        className="rounded-full px-2.5 py-1 text-[10px] font-bold"
        style={incluido ? { background: 'var(--disponivel-fundo)', color: 'var(--disponivel-texto)' } : { background: 'var(--superficie-suave)', color: 'var(--texto-3)' }}
      >
        {incluido ? 'Incluído' : 'Não oferecido pelo programa'}
      </span>
    </div>
  )
}

function EsqueletoDaGrade() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <span className="sr-only">Carregando disponibilidade…</span>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-[6px]" aria-hidden>
        {Array.from({ length: 35 }).map((_, indice) => <div key={indice} className="min-h-[64px] animate-pulse rounded-[9px] sm:min-h-[82px] sm:rounded-[11px]" style={{ background: 'var(--superficie-suave)' }} />)}
      </div>
    </div>
  )
}

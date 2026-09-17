'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CampoDeBuscaDeMarca } from '@/components/consulta/CampoDeBuscaDeMarca'
import { useConsulta } from '@/components/consulta/ProvedorDaConsulta'
import { verificarRestricaoDaConsulta, type RestricaoAplicadaNaConsulta } from '@/lib/acoes/restricoes'
import type { MarcaDaCarteira } from '@/lib/dados/busca-marcas'

type ProgramaDaConsulta = {
  id: string
  nome: string
  canal: string
  aceita_regional: boolean
}

type Props = { programas: ProgramaDaConsulta[] }

function formatarCnpj(valor: string | null): string {
  const digitos = (valor ?? '').replace(/\D/g, '')
  if (digitos.length !== 14) return valor?.trim() || 'CNPJ não informado'
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`
}

export function InicioDaConsulta({ programas }: Props) {
  const router = useRouter()
  const { estado, atualizar } = useConsulta()
  const emNovaVersao = Boolean(estado.propostaAnteriorId)
  const [marca, setMarca] = useState<MarcaDaCarteira | null>(null)
  const [programaId, setProgramaId] = useState('')
  const [restricaoAplicada, setRestricaoAplicada] = useState<RestricaoAplicadaNaConsulta | null>(null)
  const [erroRestricao, setErroRestricao] = useState<string | null>(null)
  const [verificandoRestricao, setVerificandoRestricao] = useState(false)
  const idDaValidacaoDeRestricao = useRef(0)

  async function validarRestricao(programaSelecionadoId: string, clienteSelecionado: MarcaDaCarteira) {
    const idDaValidacao = ++idDaValidacaoDeRestricao.current
    setRestricaoAplicada(null)
    setErroRestricao(null)
    setVerificandoRestricao(true)

    const resultado = await verificarRestricaoDaConsulta(programaSelecionadoId, {
      nome: clienteSelecionado.cliente_nome,
      setor: clienteSelecionado.setor,
      industria: clienteSelecionado.industria,
    })

    if (idDaValidacao !== idDaValidacaoDeRestricao.current) return
    setVerificandoRestricao(false)
    setRestricaoAplicada(resultado.restricao)
    setErroRestricao(resultado.erro)
  }

  useEffect(() => {
    if (!emNovaVersao || !estado.cliente || !estado.programaId) return
    const marcaDaVersao: MarcaDaCarteira = {
      marca_id: estado.marcaId,
      marca_nome: estado.marcaNome,
      cliente_id: estado.cliente.id,
      cliente_nome: estado.cliente.nome,
      cnpj: estado.cliente.cnpj,
      setor: estado.cliente.setor,
      industria: estado.cliente.industria,
      apto_regional: estado.cliente.apto_regional,
    }
    // Sincroniza o estado local a partir do contexto persistido só ao entrar em
    // "nova versão" — não há manipulador de evento equivalente para isto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarca(marcaDaVersao)
    setProgramaId(estado.programaId)
    void validarRestricao(estado.programaId, marcaDaVersao)
    // A origem da nova versão é fixa; esta validação deve rodar ao carregar a versão.
  }, [emNovaVersao, estado.cliente, estado.programaId, estado.marcaId, estado.marcaNome])

  const programa = programas.find((item) => item.id === programaId) ?? null
  const contextoCompleto = estado.produto.trim() !== '' && estado.objetivo.trim() !== ''
  const regionalDisponivel = Boolean(programa?.aceita_regional && marca?.apto_regional)
  const modalidade = regionalDisponivel && estado.modalidade === 'regional' ? 'regional' : 'nacional'
  const combinacaoBloqueada = Boolean(restricaoAplicada || erroRestricao || verificandoRestricao)
  const informacoesHabilitadas = Boolean(marca && programa && !combinacaoBloqueada)

  function trocarPrograma(novoProgramaId: string) {
    idDaValidacaoDeRestricao.current += 1
    setProgramaId(novoProgramaId)
    setMarca(null)
    setRestricaoAplicada(null)
    setErroRestricao(null)
    setVerificandoRestricao(false)

    const novoPrograma = programas.find((item) => item.id === novoProgramaId) ?? null
    atualizar({
      programaId: novoPrograma?.id ?? null,
      programaNome: novoPrograma?.nome ?? null,
      marcaId: null,
      marcaNome: null,
      cliente: null,
      produto: '',
      objetivo: '',
      modalidade: 'nacional',
      itens: [],
      incluirDigital: false,
      incluirRedesSociais: false,
    })
  }

  async function escolherMarca(novaMarca: MarcaDaCarteira) {
    if (!programaId) return
    setMarca(novaMarca)
    atualizar({
      marcaId: novaMarca.marca_id,
      marcaNome: novaMarca.marca_nome,
      cliente: {
        id: novaMarca.cliente_id,
        nome: novaMarca.cliente_nome,
        cnpj: novaMarca.cnpj,
        setor: novaMarca.setor,
        industria: novaMarca.industria,
        apto_regional: novaMarca.apto_regional,
      },
      produto: '',
      objetivo: '',
      modalidade: 'nacional',
      itens: [],
      incluirDigital: false,
      incluirRedesSociais: false,
    })
    await validarRestricao(programaId, novaMarca)
  }

  function continuar() {
    if (!marca || !programa || !contextoCompleto || combinacaoBloqueada) return

    atualizar({
      marcaId: marca.marca_id,
      marcaNome: marca.marca_nome,
      cliente: {
        id: marca.cliente_id,
        nome: marca.cliente_nome,
        cnpj: marca.cnpj,
        setor: marca.setor,
        industria: marca.industria,
        apto_regional: marca.apto_regional,
      },
      programaId: programa.id,
      programaNome: programa.nome,
      produto: estado.produto.trim(),
      objetivo: estado.objetivo.trim(),
      modalidade,
      itens: emNovaVersao ? estado.itens : [],
      incluirDigital: emNovaVersao ? estado.incluirDigital : false,
      incluirRedesSociais: emNovaVersao ? estado.incluirRedesSociais : false,
      datasConfirmadas: false,
    })

    router.push('/consulta/calendario')
  }

  return (
    <section className="overflow-hidden rounded-[var(--raio-janela)] border border-[var(--borda)] bg-[var(--superficie)] shadow-[var(--sombra-janela)]">
      <header className="flex items-center justify-between border-b border-[var(--borda)] px-7 py-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[var(--roxo)]">{emNovaVersao ? 'Nova versão da proposta' : 'Nova consulta'}</p>
          <h1 className="mt-1 text-[22px] font-bold text-[var(--texto)]">Programa, cliente e marca</h1>
        </div>
        <span className="text-[12px] font-semibold text-[var(--texto-3)]">{emNovaVersao ? 'Revisão comercial' : 'Início da consulta'}</span>
      </header>

      {emNovaVersao && (
        <div className="border-b border-[#DDD6FE] bg-[#F8F6FF] px-7 py-4">
          <p className="text-[12.5px] font-bold text-[var(--roxo)]">Nova versão preservando a proposta anterior</p>
          <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--texto-2)]">
            Anunciante, marca e programa permanecem fixos. Você pode revisar Produto, Objetivo, modalidade, complementos e datas. A versão anterior continuará disponível para auditoria.
          </p>
        </div>
      )}

      <div className="grid min-h-[620px] lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-8 p-7 lg:border-r lg:border-[var(--borda)]">
          <div>
            <h2 className="mb-3 text-[15px] font-bold text-[var(--texto)]">1. Escolha o programa</h2>
            <select
              value={programaId}
              disabled={emNovaVersao}
              onChange={(evento) => trocarPrograma(evento.target.value)}
              className="h-[44px] w-full max-w-[520px] rounded-[var(--raio-campo)] border border-[var(--borda-forte)] bg-[var(--superficie-suave)] px-3 text-[14px] outline-none focus:border-[#A031F5] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <option value="">Selecione um programa</option>
              {programas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome} · {item.canal}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[11.5px] text-[var(--texto-3)]">
              {emNovaVersao ? 'O programa é mantido para preservar a família de versões.' : 'Escolha primeiro o programa. As restrições dele serão validadas assim que você selecionar o cliente ou a marca.'}
            </p>
          </div>

          <div className={programa ? '' : 'pointer-events-none opacity-45'}>
            <h2 className="text-[15px] font-bold text-[var(--texto)]">2. {emNovaVersao ? 'Anunciante e marca' : 'Cliente ou marca'}</h2>
            {!emNovaVersao && (
              <p className="mb-3 mt-1 max-w-[760px] text-[11.5px] leading-[1.5] text-[var(--texto-3)]">
                Busque pela marca ou pelo cliente. Ao selecionar o cliente, o sistema valida imediatamente restrições por anunciante, setor e indústria ou Segmentação SE para o programa escolhido.
              </p>
            )}

            {!emNovaVersao && programa && (
              <CampoDeBuscaDeMarca
                key={programa.id}
                aoEscolher={(novaMarca) => { void escolherMarca(novaMarca) }}
              />
            )}

            {marca && (
              <div className={`${emNovaVersao ? '' : 'mt-4'} rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie-suave)] p-4`}>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10.5px] font-bold uppercase text-[var(--texto-3)]">Anunciante selecionado</p>
                    <p className="mt-1 text-[16px] font-bold text-[var(--texto)]">{marca.cliente_nome}</p>
                    <p className="mt-1 text-[11px] text-[var(--texto-3)]">CNPJ {formatarCnpj(marca.cnpj)}</p>
                    {marca.marca_nome && (
                      <p className="mt-1 text-[12px] text-[var(--texto-2)]">
                        Marca: <strong>{marca.marca_nome}</strong>
                      </p>
                    )}
                  </div>
                  <span
                    className="rounded-full px-3 py-1 text-[11px] font-bold"
                    style={{
                      color: marca.apto_regional ? 'var(--disponivel)' : 'var(--texto-3)',
                      background: marca.apto_regional ? 'var(--disponivel-fundo)' : 'var(--esgotado-fundo)',
                    }}
                  >
                    {marca.apto_regional ? 'Elegível para regional' : 'Não elegível para regional'}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10.5px] font-bold uppercase text-[var(--texto-3)]">Setor</p>
                    <p className="mt-1 text-[13px] font-semibold">{marca.setor ?? 'Não informado'}</p>
                  </div>
                  <div>
                    <p className="text-[10.5px] font-bold uppercase text-[var(--texto-3)]">Indústria</p>
                    <p className="mt-1 text-[13px] font-semibold">{marca.industria ?? 'Não informada'}</p>
                  </div>
                </div>
              </div>
            )}

            {verificandoRestricao && (
              <div role="status" className="mt-3 rounded-[var(--raio-card)] border border-[#F1D3A6] bg-[#FFF8EC] px-4 py-3 text-[12px] font-semibold text-[#8A5700]">
                Validando as restrições do programa para este anunciante…
              </div>
            )}

            {restricaoAplicada && (
              <div role="alert" className="mt-3 rounded-[var(--raio-card)] border border-[var(--concorrencia)] bg-[var(--concorrencia-fundo)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase text-[var(--concorrencia-texto)]">Restrição · {restricaoAplicada.tipo}</span>
                  <strong className="text-[12.5px] text-[var(--concorrencia-texto)]">{restricaoAplicada.alvo}</strong>
                </div>
                <p className="mt-2 text-[13px] font-bold text-[var(--texto)]">Este cliente não pode receber proposta para {programa?.nome}.</p>
                <p className="mt-1 text-[12px] leading-[1.5] text-[var(--texto-2)]"><strong>Motivo:</strong> {restricaoAplicada.motivo}</p>
                <p className="mt-2 text-[11px] text-[var(--texto-3)]">Escolha outro cliente/marca ou volte ao campo 1 e selecione outro programa.</p>
              </div>
            )}

            {erroRestricao && (
              <div role="alert" className="mt-3 rounded-[var(--raio-card)] border border-[#F1D3A6] bg-[#FFF8EC] px-4 py-3 text-[12px] font-semibold text-[#8A5700]">
                {erroRestricao} A consulta ficará bloqueada até a validação ser concluída.
              </div>
            )}

            {programa?.aceita_regional && marca && !combinacaoBloqueada && (
              <div className="mt-4 max-w-[520px] rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie-suave)] p-4">
                <label className={`flex items-start gap-3 ${marca.apto_regional ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                  <input
                    type="checkbox"
                    checked={modalidade === 'regional'}
                    disabled={!marca.apto_regional}
                    onChange={(evento) => atualizar({
                      modalidade: evento.target.checked ? 'regional' : 'nacional',
                      itens: [],
                    })}
                    className="mt-0.5 h-4 w-4 accent-[#A031F5]"
                  />
                  <span>
                    <span className="block text-[12.5px] font-bold text-[var(--texto)]">Ação regional</span>
                    <span className="mt-0.5 block text-[11px] leading-[1.45] text-[var(--texto-3)]">
                      {marca.apto_regional
                        ? 'Opcional. Desmarcado, a proposta segue como Nacional. Marcado, o calendário e os preços usam as regras regionais.'
                        : 'Este programa aceita Regional, mas o anunciante selecionado não está elegível para proposta regional.'}
                    </span>
                  </span>
                </label>

                {modalidade === 'regional' && (
                  <div role="alert" className="mt-3 rounded-[var(--raio-card)] border border-[#F1D3A6] bg-[#FFF8EC] px-4 py-3 text-[12px] leading-[1.5] text-[#8A5700]">
                    <strong>Atenção:</strong> este cliente só pode ter uma ação regional vendida por mês neste programa. Você pode montar mais de uma consulta com datas diferentes, mas só uma data do mês poderá de fato ser vendida.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={informacoesHabilitadas ? '' : 'pointer-events-none opacity-45'}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-bold text-[var(--texto)]">3. Informações da proposta</h2>
                <p className="mt-1 text-[11.5px] text-[var(--texto-3)]">Produto e objetivo são obrigatórios e acompanham a proposta até o histórico.</p>
              </div>
              <span className="text-[10.5px] font-semibold text-[var(--texto-3)]">Obrigatórios</span>
            </div>

            <div className="grid max-w-[700px] gap-4">
              <label className="grid gap-1.5">
                <span className="text-[11.5px] font-bold text-[var(--texto-2)]">Produto</span>
                <input
                  type="text"
                  value={estado.produto}
                  maxLength={120}
                  onChange={(evento) => atualizar({ produto: evento.target.value })}
                  placeholder="Ex.: Cartão de crédito, nova coleção, campanha de Black Friday"
                  className="h-[44px] rounded-[var(--raio-campo)] border border-[var(--borda-forte)] bg-[var(--superficie-suave)] px-3 text-[13.5px] outline-none placeholder:text-[var(--placeholder)] focus:border-[#A031F5]"
                />
              </label>

              <label className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11.5px] font-bold text-[var(--texto-2)]">Objetivo</span>
                  <span className="text-[10px] text-[var(--texto-3)]">{estado.objetivo.length}/420</span>
                </div>
                <textarea
                  value={estado.objetivo}
                  maxLength={420}
                  rows={4}
                  onChange={(evento) => atualizar({ objetivo: evento.target.value })}
                  placeholder="Descreva o objetivo da marca para esta proposta. Este texto aparecerá no slide comercial."
                  className="resize-y rounded-[var(--raio-campo)] border border-[var(--borda-forte)] bg-[var(--superficie-suave)] px-3 py-2.5 text-[13.5px] leading-[1.5] outline-none placeholder:text-[var(--placeholder)] focus:border-[#A031F5]"
                />
              </label>
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-5 bg-[var(--superficie-suave)] p-6">
          <div>
            <h2 className="text-[14px] font-bold text-[var(--texto)]">Resumo da consulta</h2>
            <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--texto-3)]">
              {emNovaVersao
                ? 'Esta revisão pertence à mesma oportunidade da proposta anterior. A nova emissão será registrada como uma versão seguinte.'
                : 'O programa é escolhido primeiro. Depois, cliente e marca são validados contra as restrições comerciais antes de liberar o calendário.'}
            </p>
          </div>

          <div className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-white p-4">
            <p className="text-[10.5px] font-bold uppercase text-[var(--texto-3)]">Programa</p>
            <p className="mt-1 text-[13px] font-semibold">{programa?.nome ?? 'Ainda não selecionado'}</p>
            {programa && marca && !combinacaoBloqueada && (
              <p className="mt-1 text-[11px] font-semibold text-[var(--texto-3)]">
                Modalidade: {modalidade === 'regional' ? 'Regional' : 'Nacional'}
              </p>
            )}
            <div className="my-3 border-t border-[var(--borda)]" />
            <p className="text-[10.5px] font-bold uppercase text-[var(--texto-3)]">Anunciante</p>
            <p className="mt-1 text-[13px] font-semibold">{marca?.cliente_nome ?? 'Ainda não selecionado'}</p>
            {marca && <p className="mt-1 text-[10.5px] text-[var(--texto-3)]">CNPJ {formatarCnpj(marca.cnpj)}</p>}
            {marca?.marca_nome && (
              <>
                <p className="mt-3 text-[10.5px] font-bold uppercase text-[var(--texto-3)]">Marca</p>
                <p className="mt-1 text-[12px] font-semibold">{marca.marca_nome}</p>
              </>
            )}
            {restricaoAplicada && (
              <>
                <div className="my-3 border-t border-[var(--borda)]" />
                <p className="text-[10.5px] font-bold uppercase text-[var(--concorrencia-texto)]">Restrição encontrada</p>
                <p className="mt-1 text-[11px] font-semibold text-[var(--concorrencia-texto)]">{restricaoAplicada.tipo}: {restricaoAplicada.alvo}</p>
              </>
            )}
            <div className="my-3 border-t border-[var(--borda)]" />
            <p className="text-[10.5px] font-bold uppercase text-[var(--texto-3)]">Produto</p>
            <p className="mt-1 text-[12px] font-semibold">{estado.produto.trim() || 'Ainda não informado'}</p>
            <p className="mt-3 text-[10.5px] font-bold uppercase text-[var(--texto-3)]">Objetivo</p>
            <p className="mt-1 line-clamp-4 text-[11px] leading-[1.45] text-[var(--texto-2)]">{estado.objetivo.trim() || 'Ainda não informado'}</p>
          </div>

          <div className="mt-auto">
            <div className="mb-3 rounded-[var(--raio-card)] bg-[var(--prazo-fundo)] px-4 py-3 text-[11.5px] leading-[1.5] text-[var(--texto-2)]">
              {emNovaVersao
                ? 'As datas copiadas serão revalidadas contra a disponibilidade atual antes da nova emissão. Nenhuma condição antiga é assumida como disponível.'
                : 'Depois da validação inicial, o calendário considera vendas nacionais, ações regionais, concorrência, compras anteriores, limite mensal, prazo, bloqueios e datas especiais.'}
            </div>
            <button
              type="button"
              disabled={!marca || !programa || !contextoCompleto || combinacaoBloqueada}
              onClick={continuar}
              className="h-[48px] w-full rounded-[12px] text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
              style={{ background: 'var(--marca)' }}
            >
              Continuar para calendário →
            </button>
          </div>
        </aside>
      </div>
    </section>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import {
  adicionarClienteElegivel,
  adicionarClientesElegiveisEmMassa,
  buscarPaginaDeElegiveis,
  pesquisarClientesPorCnpj,
  removerClienteElegivel,
  type CandidatoEncontrado,
} from '@/lib/acoes/clientes-regionais'
import { CampoDeBuscaDeCliente } from '@/components/comum/CampoDeBuscaDeCliente'
import { EstadoVazio } from '@/components/comum/EstadoVazio'
import { BotaoDeGravacao } from '@/components/comum/BotaoDeGravacao'
import type { Cliente } from '@/lib/dados/busca-clientes'
import type { ClienteElegivel } from '@/lib/dados/clientes-regionais'

type Props = {
  clientesIniciais: ClienteElegivel[]
  totalInicial: number
}

const ATRASO_DA_BUSCA_MS = 300

/**
 * Painel de gestão da elegibilidade regional — Configurações → Clientes
 * regionais.
 *
 * A elegibilidade é do CLIENTE, GLOBAL: esta tela não vive dentro de nenhum
 * programa (`src/app/(app)/configuracoes/clientes-regionais/page.tsx`), e
 * cada aba Regional de programa só linka para cá — não duplica o cadastro.
 *
 * Três formas de gerenciar: lista paginada com busca, adicionar um cliente
 * por vez (`CampoDeBuscaDeCliente`, a mesma busca de qualquer outra tela) e
 * importação em massa por CNPJ colado, que sempre mostra uma prévia (o que
 * achou e o que não achou) antes de gravar qualquer coisa.
 */
export function PainelDeClientesRegionais({ clientesIniciais, totalInicial }: Props) {
  const [clientes, setClientes] = useState<ClienteElegivel[]>(clientesIniciais)
  const [total, setTotal] = useState(totalInicial)
  const [pagina, setPagina] = useState(1)
  const [termo, setTermo] = useState('')
  const [carregandoLista, setCarregandoLista] = useState(false)
  const [erroLista, setErroLista] = useState<string | null>(null)

  const [confirmandoRemocao, setConfirmandoRemocao] = useState<string | null>(null)
  const [removendo, setRemovendo] = useState<string | null>(null)

  const [clienteEscolhido, setClienteEscolhido] = useState<Cliente | null>(null)
  const [adicionandoUm, setAdicionandoUm] = useState(false)
  const [avisoIndividual, setAvisoIndividual] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null)

  const [textoColado, setTextoColado] = useState('')
  const [pesquisandoEmMassa, setPesquisandoEmMassa] = useState(false)
  const [resultadoEmMassa, setResultadoEmMassa] = useState<{
    encontrados: CandidatoEncontrado[]
    naoEncontrados: string[]
  } | null>(null)
  const [erroEmMassa, setErroEmMassa] = useState<string | null>(null)
  const [gravandoEmMassa, setGravandoEmMassa] = useState(false)
  const [sucessoEmMassa, setSucessoEmMassa] = useState<string | null>(null)

  const totalDePaginas = Math.max(1, Math.ceil(total / 30))
  const idDaConsultaAtual = useRef(0)

  async function recarregar(paginaAlvo: number, termoAlvo: string) {
    setCarregandoLista(true)
    setErroLista(null)
    const numero = ++idDaConsultaAtual.current
    const resultado = await buscarPaginaDeElegiveis(paginaAlvo, termoAlvo)
    if (numero !== idDaConsultaAtual.current) return
    setCarregandoLista(false)
    if (resultado.erro) {
      setErroLista(resultado.erro)
      return
    }
    setClientes(resultado.clientes)
    setTotal(resultado.total)
  }

  // Busca com debounce, voltando sempre para a página 1 — sem isso a pessoa
  // poderia digitar um termo e ficar numa página que não existe mais para
  // aquele resultado.
  useEffect(() => {
    const temporizador = setTimeout(() => {
      setPagina(1)
      recarregar(1, termo)
    }, ATRASO_DA_BUSCA_MS)
    return () => clearTimeout(temporizador)
  }, [termo])

  function irParaPagina(novaPagina: number) {
    if (novaPagina < 1 || novaPagina > totalDePaginas) return
    setPagina(novaPagina)
    recarregar(novaPagina, termo)
  }

  async function adicionarUm() {
    if (!clienteEscolhido) return
    setAdicionandoUm(true)
    setAvisoIndividual(null)

    const resultado = await adicionarClienteElegivel(clienteEscolhido.id)

    setAdicionandoUm(false)

    if (resultado.erro) {
      setAvisoIndividual({ tipo: 'erro', texto: resultado.erro })
      return
    }

    setAvisoIndividual({ tipo: 'sucesso', texto: `${clienteEscolhido.nome} agora é elegível para ações regionais.` })
    setClienteEscolhido(null)
    recarregar(pagina, termo)
  }

  async function removerUm(id: string, nome: string) {
    setRemovendo(id)
    const resultado = await removerClienteElegivel(id)
    setRemovendo(null)
    setConfirmandoRemocao(null)

    if (resultado.erro) {
      setErroLista(resultado.erro)
      return
    }

    setErroLista(null)
    // Remoção da carteira inteira: recarrega a página atual, que pode ter
    // ficado com uma linha a menos (ou vazia, se era a última da página).
    recarregar(pagina, termo)
    void nome
  }

  async function pesquisarEmMassa() {
    setPesquisandoEmMassa(true)
    setErroEmMassa(null)
    setSucessoEmMassa(null)
    setResultadoEmMassa(null)

    const resultado = await pesquisarClientesPorCnpj(textoColado)

    setPesquisandoEmMassa(false)

    if (resultado.erro) {
      setErroEmMassa(resultado.erro)
      return
    }

    setResultadoEmMassa({ encontrados: resultado.encontrados, naoEncontrados: resultado.naoEncontrados })
  }

  async function confirmarEmMassa() {
    if (!resultadoEmMassa) return
    const idsParaGravar = resultadoEmMassa.encontrados.filter((c) => !c.jaElegivel).map((c) => c.id)

    if (idsParaGravar.length === 0) {
      setSucessoEmMassa('Todos os clientes encontrados já eram elegíveis. Nada para gravar.')
      setResultadoEmMassa(null)
      setTextoColado('')
      return
    }

    setGravandoEmMassa(true)
    setErroEmMassa(null)

    const resultado = await adicionarClientesElegiveisEmMassa(idsParaGravar)

    setGravandoEmMassa(false)

    if (resultado.erro) {
      setErroEmMassa(resultado.erro)
      return
    }

    setSucessoEmMassa(`${resultado.quantidade} cliente${resultado.quantidade === 1 ? '' : 's'} adicionado${resultado.quantidade === 1 ? '' : 's'} como elegível para regional.`)
    setResultadoEmMassa(null)
    setTextoColado('')
    recarregar(pagina, termo)
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <section className="flex-1">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-bold text-[var(--texto)]">
            Clientes elegíveis <span className="font-normal text-[var(--texto-3)]">({total.toLocaleString('pt-BR')})</span>
          </h2>
          <input
            type="text"
            value={termo}
            onChange={(evento) => setTermo(evento.target.value)}
            placeholder="Buscar por nome ou CNPJ…"
            aria-label="Buscar entre os clientes elegíveis"
            className="h-[38px] w-[260px] rounded-[var(--raio-campo)] border border-[var(--borda-forte)] bg-[var(--superficie-suave)] px-3 text-[13px] text-[var(--texto)] outline-none placeholder:text-[var(--placeholder)] focus:border-[#A031F5]"
          />
        </div>

        {erroLista && (
          <p role="alert" className="mb-3 text-[12.5px] font-semibold" style={{ color: 'var(--concorrencia)' }}>
            {erroLista}
          </p>
        )}

        {carregandoLista ? (
          <p className="px-1 py-6 text-[13px] text-[var(--texto-3)]">Carregando…</p>
        ) : clientes.length === 0 ? (
          <EstadoVazio
            titulo={termo.trim() !== '' ? 'Nenhum cliente elegível encontrado' : 'Nenhum cliente elegível ainda'}
            explicacao={
              termo.trim() !== ''
                ? `Nenhum cliente elegível para regional casa com “${termo}”. Confira a grafia ou adicione-o ao lado.`
                : 'Adicione clientes individualmente pela busca ou importe uma lista de CNPJs, ao lado.'
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {clientes.map((cliente) => (
              <li
                key={cliente.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--raio-card)] border border-[var(--borda)] p-4"
                style={{ background: 'var(--superficie)' }}
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-bold text-[var(--texto)]">{cliente.nome}</p>
                  <p className="text-[11.5px] text-[var(--texto-3)]">
                    {cliente.cnpj ?? 'Sem CNPJ'} · {cliente.setor ?? 'Sem setor'} · {cliente.executivo_linear_360 ?? cliente.executivo_digital ?? 'Sem executivo'}
                  </p>
                </div>

                {confirmandoRemocao === cliente.id ? (
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 border-t border-[var(--borda)] pt-2">
                    <span className="mr-auto text-[12px] font-semibold" style={{ color: 'var(--concorrencia)' }}>
                      Remover a elegibilidade de {cliente.nome}? Ele deixa de poder comprar ação regional em qualquer programa.
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmandoRemocao(null)}
                      disabled={removendo === cliente.id}
                      className="cursor-pointer rounded-[10px] border border-[var(--borda-forte)] px-3 py-1.5 text-[12px] font-semibold text-[var(--texto-2)] hover:bg-[var(--superficie-suave)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => removerUm(cliente.id, cliente.nome)}
                      disabled={removendo === cliente.id}
                      className="cursor-pointer rounded-[10px] px-3 py-1.5 text-[12px] font-bold text-[var(--superficie)] disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ background: 'var(--concorrencia)' }}
                    >
                      {removendo === cliente.id ? 'Removendo…' : 'Confirmar remoção'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmandoRemocao(cliente.id)}
                    aria-label={`Remover elegibilidade de ${cliente.nome}`}
                    className="shrink-0 cursor-pointer text-[12px] font-semibold hover:underline"
                    style={{ color: 'var(--concorrencia)' }}
                  >
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {total > 0 && (
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => irParaPagina(pagina - 1)}
              disabled={pagina <= 1 || carregandoLista}
              className="cursor-pointer rounded-[10px] border border-[var(--borda-forte)] px-3 py-1.5 text-[12px] font-semibold text-[var(--texto-2)] enabled:hover:bg-[var(--superficie-suave)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-[12px] text-[var(--texto-3)]">
              Página {pagina} de {totalDePaginas}
            </span>
            <button
              type="button"
              onClick={() => irParaPagina(pagina + 1)}
              disabled={pagina >= totalDePaginas || carregandoLista}
              className="cursor-pointer rounded-[10px] border border-[var(--borda-forte)] px-3 py-1.5 text-[12px] font-semibold text-[var(--texto-2)] enabled:hover:bg-[var(--superficie-suave)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        )}
      </section>

      <aside className="flex w-full flex-col gap-5 lg:w-[400px]">
        <div
          className="rounded-[var(--raio-card)] border border-[var(--borda)] p-5"
          style={{ background: 'var(--superficie)' }}
        >
          <h3 className="text-[14px] font-bold text-[var(--texto)]">Adicionar um cliente</h3>
          <p className="mt-1 text-[12px] text-[var(--texto-3)]">Busque na carteira inteira, não só entre os elegíveis.</p>

          <div className="mt-3">
            <CampoDeBuscaDeCliente
              rotulo="Cliente"
              id="clientes-regionais-busca-individual"
              aoEscolher={(cliente) => {
                setClienteEscolhido(cliente)
                setAvisoIndividual(null)
              }}
            />
          </div>

          {avisoIndividual && (
            <p
              role={avisoIndividual.tipo === 'erro' ? 'alert' : 'status'}
              className="mt-3 text-[12.5px] font-semibold"
              style={{ color: avisoIndividual.tipo === 'erro' ? 'var(--concorrencia)' : 'var(--disponivel)' }}
            >
              {avisoIndividual.texto}
            </p>
          )}

          <BotaoDeGravacao
            type="button"
            gravando={adicionandoUm}
            desabilitado={!clienteEscolhido}
            onClick={adicionarUm}
            className="mt-4 w-full"
          >
            Marcar como elegível
          </BotaoDeGravacao>
        </div>

        <div
          className="rounded-[var(--raio-card)] border border-[var(--borda)] p-5"
          style={{ background: 'var(--superficie)' }}
        >
          <h3 className="text-[14px] font-bold text-[var(--texto)]">Adicionar em massa por CNPJ</h3>
          <p className="mt-1 text-[12px] text-[var(--texto-3)]">
            Cole uma lista de CNPJs, um por linha, com ou sem pontuação.
          </p>

          <label htmlFor="clientes-regionais-cnpjs" className="sr-only">
            Lista de CNPJs
          </label>
          <textarea
            id="clientes-regionais-cnpjs"
            value={textoColado}
            onChange={(evento) => {
              setTextoColado(evento.target.value)
              setResultadoEmMassa(null)
              setSucessoEmMassa(null)
              setErroEmMassa(null)
            }}
            placeholder={'12.345.678/0001-95\n98765432000110\n...'}
            rows={5}
            className="mt-3 w-full rounded-[var(--raio-campo)] border border-[var(--borda-forte)] bg-[var(--superficie-suave)] p-3 font-mono text-[12.5px] text-[var(--texto)] outline-none placeholder:text-[var(--placeholder)] focus:border-[#A031F5]"
          />

          {erroEmMassa && (
            <p role="alert" className="mt-3 text-[12.5px] font-semibold" style={{ color: 'var(--concorrencia)' }}>
              {erroEmMassa}
            </p>
          )}

          {sucessoEmMassa && (
            <p role="status" className="mt-3 text-[12.5px] font-semibold" style={{ color: 'var(--disponivel)' }}>
              {sucessoEmMassa}
            </p>
          )}

          {resultadoEmMassa && (
            <div className="mt-3 flex flex-col gap-3 rounded-[10px] border border-[var(--borda)] p-3">
              <div>
                <p className="text-[12.5px] font-bold" style={{ color: 'var(--disponivel)' }}>
                  {resultadoEmMassa.encontrados.length} encontrado{resultadoEmMassa.encontrados.length === 1 ? '' : 's'} na carteira
                </p>
                {resultadoEmMassa.encontrados.length > 0 && (
                  <ul className="mt-1 max-h-[140px] overflow-y-auto text-[12px] text-[var(--texto-2)]">
                    {resultadoEmMassa.encontrados.map((c) => (
                      <li key={c.id}>
                        {c.nome} {c.jaElegivel && <span className="text-[var(--texto-3)]">(já era elegível)</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {resultadoEmMassa.naoEncontrados.length > 0 && (
                <div>
                  <p className="text-[12.5px] font-bold" style={{ color: 'var(--concorrencia)' }}>
                    {resultadoEmMassa.naoEncontrados.length} não encontrado{resultadoEmMassa.naoEncontrados.length === 1 ? '' : 's'} na carteira
                  </p>
                  <ul className="mt-1 max-h-[100px] overflow-y-auto font-mono text-[12px] text-[var(--texto-3)]">
                    {resultadoEmMassa.naoEncontrados.map((cnpj, indice) => (
                      <li key={`${cnpj}-${indice}`}>{cnpj}</li>
                    ))}
                  </ul>
                </div>
              )}

              <BotaoDeGravacao
                type="button"
                gravando={gravandoEmMassa}
                desabilitado={resultadoEmMassa.encontrados.length === 0}
                onClick={confirmarEmMassa}
                className="w-full"
              >
                Confirmar e adicionar {resultadoEmMassa.encontrados.filter((c) => !c.jaElegivel).length} cliente
                {resultadoEmMassa.encontrados.filter((c) => !c.jaElegivel).length === 1 ? '' : 's'}
              </BotaoDeGravacao>
            </div>
          )}

          {!resultadoEmMassa && (
            <button
              type="button"
              onClick={pesquisarEmMassa}
              disabled={pesquisandoEmMassa || textoColado.trim() === ''}
              className="mt-4 h-[40px] w-full cursor-pointer rounded-[12px] border border-[var(--borda-forte)] text-[13px] font-bold text-[var(--texto-2)] enabled:hover:bg-[var(--superficie-suave)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pesquisandoEmMassa ? 'Pesquisando…' : 'Pesquisar na carteira'}
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}

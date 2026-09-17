'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  adicionarExecutivo,
  importarCadastroExecutivo,
  removerExecutivo,
  type ResultadoImportacaoCadastroExecutivo,
} from '@/lib/acoes/cadastro-executivo'
import type { ExecutivoCadastrado } from '@/lib/dados/carteira-executivo'

type Props = {
  executivosIniciais: ExecutivoCadastrado[]
}

const FORMULARIO_VAZIO = { id: null as string | null, nome: '', email: '', nomeSalesforce: '' }

export function PainelDeCadastroExecutivo({ executivosIniciais }: Props) {
  const router = useRouter()
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacaoCadastroExecutivo | null>(null)

  const [formulario, setFormulario] = useState(FORMULARIO_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [mensagemUnitaria, setMensagemUnitaria] = useState<string | null>(null)

  const [busca, setBusca] = useState('')
  const [removendoId, setRemovendoId] = useState<string | null>(null)

  const editando = formulario.id !== null

  const executivosFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    if (!termo) return executivosIniciais
    return executivosIniciais.filter((executivo) =>
      `${executivo.executivo_linear_360} ${executivo.email} ${executivo.nome_salesforce ?? ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(termo),
    )
  }, [busca, executivosIniciais])

  async function aoEnviarArquivo(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!arquivoRef.current?.files?.[0]) return
    setEnviando(true)
    setResultado(null)

    const formularioDeArquivo = new FormData()
    formularioDeArquivo.append('arquivo', arquivoRef.current.files[0])
    const retorno = await importarCadastroExecutivo(formularioDeArquivo)

    setResultado(retorno)
    setEnviando(false)
    if (!retorno.erro) {
      if (arquivoRef.current) arquivoRef.current.value = ''
      router.refresh()
    }
  }

  function editar(executivo: ExecutivoCadastrado) {
    setFormulario({
      id: executivo.id,
      nome: executivo.executivo_linear_360,
      email: executivo.email,
      nomeSalesforce: executivo.nome_salesforce ?? '',
    })
    setMensagemUnitaria(null)
  }

  function cancelarEdicao() {
    setFormulario(FORMULARIO_VAZIO)
    setMensagemUnitaria(null)
  }

  async function aoSalvarUnitario(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setSalvando(true)
    setMensagemUnitaria(null)

    const retorno = await adicionarExecutivo({
      executivoLinear360: formulario.nome,
      email: formulario.email,
      nomeSalesforce: formulario.nomeSalesforce,
    })

    setSalvando(false)
    setMensagemUnitaria(retorno.erro ?? `“${formulario.nome}” ${editando ? 'atualizado' : 'cadastrado'}.`)
    if (!retorno.erro) {
      setFormulario(FORMULARIO_VAZIO)
      router.refresh()
    }
  }

  async function remover(executivo: ExecutivoCadastrado) {
    if (!window.confirm(`Remover "${executivo.executivo_linear_360}" (${executivo.email}) do Cadastro Executivo?`)) return
    setRemovendoId(executivo.id)
    const retorno = await removerExecutivo(executivo.id)
    setRemovendoId(null)
    if (retorno.erro) window.alert(retorno.erro)
    else router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] p-5">
        <h2 className="text-[15px] font-bold text-[var(--texto)]">Importar planilha</h2>
        <p className="mt-1 max-w-[680px] text-[12.5px] leading-[1.55] text-[var(--texto-3)]">
          Envie o arquivo .xlsx com as colunas Executivo Linear (360), Email e Nome no Salesforce. O e-mail
          é a chave: liga a conta que loga no Globo Slots ao nome usado na Carteira Siscom, e por isso decide
          quais clientes cada executivo pode ver ao montar uma consulta.
        </p>

        <form onSubmit={aoEnviarArquivo} className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={arquivoRef}
            type="file"
            accept=".xlsx"
            required
            className="text-[12.5px] text-[var(--texto-2)]"
          />
          <button
            type="submit"
            disabled={enviando}
            className="h-10 rounded-[10px] px-5 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: 'var(--marca)' }}
          >
            {enviando ? 'Importando…' : 'Importar'}
          </button>
        </form>

        {resultado && (
          <div
            className="mt-4 rounded-[11px] px-4 py-3 text-[12.5px] leading-[1.6]"
            style={
              resultado.erro
                ? { background: 'var(--concorrencia-fundo)', color: 'var(--concorrencia-texto)' }
                : { background: 'var(--disponivel-fundo)', color: 'var(--disponivel-texto)' }
            }
          >
            {resultado.erro ?? (
              <>
                {resultado.recebidos} linhas lidas · {resultado.descartados} sem nome ou e-mail válido · {' '}
                <strong>{resultado.gravados} gravados</strong>
              </>
            )}
          </div>
        )}
      </section>

      <section className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] p-5">
        <h2 className="text-[15px] font-bold text-[var(--texto)]">{editando ? 'Editar executivo' : 'Cadastrar um executivo'}</h2>
        <p className="mt-1 text-[12.5px] text-[var(--texto-3)]">
          {editando
            ? 'Alterar o e-mail cria um registro novo — para renomear a conta, remova a linha antiga depois.'
            : 'Grava ou atualiza um único executivo, sem precisar subir a planilha inteira.'}
        </p>

        <form onSubmit={aoSalvarUnitario} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11.5px] font-bold text-[var(--texto-3)]">
            Executivo Linear (360)
            <input
              value={formulario.nome}
              required
              onChange={(evento) => setFormulario((f) => ({ ...f, nome: evento.target.value }))}
              className="h-10 rounded-[9px] border border-[var(--borda-forte)] bg-white px-3 text-[13px] font-normal text-[var(--texto)] outline-none focus:ring-2 focus:ring-[var(--roxo)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] font-bold text-[var(--texto-3)]">
            Email
            <input
              type="email"
              value={formulario.email}
              required
              onChange={(evento) => setFormulario((f) => ({ ...f, email: evento.target.value }))}
              className="h-10 rounded-[9px] border border-[var(--borda-forte)] bg-white px-3 text-[13px] font-normal text-[var(--texto)] outline-none focus:ring-2 focus:ring-[var(--roxo)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] font-bold text-[var(--texto-3)] sm:col-span-2">
            Nome no Salesforce
            <input
              value={formulario.nomeSalesforce}
              onChange={(evento) => setFormulario((f) => ({ ...f, nomeSalesforce: evento.target.value }))}
              className="h-10 rounded-[9px] border border-[var(--borda-forte)] bg-white px-3 text-[13px] font-normal text-[var(--texto)] outline-none focus:ring-2 focus:ring-[var(--roxo)]"
            />
          </label>

          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={salvando || !formulario.nome.trim() || !formulario.email.trim()}
              className="h-10 rounded-[10px] px-5 text-[12.5px] font-bold text-white disabled:opacity-50"
              style={{ background: 'var(--marca)' }}
            >
              {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar executivo'}
            </button>
            {editando && (
              <button
                type="button"
                onClick={cancelarEdicao}
                className="h-10 rounded-[10px] border border-[var(--borda-forte)] px-4 text-[12.5px] font-bold text-[var(--texto-2)]"
              >
                Cancelar
              </button>
            )}
            {mensagemUnitaria && <span className="text-[12px] text-[var(--texto-2)]">{mensagemUnitaria}</span>}
          </div>
        </form>
      </section>

      <section className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold text-[var(--texto)]">Executivos cadastrados</h2>
          <input
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="h-10 w-full max-w-[280px] rounded-[9px] border border-[var(--borda-forte)] bg-white px-3 text-[13px] outline-none focus:ring-2 focus:ring-[var(--roxo)]"
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className="border-b border-[var(--borda)] px-3 py-2 text-[11px] uppercase text-[var(--texto-3)]">Executivo Linear (360)</th>
                <th className="border-b border-[var(--borda)] px-3 py-2 text-[11px] uppercase text-[var(--texto-3)]">Email</th>
                <th className="border-b border-[var(--borda)] px-3 py-2 text-[11px] uppercase text-[var(--texto-3)]">Nome no Salesforce</th>
                <th className="border-b border-[var(--borda)] px-3 py-2 text-[11px] uppercase text-[var(--texto-3)]" />
              </tr>
            </thead>
            <tbody>
              {executivosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-[12.5px] text-[var(--texto-3)]">
                    {executivosIniciais.length === 0 ? 'Nenhum executivo cadastrado ainda.' : 'Nenhum resultado para essa busca.'}
                  </td>
                </tr>
              ) : (
                executivosFiltrados.map((executivo) => (
                  <tr key={executivo.id}>
                    <td className="border-b border-[var(--borda)] px-3 py-3 text-[12.5px] font-semibold text-[var(--texto)]">{executivo.executivo_linear_360}</td>
                    <td className="border-b border-[var(--borda)] px-3 py-3 text-[12.5px] text-[var(--texto-2)]">{executivo.email}</td>
                    <td className="border-b border-[var(--borda)] px-3 py-3 text-[12.5px] text-[var(--texto-2)]">{executivo.nome_salesforce ?? '—'}</td>
                    <td className="border-b border-[var(--borda)] px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => editar(executivo)}
                        className="mr-2 text-[12px] font-bold text-[var(--roxo)]"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={removendoId === executivo.id}
                        onClick={() => remover(executivo)}
                        className="text-[12px] font-bold text-[var(--concorrencia-texto)] disabled:opacity-50"
                      >
                        {removendoId === executivo.id ? 'Removendo…' : 'Remover'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

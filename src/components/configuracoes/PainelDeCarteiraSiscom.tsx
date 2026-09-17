'use client'

import { useRef, useState } from 'react'
import {
  adicionarClienteNaCarteiraSiscom,
  importarCarteiraSiscom,
  type ResultadoImportacaoCarteiraSiscom,
} from '@/lib/acoes/carteira-siscom'

const CAMPO_INICIAL = {
  nome: '',
  cnpj: '',
  codSiscom: '',
  setor: '',
  industria: '',
  headSetor: '',
  gerenteIndustria: '',
  executivoLinear360: '',
  executivoDigital: '',
}

export function PainelDeCarteiraSiscom() {
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacaoCarteiraSiscom | null>(null)

  const [campos, setCampos] = useState(CAMPO_INICIAL)
  const [aptoRegional, setAptoRegional] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagemUnitaria, setMensagemUnitaria] = useState<string | null>(null)

  async function aoEnviarArquivo(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!arquivoRef.current?.files?.[0]) return
    setEnviando(true)
    setResultado(null)

    const formulario = new FormData()
    formulario.append('arquivo', arquivoRef.current.files[0])
    const retorno = await importarCarteiraSiscom(formulario)

    setResultado(retorno)
    setEnviando(false)
    if (!retorno.erro && arquivoRef.current) arquivoRef.current.value = ''
  }

  async function aoSalvarUnitario(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setSalvando(true)
    setMensagemUnitaria(null)

    const retorno = await adicionarClienteNaCarteiraSiscom({ ...campos, aptoRegional })

    setSalvando(false)
    setMensagemUnitaria(retorno.erro ?? `“${campos.nome}” gravado na Carteira Siscom.`)
    if (!retorno.erro) {
      setCampos(CAMPO_INICIAL)
      setAptoRegional(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] p-5">
        <h2 className="text-[15px] font-bold text-[var(--texto)]">Importar planilha</h2>
        <p className="mt-1 max-w-[680px] text-[12.5px] leading-[1.55] text-[var(--texto-3)]">
          Envie o arquivo .xlsx com as colunas Cliente, CNPJ, Cód SISCOM, Setor, Indústria, Head Setor,
          Gerente Indústria, Executivo Linear (360), Executivo Digital e Elegível para regional. Cada envio
          atualiza os clientes já cadastrados (por nome) e cria os que ainda não existem — ninguém é apagado.
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
                {resultado.recebidos} linhas lidas · {resultado.descartados} sem &quot;Cliente&quot; · {' '}
                <strong>{resultado.inseridos} novos</strong> · <strong>{resultado.atualizados} atualizados</strong>
              </>
            )}
          </div>
        )}
      </section>

      <section className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] p-5">
        <h2 className="text-[15px] font-bold text-[var(--texto)]">Cadastrar um cliente</h2>
        <p className="mt-1 text-[12.5px] text-[var(--texto-3)]">
          Grava ou atualiza um único cliente, sem precisar subir a planilha inteira.
        </p>

        <form onSubmit={aoSalvarUnitario} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Cliente" valor={campos.nome} obrigatorio onMudar={(v) => setCampos((c) => ({ ...c, nome: v }))} />
          <Campo rotulo="CNPJ" valor={campos.cnpj} onMudar={(v) => setCampos((c) => ({ ...c, cnpj: v }))} />
          <Campo rotulo="Cód SISCOM" valor={campos.codSiscom} onMudar={(v) => setCampos((c) => ({ ...c, codSiscom: v }))} />
          <Campo rotulo="Setor" valor={campos.setor} onMudar={(v) => setCampos((c) => ({ ...c, setor: v }))} />
          <Campo rotulo="Indústria" valor={campos.industria} onMudar={(v) => setCampos((c) => ({ ...c, industria: v }))} />
          <Campo rotulo="Head Setor" valor={campos.headSetor} onMudar={(v) => setCampos((c) => ({ ...c, headSetor: v }))} />
          <Campo rotulo="Gerente Indústria" valor={campos.gerenteIndustria} onMudar={(v) => setCampos((c) => ({ ...c, gerenteIndustria: v }))} />
          <Campo rotulo="Executivo Linear (360)" valor={campos.executivoLinear360} onMudar={(v) => setCampos((c) => ({ ...c, executivoLinear360: v }))} />
          <Campo rotulo="Executivo Digital" valor={campos.executivoDigital} onMudar={(v) => setCampos((c) => ({ ...c, executivoDigital: v }))} />

          <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--texto-2)] sm:col-span-2">
            <input type="checkbox" checked={aptoRegional} onChange={(e) => setAptoRegional(e.target.checked)} className="h-4 w-4 accent-[var(--roxo)]" />
            Elegível para regional
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={salvando || !campos.nome.trim()}
              className="h-10 rounded-[10px] px-5 text-[12.5px] font-bold text-white disabled:opacity-50"
              style={{ background: 'var(--marca)' }}
            >
              {salvando ? 'Salvando…' : 'Salvar cliente'}
            </button>
            {mensagemUnitaria && <span className="ml-3 text-[12px] text-[var(--texto-2)]">{mensagemUnitaria}</span>}
          </div>
        </form>
      </section>
    </div>
  )
}

function Campo({
  rotulo,
  valor,
  obrigatorio,
  onMudar,
}: {
  rotulo: string
  valor: string
  obrigatorio?: boolean
  onMudar: (valor: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-[11.5px] font-bold text-[var(--texto-3)]">
      {rotulo}
      <input
        value={valor}
        required={obrigatorio}
        onChange={(evento) => onMudar(evento.target.value)}
        className="h-10 rounded-[9px] border border-[var(--borda-forte)] bg-white px-3 text-[13px] font-normal text-[var(--texto)] outline-none focus:ring-2 focus:ring-[var(--roxo)]"
      />
    </label>
  )
}

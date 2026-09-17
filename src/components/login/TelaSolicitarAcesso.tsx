'use client'

import { useState } from 'react'
import { solicitarAcesso } from '@/lib/acoes/solicitacoes-de-acesso'
import { MarcaGloboSlots } from '@/components/layout/MarcaGloboSlots'
import { PainelApresentacao } from './PainelApresentacao'
import { FormularioSolicitarAcesso } from './FormularioSolicitarAcesso'

/**
 * Tela pública "Solicitar acesso" — `/solicitar-acesso`, fora do grupo `(app)`.
 *
 * Existe porque, desde a Carteira Siscom, nem toda conta autenticada vira
 * Executivo automaticamente (só quem está no Cadastro Executivo). Sem ela,
 * alguém sem perfil ficaria sem nenhum jeito de pedir acesso pelo próprio app.
 */
export function TelaSolicitarAcesso() {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [perfilSolicitado, setPerfilSolicitado] = useState('executivo')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function aoEnviar() {
    if (enviando) return
    setEnviando(true)
    setErro(null)

    const resultado = await solicitarAcesso({ nome, email, perfilSolicitado })
    setEnviando(false)
    if (resultado.erro) {
      setErro(resultado.erro)
      return
    }
    setEnviado(true)
  }

  return (
    <main className="min-h-screen bg-white text-[#14161a]">
      <header className="border-b border-[#eceef1] bg-white">
        <div className="mx-auto flex h-[72px] w-full max-w-[1240px] items-center justify-between px-5 sm:px-8">
          <MarcaGloboSlots href="/login" />
          <span className="hidden text-[12px] font-medium text-[#737983] sm:block">Plataforma comercial Globo</span>
        </div>
      </header>

      <section className="bg-[#f6f7f8] px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
        <div className="mx-auto grid w-full max-w-[1240px] gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)] lg:items-stretch">
          <PainelApresentacao />
          <FormularioSolicitarAcesso
            nome={nome}
            email={email}
            perfilSolicitado={perfilSolicitado}
            erro={erro}
            enviando={enviando}
            enviado={enviado}
            aoMudarNome={(valor) => { setNome(valor); setErro(null) }}
            aoMudarEmail={(valor) => { setEmail(valor); setErro(null) }}
            aoMudarPerfil={setPerfilSolicitado}
            aoEnviar={aoEnviar}
          />
        </div>
      </section>

      <footer className="bg-white px-5 py-5 text-center text-[10.5px] text-[#9298a1]">
        Globo Slots · Oportunidades, disponibilidade e propostas comerciais
      </footer>
    </main>
  )
}

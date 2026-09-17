'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sair } from '@/lib/autenticacao'
import { MarcaGloboSlots } from '@/components/layout/MarcaGloboSlots'

/**
 * Conta autenticada, mas sem nenhum perfil — desde que o Executivo automático
 * passou a exigir Cadastro Executivo (ver `src/lib/sessao-servidor.ts`), isso
 * deixou de ser impossível. Fica no grupo `(app)` (a pessoa está logada de
 * verdade), então precisa de um jeito de sair, não de um redirect para
 * `/login` — ela voltaria pro mesmo lugar.
 */
export function TelaSemAcesso({ email }: { email: string }) {
  const router = useRouter()
  const [saindo, setSaindo] = useState(false)

  async function encerrarSessao() {
    if (saindo) return
    setSaindo(true)
    await sair()
    router.replace('/login')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7f8] p-4">
      <div className="w-full max-w-[440px] rounded-[24px] border border-[#e6e8eb] bg-white px-8 py-10 text-center shadow-[0_24px_60px_-42px_rgba(20,22,26,.35)]">
        <div className="flex justify-center"><MarcaGloboSlots /></div>
        <h1 className="mt-6 text-[22px] font-bold text-[#14161a]">Sua conta ainda não tem acesso</h1>
        <p className="mt-2 text-[13.5px] leading-[1.6] text-[#6b717b]">
          <strong className="text-[#14161a]">{email}</strong> está autenticado, mas nenhum perfil foi liberado
          ainda. Solicite acesso ou fale com o Proprietário do Globo Slots.
        </p>

        <Link
          href="/solicitar-acesso"
          className="mt-6 block h-[48px] rounded-[12px] bg-[linear-gradient(90deg,#2d6bff_0%,#6750ff_55%,#8124f5_100%)] text-[14px] font-bold leading-[48px] text-white"
        >
          Solicitar acesso
        </Link>

        <button
          type="button"
          onClick={encerrarSessao}
          disabled={saindo}
          className="mt-3 h-[48px] w-full rounded-[12px] border border-[#d8dce2] text-[13px] font-bold text-[#4f5660] disabled:opacity-60"
        >
          {saindo ? 'Saindo…' : 'Sair'}
        </button>
      </div>
    </main>
  )
}

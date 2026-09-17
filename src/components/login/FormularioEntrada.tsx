'use client'

import Link from 'next/link'

type Props = {
  email: string
  senha: string
  erro: string | null
  entrando: boolean
  aoMudarEmail: (valor: string) => void
  aoMudarSenha: (valor: string) => void
  aoEntrar: () => void
}

export function FormularioEntrada({ email, senha, erro, entrando, aoMudarEmail, aoMudarSenha, aoEntrar }: Props) {
  return (
    <div className="flex h-full flex-col justify-center rounded-[24px] border border-[#e6e8eb] bg-white px-7 py-9 shadow-[0_24px_60px_-42px_rgba(20,22,26,.35)] sm:px-10 sm:py-11">
      <p className="vitrine-pop text-[10px] font-bold uppercase tracking-[1.8px] text-[#2468ff]">Globo Slots</p>
      <h2 className="vitrine-pop mt-2 text-[30px] font-semibold tracking-[-.8px] text-[#111318]">Entrar</h2>
      <p className="mb-8 mt-2 text-[14px] text-[#6b717b]">Acesse com sua conta corporativa.</p>

      <form method="post" noValidate className="flex flex-col gap-[18px]" onSubmit={(evento) => { evento.preventDefault(); aoEntrar() }}>
        <div>
          <label htmlFor="email" className="mb-[7px] block text-[12px] font-semibold text-[#4f5660]">E-mail corporativo</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(evento) => aoMudarEmail(evento.target.value)}
            placeholder="nome@empresa.com.br"
            aria-invalid={erro !== null}
            className="h-[52px] w-full rounded-[12px] border border-[#d8dce2] bg-white px-4 text-[14px] text-[#17191d] outline-none transition placeholder:text-[#a8adb5] focus:border-[#4d62ff] focus:ring-4 focus:ring-[#4d62ff]/10"
          />
        </div>

        <div>
          <label htmlFor="senha" className="mb-[7px] block text-[12px] font-semibold text-[#4f5660]">Senha</label>
          <input
            id="senha"
            name="senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(evento) => aoMudarSenha(evento.target.value)}
            placeholder="••••••••••"
            aria-invalid={erro !== null}
            className="h-[52px] w-full rounded-[12px] border border-[#d8dce2] bg-white px-4 text-[14px] text-[#17191d] outline-none transition placeholder:text-[#a8adb5] focus:border-[#4d62ff] focus:ring-4 focus:ring-[#4d62ff]/10"
          />
        </div>

        <div className="flex justify-end">
          <Link href="/esqueci-senha" className="text-[12px] font-semibold text-[#4254e8] hover:underline">Esqueci minha senha</Link>
        </div>

        {erro && <p role="alert" className="rounded-[10px] bg-[#fff1f3] px-3 py-2.5 text-[12px] font-semibold text-[#b42345]">{erro}</p>}

        <button
          type="submit"
          disabled={entrando}
          className="vitrine-pop h-[52px] rounded-[12px] bg-[linear-gradient(90deg,#2d6bff_0%,#6750ff_55%,#8124f5_100%)] text-[14px] font-bold text-white shadow-[0_14px_28px_-18px_rgba(73,75,255,.75)] transition enabled:cursor-pointer enabled:hover:-translate-y-px enabled:hover:shadow-[0_18px_34px_-18px_rgba(73,75,255,.7)] disabled:opacity-70"
        >
          {entrando ? 'Entrando…' : 'Entrar no Globo Slots'}
        </button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-[#6b717b]">
        Ainda não tem acesso? <Link href="/solicitar-acesso" className="font-semibold text-[#4254e8] hover:underline">Solicitar acesso</Link>
      </p>
    </div>
  )
}

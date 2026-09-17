'use client'

import Link from 'next/link'

export type OpcaoDePerfil = { valor: string; rotulo: string }

export const OPCOES_DE_PERFIL_PARA_SOLICITACAO: OpcaoDePerfil[] = [
  { valor: 'executivo', rotulo: 'Executivo' },
  { valor: 'executivo_regional', rotulo: 'Executivo regional' },
  { valor: 'consultor_programa', rotulo: 'PO do produto' },
  { valor: 'proprietario', rotulo: 'Proprietário' },
]

type Props = {
  nome: string
  email: string
  perfilSolicitado: string
  erro: string | null
  enviando: boolean
  enviado: boolean
  aoMudarNome: (valor: string) => void
  aoMudarEmail: (valor: string) => void
  aoMudarPerfil: (valor: string) => void
  aoEnviar: () => void
}

export function FormularioSolicitarAcesso({
  nome,
  email,
  perfilSolicitado,
  erro,
  enviando,
  enviado,
  aoMudarNome,
  aoMudarEmail,
  aoMudarPerfil,
  aoEnviar,
}: Props) {
  return (
    <div className="flex h-full flex-col justify-center rounded-[24px] border border-[#e6e8eb] bg-white px-7 py-9 shadow-[0_24px_60px_-42px_rgba(20,22,26,.35)] sm:px-10 sm:py-11">
      <p className="vitrine-pop text-[10px] font-bold uppercase tracking-[1.8px] text-[#2468ff]">Globo Slots</p>
      <h2 className="vitrine-pop mt-2 text-[30px] font-semibold tracking-[-.8px] text-[#111318]">Solicitar acesso</h2>
      <p className="mb-8 mt-2 text-[14px] text-[#6b717b]">
        Peça acesso ao Globo Slots. O Proprietário analisa e libera seu perfil.
      </p>

      {enviado ? (
        <div role="status" className="rounded-[12px] bg-[#f0f4ff] px-4 py-4 text-[14px] text-[#17191d]">
          Solicitação enviada. Assim que for aprovada, você recebe um e-mail para criar sua senha.
        </div>
      ) : (
        <form
          method="post"
          noValidate
          className="flex flex-col gap-[18px]"
          onSubmit={(evento) => {
            evento.preventDefault()
            aoEnviar()
          }}
        >
          <div>
            <label htmlFor="nome" className="mb-[7px] block text-[12px] font-semibold text-[#4f5660]">Nome</label>
            <input
              id="nome"
              name="nome"
              autoComplete="name"
              autoFocus
              value={nome}
              onChange={(evento) => aoMudarNome(evento.target.value)}
              placeholder="Seu nome completo"
              aria-invalid={erro !== null}
              className="h-[52px] w-full rounded-[12px] border border-[#d8dce2] bg-white px-4 text-[14px] text-[#17191d] outline-none transition placeholder:text-[#a8adb5] focus:border-[#4d62ff] focus:ring-4 focus:ring-[#4d62ff]/10"
            />
          </div>

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
            <label htmlFor="perfil" className="mb-[7px] block text-[12px] font-semibold text-[#4f5660]">Perfil desejado</label>
            <select
              id="perfil"
              name="perfil"
              value={perfilSolicitado}
              onChange={(evento) => aoMudarPerfil(evento.target.value)}
              className="h-[52px] w-full rounded-[12px] border border-[#d8dce2] bg-white px-4 text-[14px] text-[#17191d] outline-none transition focus:border-[#4d62ff] focus:ring-4 focus:ring-[#4d62ff]/10"
            >
              {OPCOES_DE_PERFIL_PARA_SOLICITACAO.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
              ))}
            </select>
            <p className="mt-[7px] text-[11.5px] text-[#9298a1]">O Proprietário confirma o perfil final ao aprovar.</p>
          </div>

          {erro && <p role="alert" className="rounded-[10px] bg-[#fff1f3] px-3 py-2.5 text-[12px] font-semibold text-[#b42345]">{erro}</p>}

          <button
            type="submit"
            disabled={enviando}
            className="vitrine-pop h-[52px] rounded-[12px] bg-[linear-gradient(90deg,#2d6bff_0%,#6750ff_55%,#8124f5_100%)] text-[14px] font-bold text-white shadow-[0_14px_28px_-18px_rgba(73,75,255,.75)] transition enabled:cursor-pointer enabled:hover:-translate-y-px enabled:hover:shadow-[0_18px_34px_-18px_rgba(73,75,255,.7)] disabled:opacity-70"
          >
            {enviando ? 'Enviando…' : 'Solicitar acesso'}
          </button>
        </form>
      )}

      <Link href="/login" className="mt-8 text-[12px] font-semibold text-[#4254e8] hover:underline">← Voltar para o login</Link>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { sair } from '@/lib/autenticacao'
import { temPerfil, type Perfil, type SecaoApp } from '@/lib/dominio/perfis'
import { MarcaGloboSlots } from './MarcaGloboSlots'

type Props = {
  nome: string
  perfis: Perfil[]
  secoes: SecaoApp[]
}

type Item = { href: string; rotulo: string; mostrar: boolean }

const ROTULOS_PERFIL: Record<Perfil, string> = {
  executivo: 'Executivo comercial',
  executivo_regional: 'Executivo regional',
  consultor_programa: 'PO do produto',
  proprietario: 'Proprietário',
}

export function TopoGlobal({ nome, perfis, secoes }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuAberto, setMenuAberto] = useState(false)
  const [saindo, setSaindo] = useState(false)

  const podePublicar = temPerfil(perfis, 'consultor_programa') || temPerfil(perfis, 'proprietario')
  const itens: Item[] = [
    { href: '/oportunidades', rotulo: 'Oportunidades', mostrar: secoes.includes('oportunidades') },
    { href: '/calendario', rotulo: 'Calendário', mostrar: true },
    { href: '/consulta', rotulo: 'Nova consulta', mostrar: secoes.includes('consulta') },
    { href: '/propostas', rotulo: 'Propostas', mostrar: secoes.includes('propostas') },
    { href: '/aprovacoes', rotulo: 'Aprovações', mostrar: secoes.includes('aprovacoes') },
    { href: '/desempenho', rotulo: 'Desempenho', mostrar: secoes.includes('inicio') },
  ].filter((item) => item.mostrar)

  useEffect(() => {
    function fechar(evento: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(evento.target as Node)) setMenuAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [])

  function ativo(href: string) {
    if (href === '/oportunidades') return pathname === '/oportunidades' || pathname.startsWith('/oportunidades/') || pathname === '/vitrine'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  async function encerrarSessao() {
    if (saindo) return
    setSaindo(true)
    await sair()
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(20,22,26,.07)] bg-[rgba(236,238,241,.92)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-[58px] max-w-[1440px] flex-wrap items-center gap-x-5 px-5 sm:px-7 lg:flex-nowrap">
        <MarcaGloboSlots compacta />

        <nav className="vitrine-nav-scroll order-3 flex w-full min-w-0 gap-5 overflow-x-auto lg:order-none lg:w-auto lg:flex-1 lg:overflow-visible xl:gap-6" aria-label="Navegação principal">
          {itens.map((item) => {
            const selecionado = ativo(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`vitrine-navlink whitespace-nowrap ${selecionado ? 'on' : ''}`}
              >
                {item.rotulo}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {podePublicar && (
            <Link
              href="/oportunidades/postar"
              className="vitrine-pop hidden rounded-full bg-[#14161a] px-[15px] py-[9px] text-[12px] font-bold text-white transition-transform active:scale-95 md:inline-flex"
            >
              + Publicar oportunidade
            </Link>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuAberto((valor) => !valor)}
              aria-expanded={menuAberto}
              aria-label="Abrir menu da conta"
              className="vitrine-pop flex h-[36px] w-[36px] items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#1e90ff] text-[11.5px] font-bold text-white transition-transform active:scale-95"
            >
              {iniciais(nome)}
            </button>

            {menuAberto && (
              <div className="absolute right-0 top-[46px] w-[250px] overflow-hidden rounded-[16px] border border-[#e4e6ea] bg-white shadow-[0_22px_50px_-20px_rgba(20,22,26,.35)]">
                <div className="border-b border-[#eceef1] px-4 py-3.5">
                  <p className="truncate text-[13px] font-bold text-[#14161a]">{nome}</p>
                  <p className="mt-0.5 truncate text-[10.5px] font-semibold text-[#9aa0a8]">
                    {perfis.map((perfil) => ROTULOS_PERFIL[perfil]).join(' · ')}
                  </p>
                </div>

                <div className="p-2">
                  {podePublicar && (
                    <Link href="/oportunidades/postar" onClick={() => setMenuAberto(false)} className="block rounded-[10px] px-3 py-2.5 text-[12px] font-bold text-[#14161a] hover:bg-[#f5f6f7] md:hidden">
                      + Publicar oportunidade
                    </Link>
                  )}
                  {secoes.includes('configuracoes') && (
                    <Link href="/configuracoes" onClick={() => setMenuAberto(false)} className="block rounded-[10px] px-3 py-2.5 text-[12px] font-semibold text-[#5a606a] hover:bg-[#f5f6f7]">
                      Configurações
                    </Link>
                  )}
                  {/* <a> puro, não <Link>: "/amplificado" só existe pelo rewrite Multi-Zones do next.config.ts; o <Link> tentaria navegação RSC e daria 404. */}
                  <a
                    href="/amplificado"
                    className="block rounded-[10px] px-3 py-2.5 text-[12px] font-semibold text-[#5a606a] hover:bg-[#f5f6f7]"
                  >
                    Hub Amplificado
                  </a>
                  <button
                    type="button"
                    onClick={encerrarSessao}
                    disabled={saindo}
                    className="w-full rounded-[10px] px-3 py-2.5 text-left text-[12px] font-semibold text-[#5a606a] hover:bg-[#f5f6f7] disabled:opacity-50"
                  >
                    {saindo ? 'Saindo…' : 'Sair'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function iniciais(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('') || '?'
}

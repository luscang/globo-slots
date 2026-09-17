import { redirect } from 'next/navigation'
import { obterSessao } from '@/lib/sessao-servidor'
import { ShellGloboSlots } from '@/components/layout/ShellGloboSlots'
import { TelaSemAcesso } from '@/components/login/TelaSemAcesso'

/** Toda rota deste grupo depende da sessão de quem está logado. */
export const dynamic = 'force-dynamic'

/** Shell autenticado do Globo Slots. */
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao()

  if (!sessao) redirect('/login')

  // Autenticado, mas sem nenhum perfil (não está no Cadastro Executivo nem
  // recebeu perfil explícito) — não é "não logado", por isso não é /login.
  if (sessao.perfis.length === 0) return <TelaSemAcesso email={sessao.email} />

  return (
    <ShellGloboSlots nome={sessao.nome} perfis={sessao.perfis} secoes={sessao.secoes}>
      {children}
    </ShellGloboSlots>
  )
}

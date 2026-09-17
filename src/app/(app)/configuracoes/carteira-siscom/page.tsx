import { obterSessao } from '@/lib/sessao-servidor'
import { podeAdministrarGovernancaGlobal } from '@/lib/dominio/perfis'
import { PainelDeCarteiraSiscom } from '@/components/configuracoes/PainelDeCarteiraSiscom'

/** Configuração global: somente Proprietário. */
export default async function PaginaDeCarteiraSiscom() {
  const sessao = await obterSessao()

  if (!sessao || !podeAdministrarGovernancaGlobal(sessao.perfis)) {
    return (
      <section className="rounded-[var(--raio-janela)] border border-[var(--borda)] bg-[var(--superficie)] p-10">
        <h1 className="text-[26px] font-bold" style={{ fontFamily: 'var(--fonte-titulo)' }}>Carteira Siscom</h1>
        <p className="mt-2 text-[13px] text-[var(--concorrencia)]">Somente Proprietário pode administrar a Carteira Siscom.</p>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-[var(--roxo)]">Governança de dados</p>
        <h1 className="mt-1 text-[26px] font-bold text-[var(--texto)]" style={{ fontFamily: 'var(--fonte-titulo)' }}>Carteira Siscom</h1>
        <p className="mt-1 text-[13px] text-[var(--texto-3)]">
          Cadastro de clientes com setor, indústria e os responsáveis (Executivo Linear e Digital) que
          definem quem pode ver cada cliente ao montar uma consulta.
        </p>
      </header>

      <PainelDeCarteiraSiscom />
    </div>
  )
}

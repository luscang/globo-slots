import { obterSessao } from '@/lib/sessao-servidor'
import { podeAdministrarGovernancaGlobal } from '@/lib/dominio/perfis'
import { listarExecutivos } from '@/lib/dados/carteira-executivo'
import { PainelDeCadastroExecutivo } from '@/components/configuracoes/PainelDeCadastroExecutivo'

/** Administração de acesso: somente Proprietário. */
export default async function PaginaDeCadastroExecutivo() {
  const sessao = await obterSessao()

  if (!sessao || !podeAdministrarGovernancaGlobal(sessao.perfis)) {
    return (
      <section className="rounded-[var(--raio-janela)] border border-[var(--borda)] bg-[var(--superficie)] p-10">
        <h1 className="text-[26px] font-bold" style={{ fontFamily: 'var(--fonte-titulo)' }}>Cadastro Executivo</h1>
        <p className="mt-2 text-[13px] text-[var(--concorrencia)]">Somente Proprietário pode administrar o Cadastro Executivo.</p>
      </section>
    )
  }

  const executivos = await listarExecutivos()

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-[var(--roxo)]">Administração</p>
        <h1 className="mt-1 text-[26px] font-bold text-[var(--texto)]" style={{ fontFamily: 'var(--fonte-titulo)' }}>Cadastro Executivo</h1>
        <p className="mt-1 text-[13px] text-[var(--texto-3)]">
          Liga o e-mail de login de cada executivo ao nome usado na Carteira Siscom. Quem não estiver aqui
          não vê nenhum cliente ao montar uma consulta.
        </p>
      </header>

      <PainelDeCadastroExecutivo executivosIniciais={executivos} />
    </div>
  )
}

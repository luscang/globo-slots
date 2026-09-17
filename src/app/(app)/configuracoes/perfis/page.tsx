import { PainelDePerfisEAcessos } from '@/components/configuracoes/PainelDePerfisEAcessos'
import {
  listarPermissoesDeSecoes,
  listarUsuariosComAcessos,
} from '@/lib/acoes/perfis-acessos'
import { listarSolicitacoesPendentes } from '@/lib/acoes/solicitacoes-de-acesso'
import { listarProgramas } from '@/lib/dados/programas'
import { obterSessao } from '@/lib/sessao-servidor'
import { temPerfil } from '@/lib/dominio/perfis'

export default async function PaginaPerfisEAcessos() {
  const sessao = await obterSessao()

  if (!sessao || !temPerfil(sessao.perfis, 'proprietario')) {
    return (
      <section className="rounded-[var(--raio-janela)] border border-[var(--borda)] bg-[var(--superficie)] p-10">
        <h1 className="text-[24px] font-bold text-[var(--texto)]" style={{ fontFamily: 'var(--fonte-titulo)' }}>
          Perfis e acessos
        </h1>
        <p className="mt-2 text-[13px] text-[var(--concorrencia)]">
          Apenas o perfil Proprietário pode administrar usuários e vínculos de programas.
        </p>
      </section>
    )
  }

  const [usuarios, programas, permissoesSecoes, solicitacoesPendentes] = await Promise.all([
    listarUsuariosComAcessos(),
    listarProgramas(),
    listarPermissoesDeSecoes(),
    listarSolicitacoesPendentes(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[26px] font-bold text-[var(--texto)]" style={{ fontFamily: 'var(--fonte-titulo)' }}>
          Perfis e acessos
        </h1>
        <p className="mt-1 max-w-[820px] text-[13px] leading-[1.5] text-[var(--texto-3)]">
          Defina os perfis de cada usuário, os programas administrados pelos POs de produto e quais seções do Globo Slots cada perfil pode visualizar.
        </p>
      </header>

      <PainelDePerfisEAcessos
        usuarios={usuarios}
        permissoesSecoes={permissoesSecoes}
        solicitacoesPendentes={solicitacoesPendentes}
        programas={programas
          .filter((programa) => programa.estado !== 'inativo')
          .map((programa) => ({ id: programa.id, nome: programa.nome }))}
      />
    </div>
  )
}

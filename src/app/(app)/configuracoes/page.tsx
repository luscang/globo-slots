import Link from 'next/link'
import { obterSessao, podeAdministrar } from '@/lib/sessao-servidor'
import { temPerfil } from '@/lib/dominio/perfis'

type Secao = { href: string; titulo: string; descricao: string; somenteProprietario?: boolean }
type Grupo = { titulo: string; descricao: string; secoes: Secao[] }

const GRUPOS: Grupo[] = [
  {
    titulo: 'Programas e proposta',
    descricao: 'Configurações diretamente ligadas aos programas que você administra e à distribuição das propostas.',
    secoes: [
      {
        href: '/configuracoes/programas',
        titulo: 'Programas',
        descricao: 'Regras comerciais, disponibilidade, datas, restrições, Regional e modelos de proposta.',
      },
      {
        href: '/configuracoes/emails',
        titulo: 'E-mails das propostas',
        descricao: 'Disparos automáticos e responsáveis que recebem cópia das propostas de cada programa.',
      },
    ],
  },
  {
    titulo: 'Governança de dados',
    descricao: 'Dados globais que afetam o aplicativo inteiro. Disponível somente para Proprietário.',
    secoes: [
      {
        href: '/configuracoes/categorias-oportunidades',
        titulo: 'Categorias de oportunidades',
        descricao: 'Lista controlada usada para classificar publicações e filtros da área de Oportunidades.',
        somenteProprietario: true,
      },
      {
        href: '/configuracoes/formatos-oportunidades',
        titulo: 'Formatos de oportunidades',
        descricao: 'Lista comercial de formatos de ação disponível no cadastro das oportunidades.',
        somenteProprietario: true,
      },
      {
        href: '/configuracoes/marcas',
        titulo: 'Marcas e anunciantes',
        descricao: 'Vínculos, cadastros manuais e pendências entre marcas e anunciantes oficiais.',
        somenteProprietario: true,
      },
      {
        href: '/configuracoes/carteira-siscom',
        titulo: 'Carteira Siscom',
        descricao: 'Cadastro de clientes, setor, indústria e os executivos responsáveis por cada um.',
        somenteProprietario: true,
      },
      {
        href: '/configuracoes/clientes-regionais',
        titulo: 'Clientes regionais',
        descricao: 'Elegibilidade global dos anunciantes para propostas regionais.',
        somenteProprietario: true,
      },
      {
        href: '/configuracoes/importacao',
        titulo: 'Importação Globo Take',
        descricao: 'Saúde da última carga, ações importadas e formatos ainda sem classificação.',
        somenteProprietario: true,
      },
    ],
  },
  {
    titulo: 'Administração',
    descricao: 'Usuários, perfis e regras de acesso ao aplicativo.',
    secoes: [
      {
        href: '/configuracoes/perfis',
        titulo: 'Perfis e acessos',
        descricao: 'Perfis dos usuários, seções visíveis e vínculos dos consultores com programas.',
        somenteProprietario: true,
      },
      {
        href: '/configuracoes/cadastro-executivo',
        titulo: 'Cadastro Executivo',
        descricao: 'Liga o e-mail de login de cada executivo ao nome usado na Carteira Siscom.',
        somenteProprietario: true,
      },
    ],
  },
]

export default async function PaginaConfiguracoes() {
  const sessao = await obterSessao()

  if (!podeAdministrar(sessao)) {
    return (
      <section className="rounded-[var(--raio-janela)] border border-[var(--borda)] bg-[var(--superficie)] p-10">
        <h1 className="text-[26px] font-bold" style={{ fontFamily: 'var(--fonte-titulo)' }}>Configurações</h1>
        <p className="mt-2 text-[13px] text-[var(--concorrencia)]">Você não tem permissão para ver esta página.</p>
      </section>
    )
  }

  const proprietario = Boolean(sessao && temPerfil(sessao.perfis, 'proprietario'))
  const gruposVisiveis = GRUPOS.map((grupo) => ({
    ...grupo,
    secoes: grupo.secoes.filter((secao) => !secao.somenteProprietario || proprietario),
  })).filter((grupo) => grupo.secoes.length > 0)

  return (
    <div className="flex flex-col gap-7">
      <header>
        <p className="globo-slots-gradient-text text-[10.5px] font-bold uppercase tracking-[.08em]">Administração do produto</p>
        <h1 className="mt-1 text-[26px] font-bold text-[var(--texto)]" style={{ fontFamily: 'var(--fonte-titulo)' }}>Configurações</h1>
        <p className="mt-1 max-w-[820px] text-[13px] text-[var(--texto-3)]">
          Ajuste programas e distribuição. Governança global e acessos ficam separados para reduzir risco de alterações fora do escopo do consultor.
        </p>
      </header>

      {gruposVisiveis.map((grupo) => (
        <section key={grupo.titulo} className="flex flex-col gap-3">
          <div>
            <h2 className="globo-slots-gradient-text text-[16px] font-bold">{grupo.titulo}</h2>
            <p className="mt-0.5 text-[11.5px] text-[var(--texto-3)]">{grupo.descricao}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {grupo.secoes.map((secao) => (
              <Link
                key={secao.href}
                href={secao.href}
                className="flex min-h-[150px] flex-col gap-2 rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--sombra-janela)]"
              >
                <span aria-hidden className="h-[6px] w-[30px] rounded-full" style={{ background: 'var(--marca)' }} />
                <h3 className="mt-1 text-[16px] font-bold text-[var(--texto)]" style={{ fontFamily: 'var(--fonte-titulo)' }}>{secao.titulo}</h3>
                <p className="text-[12px] leading-[1.5] text-[var(--texto-2)]">{secao.descricao}</p>
                <span className="mt-auto text-[10.5px] font-bold text-[var(--roxo)]">Abrir →</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

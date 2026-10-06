// Precisa continuar idêntico ao tipo `Papel` de `lib/data/carteira.ts` no
// repositório Hub Amplificado — os dois lados leem/gravam o mesmo cookie
// compartilhado, então mudar um sem o outro quebra essa leitura.
export type PapelHubAmplificado = 'executivo' | 'gerente' | 'admin' | 'pricing'

export interface ExecutivoMock {
  nome: string
  email: string
  papel: PapelHubAmplificado
  executivoRaw: string | null
}

const CARTEIRA_MOCK: ExecutivoMock[] = [
  {
    nome: 'Núbia Andrade',
    email: 'nubia.andrade@g.globo',
    papel: 'admin',
    executivoRaw: null,
  },
  {
    nome: 'Lucas Negrão',
    email: 'lucas.negrao@g.globo',
    papel: 'admin',
    executivoRaw: null,
  },
  {
    // Acesso padrão só do modo mock de desenvolvimento (login `admin`, senha
    // `admin`). Nunca vale em produção: o modo mock é desligado fora de dev.
    nome: 'Administrador',
    email: 'admin',
    papel: 'admin',
    executivoRaw: null,
  },
  {
    nome: 'Junior Castro',
    email: 'junior.castro@g.globo',
    papel: 'executivo',
    executivoRaw: 'Junior Castro RRJ',
  },
]

export function autenticarMock(email: string, senha: string): ExecutivoMock | null {
  const senhaLimpa = senha.trim()
  if (!senhaLimpa) return null
  const alvo = email.trim().toLowerCase()
  return CARTEIRA_MOCK.find((executivo) => executivo.email.toLowerCase() === alvo) ?? null
}

import type { Perfil } from '../dominio/perfis'
import { secoesPadraoDosPerfis } from '../dominio/perfis'
import type { PapelHubAmplificado } from './carteira'

/**
 * Login mock compartilhado com o Hub Amplificado.
 *
 * Ligado por `NEXT_PUBLIC_LOGIN_MOCK=1` (desligado em produção). Com ele
 * desligado, o Globo Slots usa o Supabase Auth normalmente.
 */
export function loginMockAtivo(): boolean {
  return (
    process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LOGIN_MOCK === '1'
  )
}

// O shape (e o guard abaixo) precisa continuar idêntico à interface `Sessao`
// de `lib/auth/session.ts` no repositório Hub Amplificado — os dois lados
// leem/gravam o mesmo cookie compartilhado, então mudar um sem o outro
// quebra essa leitura.
export interface SessaoCompartilhada {
  nome: string
  email: string
  papel: PapelHubAmplificado
  executivoRaw: string | null
}

export function ehSessaoCompartilhada(valor: unknown): valor is SessaoCompartilhada {
  if (typeof valor !== 'object' || valor === null) return false
  const candidato = valor as Record<string, unknown>
  return (
    typeof candidato.nome === 'string' &&
    typeof candidato.email === 'string' &&
    (candidato.papel === 'executivo' ||
      candidato.papel === 'gerente' ||
      candidato.papel === 'admin' ||
      candidato.papel === 'pricing') &&
    (candidato.executivoRaw === null || typeof candidato.executivoRaw === 'string')
  )
}

/**
 * O Globo Slots não tem os papéis do Hub Amplificado — mapeia para o perfil
 * mais próximo do seu domínio. `pricing` não tem equivalente: fica sem nenhum
 * perfil e cai na tela "sem acesso".
 */
const PERFIS_POR_PAPEL: Record<PapelHubAmplificado, Perfil[]> = {
  admin: ['proprietario'],
  executivo: ['executivo'],
  gerente: ['executivo_regional'],
  pricing: [],
}

export function traduzirSessaoCompartilhada(dados: SessaoCompartilhada) {
  // Cópia rasa: sem copiar, uma mutação futura em `sessao.perfis` vazaria para
  // outras sessões do mesmo processo.
  const perfis = [...PERFIS_POR_PAPEL[dados.papel]]
  return {
    usuarioId: dados.email,
    email: dados.email,
    nome: dados.nome,
    cargo: null,
    perfis,
    programasVinculados: [] as string[],
    secoes: secoesPadraoDosPerfis(perfis),
  }
}

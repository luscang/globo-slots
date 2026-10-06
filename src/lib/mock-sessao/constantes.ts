/**
 * Precisa ser IGUAL ao valor de NOME_COOKIE_SESSAO em
 * lib/auth/constants.ts do repo Hub Amplificado — é o mesmo cookie,
 * compartilhado entre as duas zonas por estarem na mesma origem
 * (Vercel Multi-Zones).
 */
export const NOME_COOKIE_SESSAO_COMPARTILHADO = 'hub_amplificado_sessao'

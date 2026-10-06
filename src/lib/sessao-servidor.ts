import { cookies } from 'next/headers'
import { criarClienteServidor } from './supabase/cliente-servidor'
import { NOME_COOKIE_SESSAO_COMPARTILHADO } from './mock-sessao/constantes'
import {
  ehSessaoCompartilhada,
  loginMockAtivo,
  traduzirSessaoCompartilhada,
} from './mock-sessao/sessao-compartilhada'
import { listarProgramasVinculados } from './dados/vinculos'
import { resolverNomeDoExecutivoLogado } from './dados/carteira-executivo'
import {
  podeAdministrarProgramas,
  secoesPadraoDosPerfis,
  type Perfil,
  type SecaoApp,
} from './dominio/perfis'

export type Sessao = {
  usuarioId: string
  email: string
  nome: string
  cargo: string | null
  perfis: Perfil[]
  programasVinculados: string[]
  secoes: SecaoApp[]
}

/** Quem está logado, lido no servidor antes da página ser montada. */
export async function obterSessao(): Promise<Sessao | null> {
  if (loginMockAtivo()) return obterSessaoMock()

  const supabase = await criarClienteServidor()
  const { data } = await supabase.auth.getUser()
  const usuarioAutenticado = data.user
  if (!usuarioAutenticado) return null

  const [{ data: usuario }, { data: linhasDePerfil }] = await Promise.all([
    supabase.from('usuario').select('nome, cargo').eq('usuario_id', usuarioAutenticado.id).maybeSingle(),
    supabase.from('perfil_usuario').select('perfil').eq('usuario_id', usuarioAutenticado.id),
  ])

  const perfisLidos = (linhasDePerfil ?? []).map((linha) => linha.perfil as Perfil)
  // Sem perfil explícito, só vira Executivo automaticamente quem está no
  // Cadastro Executivo (ligado à Carteira Siscom por e-mail) — antes disso,
  // QUALQUER conta autenticada caía aqui, mesmo sem nenhum vínculo comercial.
  // Sem estar na carteira e sem perfil: sessão sem nenhum perfil, tratada
  // como "sem acesso" pelo layout autenticado (ver `src/app/(app)/layout.tsx`).
  let perfis = perfisLidos
  if (perfis.length === 0) {
    const estaNaCarteira = await resolverNomeDoExecutivoLogado(usuarioAutenticado.email ?? '')
    perfis = estaNaCarteira ? ['executivo'] : []
  }
  const programasVinculados = await listarProgramasVinculados(usuarioAutenticado.id)

  // Enquanto a migration ainda não tiver sido aplicada, usa os padrões do domínio.
  let secoes = secoesPadraoDosPerfis(perfis)
  const { data: permissoes, error: erroPermissoes } = await supabase
    .from('perfil_secao')
    .select('perfil, secao, permitido')
    .in('perfil', perfis)
    .eq('permitido', true)

  if (!erroPermissoes && permissoes) {
    const valoresValidos: SecaoApp[] = ['inicio', 'oportunidades', 'consulta', 'propostas', 'aprovacoes', 'configuracoes']
    const permitidas = new Set<SecaoApp>(['inicio'])
    for (const linha of permissoes) {
      if (valoresValidos.includes(linha.secao as SecaoApp)) permitidas.add(linha.secao as SecaoApp)
    }
    secoes = valoresValidos.filter((secao) => permitidas.has(secao))
  }

  return {
    usuarioId: usuarioAutenticado.id,
    email: usuarioAutenticado.email ?? '',
    nome: usuario?.nome ?? usuarioAutenticado.email ?? '',
    cargo: usuario?.cargo ?? null,
    perfis,
    programasVinculados,
    secoes,
  }
}

/** Modo mock: a sessão vem do cookie compartilhado com o Hub Amplificado. */
async function obterSessaoMock(): Promise<Sessao | null> {
  const valor = (await cookies()).get(NOME_COOKIE_SESSAO_COMPARTILHADO)?.value
  if (!valor) return null

  let dados: unknown
  try {
    dados = JSON.parse(valor)
  } catch {
    return null
  }
  if (!ehSessaoCompartilhada(dados)) return null

  return traduzirSessaoCompartilhada(dados)
}

export function podeAdministrar(sessao: Sessao | null): boolean {
  if (!sessao) return false
  return podeAdministrarProgramas(sessao.perfis)
}

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { loginMockAtivo } from '../mock-sessao/sessao-compartilhada'
import { lerChaveServico, lerVariaveis } from './variaveis'

/**
 * Cliente do Supabase para usar NO SERVIDOR (layouts, páginas e Server Actions).
 *
 * Lê a sessão dos cookies que o navegador mandou junto com a requisição.
 */
export async function criarClienteServidor() {
  const { url, chave: chaveAnonima } = lerVariaveis()
  // Login mock: não há sessão do Supabase, então a autorização fica nos gates
  // da aplicação e o servidor usa a service-role key (bypassa RLS). Só em dev.
  const chave = loginMockAtivo() ? lerChaveServico() : chaveAnonima
  const armazemDeCookies = await cookies()

  return createServerClient(url, chave, {
    cookies: {
      getAll() {
        return armazemDeCookies.getAll()
      },
      setAll(cookiesParaGravar) {
        try {
          for (const { name, value, options } of cookiesParaGravar) {
            armazemDeCookies.set(name, value, options)
          }
        } catch {
          // Componentes de servidor não podem gravar cookies. Tudo bem: quem
          // renova a sessão é o proxy.ts, que roda antes e pode gravar.
        }
      },
    },
  })
}

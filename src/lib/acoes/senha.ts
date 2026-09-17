'use server'

import { criarClienteServidor } from '../supabase/cliente-servidor'
import { problemaDaSenha } from '../dominio/senha'

/**
 * Grava a senha nova, na última etapa do fluxo "esqueci minha senha"
 * (`/redefinir-senha`).
 *
 * A validação de `problemaDaSenha` já roda na tela, mas roda de novo aqui —
 * a da tela é conveniência (feedback sem round-trip); esta é a que vale,
 * porque a tela pode ser contornada por quem chama esta função direto.
 *
 * Não recebe e-mail nem senha atual: quem chega aqui já trocou o código de
 * recuperação por uma sessão válida (o link do e-mail faz isso no navegador,
 * ver `TelaRedefinirSenha`), e é essa sessão — lida dos cookies por
 * `criarClienteServidor` — que autoriza a troca.
 */
export async function redefinirSenha(
  senhaNova: string,
  senhaRepetida: string,
): Promise<{ erro: string | null }> {
  const problema = problemaDaSenha(senhaNova, senhaRepetida)
  if (problema) return { erro: problema }

  const supabase = await criarClienteServidor()

  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    return {
      erro:
        'O link de redefinição expirou ou já foi usado. Peça um novo link para trocar a senha.',
    }
  }

  const { error } = await supabase.auth.updateUser({ password: senhaNova })
  if (error) {
    return { erro: `Não foi possível gravar a senha nova. Detalhe técnico: ${error.message}` }
  }

  return { erro: null }
}

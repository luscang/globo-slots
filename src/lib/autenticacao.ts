'use client'

/**
 * Entrar e sair, do lado do navegador.
 *
 * A autorização (quem pode ver o quê, dado o `perfil` de `perfil_usuario`) é
 * responsabilidade de `sessao-servidor.ts` e das políticas de RLS no banco —
 * aqui só se prova que a senha confere (Supabase Auth, `auth.users`).
 */

import { entrar as entrarMock, sair as sairMock } from './autenticacao-mock'
import { criarClienteNavegador } from './supabase/cliente-navegador'

// Login mock compartilhado com o Hub Amplificado (só dev; ver sessao-compartilhada.ts).
const LOGIN_MOCK = process.env.NEXT_PUBLIC_LOGIN_MOCK === '1'

/** Mensagem única para credencial inválida, sem revelar qual campo errou. */
const ERRO_CREDENCIAL_INVALIDA = 'E-mail ou senha incorretos.'
const ERRO_MUITAS_TENTATIVAS =
  'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'
const ERRO_DADOS_INCOMPLETOS = 'Preencha um e-mail válido e a senha.'
const ERRO_INESPERADO = 'Não foi possível entrar. Tente novamente em instantes.'

export async function entrar(
  email: string,
  senha: string,
): Promise<{ erro: string | null }> {
  if (LOGIN_MOCK) return entrarMock(email, senha)

  const supabase = criarClienteNavegador()

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: senha,
  })

  if (!error) return { erro: null }

  // Bloqueio por excesso de tentativas. Precisa vir ANTES do tratamento de
  // credencial: dizer "e-mail ou senha incorretos" a quem foi barrado por
  // tentar demais manda a pessoa conferir uma senha que provavelmente está
  // certa. O limite é por origem da requisição, não por conta, então esta
  // mensagem não revela se o e-mail existe.
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return { erro: ERRO_MUITAS_TENTATIVAS }
  }

  // E-mail malformado ou campo em branco — problema no que foi digitado,
  // não na conta. Também não revela nada sobre quem tem cadastro.
  if (error.code === 'validation_failed' || error.code === 'email_address_invalid') {
    return { erro: ERRO_DADOS_INCOMPLETOS }
  }

  // "invalid_credentials" cobre tanto e-mail inexistente quanto senha errada
  // — o Supabase não distingue os dois de propósito, para não revelar quais
  // e-mails têm conta. Os demais 400 caem aqui pelo mesmo motivo: casos como
  // conta não confirmada ou banida SÃO distinguíveis, mas responder isso
  // confirmaria que o e-mail tem cadastro e permitiria enumerar contas.
  if (error.code === 'invalid_credentials' || error.status === 400) {
    return { erro: ERRO_CREDENCIAL_INVALIDA }
  }

  return { erro: ERRO_INESPERADO }
}

export async function sair(): Promise<void> {
  if (LOGIN_MOCK) return sairMock()
  const supabase = criarClienteNavegador()
  await supabase.auth.signOut()
}

/**
 * Dispara o e-mail de redefinição de senha.
 *
 * O `redirectTo` aponta para `/redefinir-senha` na própria origem — é para lá
 * que o Supabase manda a pessoa depois de clicar no link do e-mail, com o
 * código de recuperação anexado à URL (ver `TelaRedefinirSenha`).
 *
 * Não existe retorno de erro: a resposta é sempre a mesma, tenha o e-mail
 * conta ou não. O próprio Supabase já não distingue os dois casos nesta
 * chamada (por isso nunca "e-mail não encontrado") — e mesmo que algum erro
 * de rede aconteça, dizer isso à pessoa não ajudaria e abriria uma diferença
 * observável entre "deu erro" e "e-mail não existe" que um atacante poderia
 * usar para descobrir quais e-mails têm conta no sistema.
 */
export async function enviarLinkDeRedefinicao(email: string): Promise<void> {
  const supabase = criarClienteNavegador()
  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/redefinir-senha`,
  })
}

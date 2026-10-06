'use server'

import { cookies } from 'next/headers'
import { autenticarMock } from './mock-sessao/carteira'
import { NOME_COOKIE_SESSAO_COMPARTILHADO } from './mock-sessao/constantes'

export async function entrar(email: string, senha: string): Promise<{ erro: string | null }> {
  const executivo = autenticarMock(email, senha)
  if (!executivo) return { erro: 'E-mail ou senha inválidos.' }

  const sessao = {
    nome: executivo.nome,
    email: executivo.email,
    papel: executivo.papel,
    executivoRaw: executivo.executivoRaw,
  }
  ;(await cookies()).set(NOME_COOKIE_SESSAO_COMPARTILHADO, JSON.stringify(sessao), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
  return { erro: null }
}

export async function sair(): Promise<void> {
  ;(await cookies()).delete(NOME_COOKIE_SESSAO_COMPARTILHADO)
}

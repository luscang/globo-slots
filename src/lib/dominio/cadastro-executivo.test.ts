import { describe, expect, it } from 'vitest'
import { deduplicarPorEmail, projetarLinhaCadastroExecutivo } from './cadastro-executivo'

function linha(camposExtras: Record<string, unknown> = {}) {
  return {
    'Executivo Linear (360)': 'Adriana Lima',
    Email: 'Adriana.Lima@g.globo',
    'Nome no Salesforce': 'Adriana Lima',
    ...camposExtras,
  }
}

describe('projetarLinhaCadastroExecutivo', () => {
  it('projeta a linha e grava o e-mail em minúsculas', () => {
    expect(projetarLinhaCadastroExecutivo(linha())).toEqual({
      executivo_linear_360: 'Adriana Lima',
      email: 'adriana.lima@g.globo',
      nome_salesforce: 'Adriana Lima',
    })
  })

  it('descarta linha sem nome', () => {
    expect(projetarLinhaCadastroExecutivo(linha({ 'Executivo Linear (360)': '' }))).toBeNull()
  })

  it('descarta linha sem e-mail', () => {
    expect(projetarLinhaCadastroExecutivo(linha({ Email: '' }))).toBeNull()
  })

  it('descarta e-mail com formato inválido', () => {
    expect(projetarLinhaCadastroExecutivo(linha({ Email: 'não é um email' }))).toBeNull()
    expect(projetarLinhaCadastroExecutivo(linha({ Email: 'sem-arroba.com' }))).toBeNull()
  })

  it('aceita Nome no Salesforce vazio', () => {
    expect(projetarLinhaCadastroExecutivo(linha({ 'Nome no Salesforce': '' }))?.nome_salesforce).toBeNull()
  })
})

describe('deduplicarPorEmail', () => {
  it('mantém a última linha quando o e-mail se repete', () => {
    const primeira = projetarLinhaCadastroExecutivo(linha({ 'Executivo Linear (360)': 'Nome Antigo' }))!
    const ultima = projetarLinhaCadastroExecutivo(linha({ 'Executivo Linear (360)': 'Nome Atual' }))!
    expect(deduplicarPorEmail([primeira, ultima])).toEqual([ultima])
  })

  it('trata o mesmo e-mail em caixas diferentes como o mesmo registro', () => {
    const minusculo = projetarLinhaCadastroExecutivo(linha({ Email: 'nome@g.globo' }))!
    const maiusculo = projetarLinhaCadastroExecutivo(linha({ Email: 'NOME@G.GLOBO' }))!
    expect(deduplicarPorEmail([minusculo, maiusculo])).toHaveLength(1)
  })

  it('preserva executivos com e-mails diferentes', () => {
    const a = projetarLinhaCadastroExecutivo(linha({ Email: 'a@g.globo' }))!
    const b = projetarLinhaCadastroExecutivo(linha({ Email: 'b@g.globo' }))!
    expect(deduplicarPorEmail([a, b])).toHaveLength(2)
  })
})

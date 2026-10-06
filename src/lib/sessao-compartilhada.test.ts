import { describe, expect, it } from 'vitest'
import { traduzirSessaoCompartilhada } from './mock-sessao/sessao-compartilhada'

describe('traduzirSessaoCompartilhada', () => {
  it('mapeia admin do Hub Amplificado para o perfil proprietario do Globo Slots', () => {
    const sessao = traduzirSessaoCompartilhada({
      nome: 'Núbia Andrade',
      email: 'nubia.andrade@g.globo',
      papel: 'admin',
      executivoRaw: null,
    })
    expect(sessao.perfis).toEqual(['proprietario'])
    expect(sessao.usuarioId).toBe('nubia.andrade@g.globo')
  })

  it('mapeia executivo do Hub Amplificado para o perfil executivo do Globo Slots', () => {
    const sessao = traduzirSessaoCompartilhada({
      nome: 'Junior Castro',
      email: 'junior.castro@g.globo',
      papel: 'executivo',
      executivoRaw: 'Junior Castro RRJ',
    })
    expect(sessao.perfis).toEqual(['executivo'])
  })

  it('mapeia gerente para executivo_regional', () => {
    const sessao = traduzirSessaoCompartilhada({
      nome: 'Gerência Comercial',
      email: 'gerente@empresa.com.br',
      papel: 'gerente',
      executivoRaw: null,
    })
    expect(sessao.perfis).toEqual(['executivo_regional'])
  })

  it('mapeia pricing para nenhum perfil do Globo Slots (sem acesso)', () => {
    const sessao = traduzirSessaoCompartilhada({
      nome: 'Time Pricing',
      email: 'pricing@empresa.com.br',
      papel: 'pricing',
      executivoRaw: null,
    })
    expect(sessao.perfis).toEqual([])
  })
})

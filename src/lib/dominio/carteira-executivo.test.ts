import { describe, expect, it } from 'vitest'
import { clienteNaCarteiraDoExecutivo } from './carteira-executivo'

describe('clienteNaCarteiraDoExecutivo', () => {
  it('reconhece quando o executivo é o Executivo Linear (360)', () => {
    const cliente = { executivo_linear_360: 'Raphael Jucá', executivo_digital: 'Adriana Lima' }
    expect(clienteNaCarteiraDoExecutivo(cliente, 'Raphael Jucá')).toBe(true)
  })

  it('reconhece quando o executivo é o Executivo Digital', () => {
    const cliente = { executivo_linear_360: 'Raphael Jucá', executivo_digital: 'Adriana Lima' }
    expect(clienteNaCarteiraDoExecutivo(cliente, 'Adriana Lima')).toBe(true)
  })

  it('ignora acento e caixa na comparação', () => {
    const cliente = { executivo_linear_360: 'Raphael Juca', executivo_digital: null }
    expect(clienteNaCarteiraDoExecutivo(cliente, '  raphael JUCÁ  ')).toBe(true)
  })

  it('recusa quando o nome não bate com nenhuma das duas colunas', () => {
    const cliente = { executivo_linear_360: 'Raphael Jucá', executivo_digital: 'Adriana Lima' }
    expect(clienteNaCarteiraDoExecutivo(cliente, 'Christina Vieira')).toBe(false)
  })

  it('recusa quando o executivo logado não tem nome resolvido', () => {
    const cliente = { executivo_linear_360: 'Raphael Jucá', executivo_digital: null }
    expect(clienteNaCarteiraDoExecutivo(cliente, null)).toBe(false)
    expect(clienteNaCarteiraDoExecutivo(cliente, '')).toBe(false)
  })

  it('recusa cliente sem nenhum executivo cadastrado', () => {
    const cliente = { executivo_linear_360: null, executivo_digital: null }
    expect(clienteNaCarteiraDoExecutivo(cliente, 'Raphael Jucá')).toBe(false)
  })
})

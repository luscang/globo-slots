import { describe, expect, it } from 'vitest'
import { autenticarMock } from './carteira'

describe('autenticarMock', () => {
  it('autentica a admin com qualquer senha não vazia', () => {
    const executivo = autenticarMock('nubia.andrade@g.globo', 'qualquer-coisa')
    expect(executivo).not.toBeNull()
    expect(executivo?.papel).toBe('admin')
    expect(executivo?.executivoRaw).toBeNull()
  })

  it('autentica o executivo com o executivoRaw usado no filtro de Minhas RPs do Hub Amplificado', () => {
    const executivo = autenticarMock('junior.castro@g.globo', '123')
    expect(executivo).not.toBeNull()
    expect(executivo?.papel).toBe('executivo')
    expect(executivo?.executivoRaw).toBe('Junior Castro RRJ')
  })

  it('é case-insensitive no e-mail', () => {
    expect(autenticarMock('NUBIA.ANDRADE@G.GLOBO', 'x')).not.toBeNull()
  })

  it('rejeita senha vazia', () => {
    expect(autenticarMock('nubia.andrade@g.globo', '')).toBeNull()
    expect(autenticarMock('nubia.andrade@g.globo', '   ')).toBeNull()
  })

  it('aceita o acesso padrão admin/admin como administrador', () => {
    const executivo = autenticarMock('admin', 'admin')
    expect(executivo?.papel).toBe('admin')
  })

  it('rejeita e-mail fora da carteira mock', () => {
    expect(autenticarMock('desconhecido@g.globo', 'x')).toBeNull()
  })
})

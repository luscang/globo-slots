import { describe, it, expect } from 'vitest'
import {
  PRACAS,
  temSlotRegionalEm,
  pracasOcupadasEm,
  pracasLivresEm,
  pracasDoClienteEm,
  validarCompra,
  regionalConsomeSlotNacional,
} from './regional'

// Encontro: 1 slot por semana, sextas-feiras (dia 5)
const encontro = { aceita_regional: true, dia_da_semana_regional: 5, max_pracas_por_acao: 3 }
const semRegional = { aceita_regional: false, dia_da_semana_regional: null, max_pracas_por_acao: 3 }

// 2026-08-21 é uma sexta-feira; 2026-08-20 é quinta
const SEXTA = '2026-08-21'
const QUINTA = '2026-08-20'

const vendidas = [
  { data_de_exibicao: SEXTA, praca_codigo: 'SP', cliente_nome: 'Cliente A' },
  { data_de_exibicao: SEXTA, praca_codigo: 'RJ', cliente_nome: 'Cliente A' },
  { data_de_exibicao: SEXTA, praca_codigo: 'BH', cliente_nome: 'Cliente A' },
]

describe('PRACAS', () => {
  it('são as cinco Globos, nesta ordem', () => {
    expect([...PRACAS]).toEqual(['SP', 'RJ', 'BH', 'DF', 'PE1'])
  })
})

describe('temSlotRegionalEm', () => {
  // R10: o slot só existe no dia da semana do programa
  it('existe na sexta do Encontro', () => {
    expect(temSlotRegionalEm(encontro, SEXTA)).toBe(true)
  })

  it('não existe na quinta', () => {
    expect(temSlotRegionalEm(encontro, QUINTA)).toBe(false)
  })

  it('não existe em programa que não vende regional', () => {
    expect(temSlotRegionalEm(semRegional, SEXTA)).toBe(false)
  })
})

describe('pracasLivresEm', () => {
  // R8 (revista): a data é exclusiva de quem já vendeu ali.
  it('vendidas a Cliente A, nenhuma praça fica livre para outro cliente', () => {
    expect(pracasLivresEm(encontro, vendidas, SEXTA)).toEqual([])
    expect(pracasLivresEm(encontro, vendidas, SEXTA, 'Cliente B')).toEqual([])
  })

  it('para o próprio cliente que já comprou, sobram DF e PE1', () => {
    expect(pracasLivresEm(encontro, vendidas, SEXTA, 'Cliente A')).toEqual(['DF', 'PE1'])
  })

  it('sem venda nenhuma, as cinco estão livres para qualquer cliente', () => {
    expect(pracasLivresEm(encontro, [], SEXTA)).toEqual(['SP', 'RJ', 'BH', 'DF', 'PE1'])
  })

  it('em dia sem slot, nenhuma praça está livre', () => {
    expect(pracasLivresEm(encontro, [], QUINTA)).toEqual([])
  })
})

describe('pracasOcupadasEm', () => {
  it('lista as praças já vendidas na data', () => {
    expect(pracasOcupadasEm(vendidas, SEXTA)).toEqual(['SP', 'RJ', 'BH'])
  })

  it('ignora outras datas', () => {
    expect(pracasOcupadasEm(vendidas, '2026-08-28')).toEqual([])
  })
})

describe('validarCompra', () => {
  it('aceita compra de praças livres dentro do teto, sem venda anterior na data', () => {
    expect(validarCompra(encontro, [], SEXTA, ['DF', 'PE1'])).toEqual([])
  })

  // R9: máximo de praças por ação de um mesmo cliente
  it('recusa mais praças que o permitido por ação', () => {
    expect(validarCompra(encontro, [], SEXTA, ['SP', 'RJ', 'BH', 'DF']))
      .toContain('Uma ação pode ter no máximo 3 praças.')
  })

  // R8 (revista): sem saber quem compra, qualquer venda anterior bloqueia a data.
  it('recusa quando a data já tem praça vendida e não se sabe quem está comprando', () => {
    expect(validarCompra(encontro, vendidas, SEXTA, ['DF', 'PE1']))
      .toContain('Esta data já tem praça vendida para outro cliente (Cliente A) e fica indisponível para novas vendas regionais.')
  })

  it('recusa praça já vendida ao próprio cliente que a pede de novo', () => {
    expect(validarCompra(encontro, vendidas, SEXTA, ['SP'], { clienteNome: 'Cliente A' }))
      .toContain('A praça SP já está vendida nesta data.')
  })

  it('recusa data sem slot regional', () => {
    expect(validarCompra(encontro, [], QUINTA, ['SP']))
      .toContain('Este programa não tem ação regional nesta data.')
  })

  it('recusa praça inexistente', () => {
    expect(validarCompra(encontro, [], SEXTA, ['XX']))
      .toContain('Praça desconhecida: XX.')
  })

  it('recusa compra sem praça nenhuma', () => {
    expect(validarCompra(encontro, [], SEXTA, []))
      .toContain('Selecione ao menos uma praça.')
  })
})

describe('pracasDoClienteEm', () => {
  it('lista o que aquele cliente já tem na data', () => {
    expect(pracasDoClienteEm(vendidas, SEXTA, 'Cliente A')).toEqual(['SP', 'RJ', 'BH'])
  })

  it('ignora grafia diferente do mesmo nome', () => {
    expect(pracasDoClienteEm(vendidas, SEXTA, '  cliente a  ')).toEqual(['SP', 'RJ', 'BH'])
  })

  it('não conta praça de outro cliente', () => {
    expect(pracasDoClienteEm(vendidas, SEXTA, 'Cliente B')).toEqual([])
  })

  it('não conta praça de outra data', () => {
    expect(pracasDoClienteEm(vendidas, '2026-08-28', 'Cliente A')).toEqual([])
  })
})

describe('validarCompra com o cliente informado', () => {
  // R9 — o teto é por cliente na data, não por envio: sem isto, o mesmo
  // cliente registra SP/RJ/BH e depois DF/PE1 e fica com 5 praças.
  it('recusa o segundo envio que estouraria o teto do mesmo cliente', () => {
    const erros = validarCompra(encontro, vendidas, SEXTA, ['DF', 'PE1'], {
      clienteNome: 'Cliente A',
    })
    expect(erros).toContain(
      'Cliente A já tem 3 praças nesta data (SP, RJ, BH); com mais 2 passaria do máximo de 3 praças por cliente.',
    )
  })

  it('recusa o mesmo envio para um cliente diferente — a data já é do Cliente A', () => {
    expect(validarCompra(encontro, vendidas, SEXTA, ['DF', 'PE1'], { clienteNome: 'Cliente B' }))
      .toContain('Esta data já tem praça vendida para outro cliente (Cliente A) e fica indisponível para novas vendas regionais.')
  })

  it('aceita completar o teto sem estourar', () => {
    const umaPraca = [{ data_de_exibicao: SEXTA, praca_codigo: 'SP', cliente_nome: 'Cliente A' }]
    expect(validarCompra(encontro, umaPraca, SEXTA, ['RJ', 'BH'], { clienteNome: 'Cliente A' }))
      .toEqual([])
  })
})

describe('validarCompra com data bloqueada', () => {
  const bloqueios = [{ data: SEXTA, motivo: 'Feriado nacional' }]

  // R12 — data bloqueada vence tudo, inclusive no regional
  it('recusa a venda mesmo com as cinco praças livres, mostrando o motivo', () => {
    expect(validarCompra(encontro, [], SEXTA, ['SP'], { bloqueios }))
      .toEqual(['Esta data está bloqueada: Feriado nacional'])
  })

  it('o bloqueio é o único erro — nada sugere que resolver outra coisa liberaria', () => {
    const erros = validarCompra(encontro, vendidas, SEXTA, ['SP', 'RJ', 'BH', 'DF'], { bloqueios })
    expect(erros).toHaveLength(1)
  })

  it('não interfere em outra data', () => {
    expect(validarCompra(encontro, [], '2026-08-28', ['SP'], { bloqueios })).toEqual([])
  })
})

describe('regionalConsomeSlotNacional', () => {
  it('assume que sim, enquanto a área não confirma', () => {
    expect(regionalConsomeSlotNacional()).toBe(true)
  })
})

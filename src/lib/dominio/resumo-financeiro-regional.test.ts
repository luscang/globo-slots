import { describe, expect, it } from 'vitest'
import { calcularResumoFinanceiro } from './resumo-financeiro'
import type { Programa } from './cadastro'

const programa = {
  id: 'p-regional',
  nome: 'Encontro',
  mnemonico: 'ENCO',
  imagem_url: null,
  canal: 'TV Globo',
  possui_fluxo_aprovacao: false,
  contem_digital: true,
  redes_sociais: false,
  estado: 'ativo',
  dias_da_semana: [1, 2, 3, 4, 5],
  slots: 5,
  bloqueio_mensal: 0,
  acoes_minimas: 1,
  acoes_maximas: 5,
  custo_midia_tv: 0,
  custo_producao_tv: 0,
  percentual_simulcast: 0,
  custo_midia_digital: 1,
  custo_producao_digital: 0,
  custo_midia_redes_sociais: null,
  custo_producao_redes_sociais: null,
  prazo_minimo_dias: 0,
  disponivel_para_proposta: true,
  atualizado_em: '2026-08-18',
  aceita_regional: true,
  dia_da_semana_regional: 6,
  prazo_minimo_regional_dias: 0,
  max_pracas_por_acao: 3,
  custo_producao_regional: 40,
  bloqueio_mensal_regional: 0,
} satisfies Programa

const precos = [
  { praca_codigo: 'SP', custo_midia_tv: 100, percentual_simulcast: 10, custo_midia_digital: 10, atualizado_em: '' },
  { praca_codigo: 'RJ', custo_midia_tv: 200, percentual_simulcast: 10, custo_midia_digital: 20, atualizado_em: '' },
  { praca_codigo: 'BH', custo_midia_tv: 300, percentual_simulcast: 10, custo_midia_digital: 30, atualizado_em: '' },
  { praca_codigo: 'DF', custo_midia_tv: 400, percentual_simulcast: 10, custo_midia_digital: 40, atualizado_em: '' },
  { praca_codigo: 'PE1', custo_midia_tv: 500, percentual_simulcast: 10, custo_midia_digital: 50, atualizado_em: '' },
]

describe('resumo financeiro regional', () => {
  it('soma apenas as praças escolhidas e cobra produção uma única vez por ação', () => {
    const resumo = calcularResumoFinanceiro({
      programa,
      modalidade: 'regional',
      itens: [{ data: '2026-08-29', quantidade: 1, pracas: ['SP', 'RJ', 'BH'] }],
      periodosEspeciais: [],
      precosRegionais: precos,
    })

    expect(resumo.midia_tv).toBe(600)
    expect(resumo.simulcast).toBe(60)
    expect(resumo.total_comercial).toBe(660)
    expect(resumo.producao_tv).toBe(40)
    expect(resumo.linhas[0].detalhe_pracas).toEqual([
      expect.objectContaining({ praca_codigo: 'SP', midia_tv: 100, simulcast: 10 }),
      expect.objectContaining({ praca_codigo: 'RJ', midia_tv: 200, simulcast: 20 }),
      expect.objectContaining({ praca_codigo: 'BH', midia_tv: 300, simulcast: 30 }),
    ])
  })

  // Regional não tem Digital, mesmo quando o programa oferece e há preço de Digital cadastrado por praça.
  it('nunca cobra Digital no regional, mesmo com preço de Digital cadastrado nas praças', () => {
    const resumo = calcularResumoFinanceiro({
      programa,
      modalidade: 'regional',
      itens: [{ data: '2026-08-29', quantidade: 1, pracas: ['SP', 'DF'] }],
      periodosEspeciais: [],
      precosRegionais: precos,
    })

    expect(resumo.incluir_digital).toBe(false)
    expect(resumo.midia_tv).toBe(500)
    expect(resumo.midia_digital).toBe(0)
    expect(resumo.linhas[0].detalhe_pracas.map((item) => [item.praca_codigo, item.midia_digital])).toEqual([
      ['SP', 0],
      ['DF', 0],
    ])
    expect(resumo.producao_tv).toBe(40)
    expect(resumo.producao_digital).toBe(0)
  })
})

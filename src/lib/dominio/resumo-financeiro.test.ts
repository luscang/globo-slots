import { describe, expect, it } from 'vitest'
import { calcularResumoFinanceiro } from './resumo-financeiro'
import type { Programa } from './cadastro'

const programa = {
  id: 'p1',
  nome: 'Mais Você',
  mnemonico: 'MAVO',
  imagem_url: null,
  canal: 'TV Globo',
  possui_fluxo_aprovacao: false,
  contem_digital: true,
  redes_sociais: true,
  estado: 'ativo',
  dias_da_semana: [1, 2, 3, 4, 5],
  slots: 3,
  bloqueio_mensal: 12,
  acoes_minimas: 1,
  acoes_maximas: 12,
  custo_midia_tv: 100,
  custo_producao_tv: 20,
  percentual_simulcast: 10,
  custo_midia_digital: 50,
  custo_producao_digital: 5,
  custo_midia_redes_sociais: 30,
  custo_producao_redes_sociais: 3,
  prazo_minimo_dias: 3,
  disponivel_para_proposta: true,
  atualizado_em: '2026-08-18',
  aceita_regional: false,
  dia_da_semana_regional: null,
  prazo_minimo_regional_dias: null,
  max_pracas_por_acao: 3,
  custo_producao_regional: null,
  bloqueio_mensal_regional: 0,
} satisfies Programa

const item = [{ data: '2026-09-08', quantidade: 1, pracas: [] }]

describe('calcularResumoFinanceiro', () => {
  // Regional nunca tem Digital nem Redes Sociais, mesmo quando o programa os oferece.
  it('não cobra Digital nem Redes Sociais no regional, mesmo com o programa oferecendo os dois', () => {
    const resumo = calcularResumoFinanceiro({
      programa: { ...programa, aceita_regional: true },
      modalidade: 'regional',
      itens: item,
      periodosEspeciais: [],
    })

    expect(resumo.incluir_digital).toBe(false)
    expect(resumo.incluir_redes_sociais).toBe(false)
    expect(resumo.midia_digital).toBe(0)
    expect(resumo.redes_sociais).toBe(0)
  })

  // No nacional, Digital e Redes Sociais deixaram de ser opcionais: entram
  // sempre que o programa os oferece e tem preço cadastrado.
  it('separa Total Comercial de produção e direitos com Digital e Redes Sociais', () => {
    const resumo = calcularResumoFinanceiro({
      programa,
      modalidade: 'nacional',
      itens: item,
      periodosEspeciais: [],
    })

    expect(resumo.midia_tv).toBe(100)
    expect(resumo.midia_digital).toBe(50)
    expect(resumo.redes_sociais).toBe(30)
    expect(resumo.simulcast).toBe(10)
    expect(resumo.total_comercial).toBe(190)
    expect(resumo.producao_tv).toBe(20)
    expect(resumo.producao_digital).toBe(5)
    expect(resumo.producao_redes_sociais).toBe(3)
    expect(resumo.producao).toBe(28)
    expect(resumo.direitos_tv).toBe(16.5)
    expect(resumo.direitos_digital).toBe(7.5)
    expect(resumo.direitos_total).toBe(24)
    expect(resumo.total_geral).toBe(242)
  })

  it('aplica período especial em TV e Digital selecionado, mas não inventa acréscimo para Redes Sociais', () => {
    const resumo = calcularResumoFinanceiro({
      programa,
      modalidade: 'nacional',
      itens: item,
      periodosEspeciais: [{
        nome: 'Especial',
        data_inicio: '2026-09-01',
        data_fim: '2026-09-30',
        percentual_acrescimo: 20,
      }],
    })

    expect(resumo.midia_tv).toBe(120)
    expect(resumo.midia_digital).toBe(60)
    expect(resumo.redes_sociais).toBe(30)
    expect(resumo.simulcast).toBe(12)
    expect(resumo.total_comercial).toBe(222)
    expect(resumo.direitos_tv).toBe(19.8)
    expect(resumo.direitos_digital).toBe(9)
    expect(resumo.producao).toBe(28)
    expect(resumo.total_geral).toBe(278.8)
  })

  it('ignora complementos que o programa não oferece', () => {
    const resumo = calcularResumoFinanceiro({
      programa: { ...programa, contem_digital: false, redes_sociais: false },
      modalidade: 'nacional',
      itens: item,
      periodosEspeciais: [],
    })

    expect(resumo.incluir_digital).toBe(false)
    expect(resumo.incluir_redes_sociais).toBe(false)
    expect(resumo.midia_digital).toBe(0)
    expect(resumo.redes_sociais).toBe(0)
  })

  it('não inclui complemento habilitado sem valor comercial cadastrado', () => {
    const resumo = calcularResumoFinanceiro({
      programa: {
        ...programa,
        custo_midia_digital: null,
        custo_midia_redes_sociais: null,
      },
      modalidade: 'nacional',
      itens: item,
      periodosEspeciais: [],
    })

    expect(resumo.incluir_digital).toBe(false)
    expect(resumo.incluir_redes_sociais).toBe(false)
    expect(resumo.midia_digital).toBe(0)
    expect(resumo.redes_sociais).toBe(0)
  })
})

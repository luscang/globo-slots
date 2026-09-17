import { describe, it, expect } from 'vitest'
import { diasDoMes, calcularDisponibilidadeDoMes, type InsumosDeDisponibilidade } from './disponibilidade'
import { montarMapa } from './formatos'
import { indexarAnunciantes } from './casamento-anunciante'

const FORMATOS = montarMapa([
  { formato: 'ACAO DE CONTEUDO', categoria: 'AÇÃO DE CONTEÚDO' },
  { formato: 'COMERCIAL', categoria: 'COMERCIAL' },
])

// MAVO: vai ao ar de segunda a sexta (1..5), 2 slots por dia, 3 dias de prazo.
const mavo = {
  id: 'p-1',
  mnemonico: 'MAVO',
  dias_da_semana: [1, 2, 3, 4, 5],
  slots: 2,
  bloqueio_mensal: 0,
  prazo_minimo_dias: 3,
  custo_midia_tv: 100000,
  custo_producao_tv: 5000,
  percentual_simulcast: null,
  aceita_regional: false,
  dia_da_semana_regional: null,
  prazo_minimo_regional_dias: null,
  max_pracas_por_acao: 3,
  custo_producao_regional: null,
  bloqueio_mensal_regional: 0,
}

const carteira = [
  { nome: 'COCA-COLA', setor: 'Bebidas', industria: 'Refrigerantes' },
  { nome: 'PEPSI', setor: 'Bebidas', industria: 'Refrigerantes' },
  { nome: 'NESTLE', setor: 'Alimentos', industria: 'Chocolates' },
]

function insumos(ajustes: Partial<InsumosDeDisponibilidade> = {}): InsumosDeDisponibilidade {
  return {
    ano: 2026,
    mes: 9,
    hojeIso: '2026-08-16',
    modalidade: 'nacional',
    programa: mavo,
    cliente: { nome: 'PEPSI', setor: 'Bebidas', industria: 'Refrigerantes' },
    formatos: FORMATOS,
    acoesVendidas: [],
    acoesRegionais: [],
    bloqueios: [],
    periodosEspeciais: [],
    indiceDeAnunciantes: indexarAnunciantes(carteira),
    precosRegionais: [],
    ...ajustes,
  }
}

function dia(dias: ReturnType<typeof calcularDisponibilidadeDoMes>, data: string) {
  const achado = dias.find((d) => d.data === data)
  if (!achado) throw new Error(`Dia ${data} não veio no resultado`)
  return achado
}

describe('diasDoMes', () => {
  it('gera todos os dias do mês em ISO', () => {
    const dias = diasDoMes(2026, 2)
    expect(dias).toHaveLength(28)
    expect(dias[0]).toBe('2026-02-01')
    expect(dias[27]).toBe('2026-02-28')
  })

  it('acerta mês de 31 dias', () => {
    expect(diasDoMes(2026, 12)).toHaveLength(31)
  })
})

describe('calcularDisponibilidadeDoMes — nacional', () => {
  it('devolve um item por dia do mês', () => {
    expect(calcularDisponibilidadeDoMes(insumos())).toHaveLength(30)
  })

  // R10: dia fora da grade não é "esgotado", é ausência de inventário.
  it('sábado e domingo ficam sem exibição', () => {
    const dias = calcularDisponibilidadeDoMes(insumos())
    expect(dia(dias, '2026-09-05').estado).toBe('sem_exibicao') // sábado
    expect(dia(dias, '2026-09-06').estado).toBe('sem_exibicao') // domingo
    expect(dia(dias, '2026-09-05').total).toBe(0)
  })

  it('dia útil sem venda fica disponível com todos os slots', () => {
    const terca = dia(calcularDisponibilidadeDoMes(insumos()), '2026-09-08')
    expect(terca.estado).toBe('disponivel')
    expect(terca.livres).toBe(2)
    expect(terca.total).toBe(2)
  })

  // R1: só formato de categoria AÇÃO DE CONTEÚDO ocupa slot.
  it('conta só ação de conteúdo como ocupação', () => {
    const dias = calcularDisponibilidadeDoMes(
      insumos({
        acoesVendidas: [
          { programa: 'MAVO - MAIS VOCE', data_de_exibicao: '2026-09-08', formato: 'ACAO DE CONTEUDO', anunciante: 'NESTLE' },
          { programa: 'MAVO - MAIS VOCE', data_de_exibicao: '2026-09-08', formato: 'COMERCIAL', anunciante: 'NESTLE' },
        ],
      }),
    )
    expect(dia(dias, '2026-09-08').livres).toBe(1)
  })

  it('slots todos vendidos deixam o dia esgotado', () => {
    const dias = calcularDisponibilidadeDoMes(
      insumos({
        acoesVendidas: [
          { programa: 'MAVO - MAIS VOCE', data_de_exibicao: '2026-09-08', formato: 'ACAO DE CONTEUDO', anunciante: 'NESTLE' },
          { programa: 'MAVO - MAIS VOCE', data_de_exibicao: '2026-09-08', formato: 'ACAO DE CONTEUDO', anunciante: 'NESTLE' },
        ],
      }),
    )
    expect(dia(dias, '2026-09-08').estado).toBe('esgotado')
    expect(dia(dias, '2026-09-08').livres).toBe(0)
  })

  // R14: concorrência é calculada, não cadastrada. PEPSI e COCA-COLA
  // compartilham setor e indústria.
  it('concorrente vendido na data fecha a data, e nomeia quem é', () => {
    const dias = calcularDisponibilidadeDoMes(
      insumos({
        acoesVendidas: [
          { programa: 'MAVO - MAIS VOCE', data_de_exibicao: '2026-09-08', formato: 'ACAO DE CONTEUDO', anunciante: 'COCA-COLA *' },
        ],
      }),
    )
    const terca = dia(dias, '2026-09-08')
    expect(terca.estado).toBe('concorrencia')
    expect(terca.motivos.join(' ')).toContain('COCA-COLA')
  })

  it('cliente de outra categoria não gera concorrência', () => {
    const dias = calcularDisponibilidadeDoMes(
      insumos({
        acoesVendidas: [
          { programa: 'MAVO - MAIS VOCE', data_de_exibicao: '2026-09-08', formato: 'ACAO DE CONTEUDO', anunciante: 'NESTLE' },
        ],
      }),
    )
    expect(dia(dias, '2026-09-08').estado).toBe('disponivel')
  })

  // Anunciante que não casa com a carteira NÃO bloqueia — só avisa.
  it('anunciante desconhecido não bloqueia, mas conta como não verificado', () => {
    const dias = calcularDisponibilidadeDoMes(
      insumos({
        acoesVendidas: [
          { programa: 'MAVO - MAIS VOCE', data_de_exibicao: '2026-09-08', formato: 'ACAO DE CONTEUDO', anunciante: 'PORTO SEGURO' },
        ],
      }),
    )
    const terca = dia(dias, '2026-09-08')
    expect(terca.estado).toBe('disponivel')
    expect(terca.acoes_sem_classificacao).toBe(1)
  })

  // R11: prazo mínimo de 3 dias a partir de 16/08.
  it('data dentro do prazo mínimo fica fora do prazo', () => {
    const dias = calcularDisponibilidadeDoMes(insumos({ ano: 2026, mes: 8 }))
    expect(dia(dias, '2026-08-17').estado).toBe('fora_do_prazo')
    expect(dia(dias, '2026-08-18').estado).toBe('fora_do_prazo')
    expect(dia(dias, '2026-08-19').estado).toBe('disponivel')
  })

  // R12: data bloqueada, com o motivo cadastrado à vista.
  it('data bloqueada fecha, com o motivo', () => {
    const dias = calcularDisponibilidadeDoMes(
      insumos({ bloqueios: [{ data: '2026-09-08', motivo: 'Reprise' }] }),
    )
    expect(dia(dias, '2026-09-08').estado).toBe('bloqueado')
    expect(dia(dias, '2026-09-08').motivos).toContain('Reprise')
  })

  // Os motivos se acumulam; a cor, não. Prazo vem primeiro para não furar a
  // faixa contígua do começo do mês.
  it('data fora do prazo E bloqueada pinta pelo prazo e guarda os dois motivos', () => {
    const dias = calcularDisponibilidadeDoMes(
      insumos({ ano: 2026, mes: 8, bloqueios: [{ data: '2026-08-17', motivo: 'Reprise' }] }),
    )
    const dezessete = dia(dias, '2026-08-17')
    expect(dezessete.estado).toBe('fora_do_prazo')
    expect(dezessete.motivos).toHaveLength(2)
    expect(dezessete.motivos.join(' ')).toContain('Reprise')
  })

  // R16: teto mensal fecha o mês inteiro.
  it('teto mensal atingido fecha os dias restantes do mês', () => {
    const vendidas = ['2026-09-01', '2026-09-02', '2026-09-03'].map((data) => ({
      programa: 'MAVO - MAIS VOCE',
      data_de_exibicao: data,
      formato: 'ACAO DE CONTEUDO',
      anunciante: 'NESTLE',
    }))
    const dias = calcularDisponibilidadeDoMes(
      insumos({ programa: { ...mavo, bloqueio_mensal: 3 }, acoesVendidas: vendidas }),
    )
    const oito = dia(dias, '2026-09-08')
    expect(oito.estado).toBe('bloqueado')
    expect(oito.motivos.join(' ')).toContain('mês')
  })

  // Feriado é ilustração: nomeia e não interfere.
  it('feriado aparece nomeado sem alterar o estado', () => {
    const dias = calcularDisponibilidadeDoMes(insumos())
    const sete = dia(dias, '2026-09-07') // Independência, uma segunda-feira
    expect(sete.feriado).toBe('Independência')
    expect(sete.estado).toBe('disponivel')
    expect(sete.motivos).toEqual([])
  })

  it('o valor do dia soma mídia, direitos e produção', () => {
    // 100.000 + 15.000 + 5.000
    expect(dia(calcularDisponibilidadeDoMes(insumos()), '2026-09-08').valor_unitario).toBe(120000)
  })

  it('período especial aparece nomeado e sobe o valor', () => {
    const dias = calcularDisponibilidadeDoMes(
      insumos({
        periodosEspeciais: [
          { nome: 'Black Friday', data_inicio: '2026-09-07', data_fim: '2026-09-11', percentual_acrescimo: 20 },
        ],
      }),
    )
    const oito = dia(dias, '2026-09-08')
    expect(oito.periodo_especial).toEqual({ nome: 'Black Friday', percentual: 20 })
    // 120.000 +20% na mídia → 120.000 + 18.000 + 5.000
    expect(oito.valor_unitario).toBe(143000)
  })

  // Ruling de pré-voo (R6): 4 dos 23 programas chegam da API sem mnemônico e
  // dependem de apelido cadastrado em `programa_apelidos`. Sem esta correção,
  // uma ação como "MAIS VOCE" (sem "MNEMONICO - ") nunca casaria com o
  // programa e o calendário mostraria disponibilidade sempre cheia — o pior
  // erro possível, porque vende espaço já vendido.
  it('ação sem mnemônico casa pelo apelido cadastrado', () => {
    const dias = calcularDisponibilidadeDoMes(
      insumos({
        apelidosDoPrograma: ['MAIS VOCE'],
        acoesVendidas: [
          { programa: 'MAIS VOCE', data_de_exibicao: '2026-09-08', formato: 'ACAO DE CONTEUDO', anunciante: 'NESTLE' },
        ],
      }),
    )
    expect(dia(dias, '2026-09-08').livres).toBe(1)
  })

  // Fix de revisão: `extrairMnemonico` pode devolver um mnemônico que NÃO é
  // o deste programa (prefixação inconsistente da própria API é a razão de
  // apelido existir), e mesmo assim o texto integral estar cadastrado como
  // apelido. `acoesDoPrograma` precisa cair para o apelido neste caso, igual
  // a `encontrarProgramaId` — não pode parar no primeiro `return` só porque
  // extraiu ALGUM mnemônico.
  it('ação com prefixo de mnemônico errado ainda casa pelo apelido cadastrado do texto integral', () => {
    const dias = calcularDisponibilidadeDoMes(
      insumos({
        apelidosDoPrograma: ['MV - MAIS VOCE'],
        acoesVendidas: [
          { programa: 'MV - MAIS VOCE', data_de_exibicao: '2026-09-08', formato: 'ACAO DE CONTEUDO', anunciante: 'NESTLE' },
        ],
      }),
    )
    expect(dia(dias, '2026-09-08').livres).toBe(1)
  })

  // Fix de revisão: R15 (provisório) diz que a ação regional consome também
  // um slot nacional do dia — a contagem mensal do teto nacional (R16)
  // precisa enxergar esse consumo, ou o motor fica cego para algo que ele
  // mesmo contabiliza dia a dia. Uma ação regional distinta (data + cliente)
  // conta como uma ação para o teto mensal nacional.
  it('ação regional conta para o teto mensal nacional', () => {
    const dias = calcularDisponibilidadeDoMes(
      insumos({
        programa: { ...mavo, bloqueio_mensal: 1 },
        acoesRegionais: [
          { data_de_exibicao: '2026-09-01', praca_codigo: 'SP', cliente_nome: 'NESTLE' },
        ],
      }),
    )
    const oito = dia(dias, '2026-09-08')
    expect(oito.estado).toBe('bloqueado')
    expect(oito.motivos.join(' ')).toContain('mês')
  })
})

describe('calcularDisponibilidadeDoMes — regional', () => {
  // Encontro: slot só às sextas (5), prazo regional de 7 dias, teto de 4
  // ações no mês, produção regional única por ação.
  const encontro = {
    ...mavo,
    id: 'p-2',
    mnemonico: 'FATI',
    dias_da_semana: [1, 2, 3, 4, 5],
    aceita_regional: true,
    dia_da_semana_regional: 5,
    prazo_minimo_regional_dias: 7,
    max_pracas_por_acao: 3,
    custo_producao_regional: 7797,
    bloqueio_mensal_regional: 4,
  }

  const precos = [
    { praca_codigo: 'SP', custo_midia_tv: 49000, percentual_simulcast: null },
    { praca_codigo: 'RJ', custo_midia_tv: 25000, percentual_simulcast: null },
    { praca_codigo: 'BH', custo_midia_tv: 9000, percentual_simulcast: null },
    { praca_codigo: 'DF', custo_midia_tv: 6000, percentual_simulcast: null },
    { praca_codigo: 'PE1', custo_midia_tv: 7000, percentual_simulcast: null },
  ]

  function regionais(ajustes: Partial<InsumosDeDisponibilidade> = {}) {
    return calcularDisponibilidadeDoMes(
      insumos({
        modalidade: 'regional',
        programa: encontro,
        precosRegionais: precos,
        ...ajustes,
      }),
    )
  }

  // R10: fora da sexta não há "esgotado" — não existe ação regional.
  it('quinta-feira não tem slot regional', () => {
    expect(dia(regionais(), '2026-09-10').estado).toBe('sem_exibicao') // quinta
    expect(dia(regionais(), '2026-09-10').pracas).toEqual([])
  })

  it('sexta sem venda traz as cinco praças livres', () => {
    const sexta = dia(regionais(), '2026-09-11')
    expect(sexta.estado).toBe('disponivel')
    expect(sexta.total).toBe(5)
    expect(sexta.livres).toBe(5)
    expect(sexta.pracas.map((p) => p.praca_codigo)).toEqual(['SP', 'RJ', 'BH', 'DF', 'PE1'])
  })

  // R8 (revista): a data regional é exclusiva de quem já vendeu ali.
  it('vendidas SP, RJ e BH a outro cliente, a data fica esgotada para quem consulta', () => {
    const vendidas = ['SP', 'RJ', 'BH'].map((praca) => ({
      data_de_exibicao: '2026-09-11',
      praca_codigo: praca,
      cliente_nome: 'NESTLE',
    }))
    // insumos() usa PEPSI como cliente por padrão — um cliente diferente de NESTLE.
    const sexta = dia(regionais({ acoesRegionais: vendidas }), '2026-09-11')

    expect(sexta.estado).toBe('esgotado')
    expect(sexta.livres).toBe(0)
    expect(sexta.pracas.filter((p) => p.disponivel)).toEqual([])
    expect(sexta.pracas.find((p) => p.praca_codigo === 'SP')?.cliente_nome).toBe('NESTLE')
  })

  it('para o próprio cliente que já comprou, sobram DF e PE1 na mesma sexta', () => {
    const vendidas = ['SP', 'RJ', 'BH'].map((praca) => ({
      data_de_exibicao: '2026-09-11',
      praca_codigo: praca,
      cliente_nome: 'NESTLE',
    }))
    const sexta = dia(
      regionais({ acoesRegionais: vendidas, cliente: { nome: 'NESTLE', setor: null, industria: null } }),
      '2026-09-11',
    )

    expect(sexta.estado).toBe('disponivel')
    expect(sexta.livres).toBe(2)
    expect(sexta.pracas.filter((p) => p.disponivel).map((p) => p.praca_codigo)).toEqual(['DF', 'PE1'])
  })

  it('as cinco praças vendidas esgotam a data', () => {
    const vendidas = ['SP', 'RJ', 'BH', 'DF', 'PE1'].map((praca) => ({
      data_de_exibicao: '2026-09-11',
      praca_codigo: praca,
      cliente_nome: 'NESTLE',
    }))
    expect(dia(regionais({ acoesRegionais: vendidas }), '2026-09-11').estado).toBe('esgotado')
  })

  // R11: o prazo regional é PRÓPRIO — 7 dias no Encontro, não os 3 nacionais.
  it('usa o prazo mínimo regional, não o nacional', () => {
    const agosto = regionais({ ano: 2026, mes: 8 })
    // 21/08 é sexta e está a 5 dias de 16/08: dentro dos 7 do regional.
    expect(dia(agosto, '2026-08-21').estado).toBe('fora_do_prazo')
    // 28/08 é sexta e está a 12 dias: fora do prazo mínimo, logo vendável.
    expect(dia(agosto, '2026-08-28').estado).toBe('disponivel')
  })

  // R16 regional: 4 ações fecham o mês, contando AÇÃO, não linha de praça.
  it('uma ação de 3 praças conta como uma ação para o teto do mês', () => {
    const tresPracasNumaAcao = ['SP', 'RJ', 'BH'].map((praca) => ({
      data_de_exibicao: '2026-09-04',
      praca_codigo: praca,
      cliente_nome: 'NESTLE',
    }))
    // 3 linhas, 1 ação — longe do teto de 4.
    expect(dia(regionais({ acoesRegionais: tresPracasNumaAcao }), '2026-09-11').estado).toBe(
      'disponivel',
    )
  })

  it('quatro ações distintas fecham o mês', () => {
    const quatroAcoes = [
      { data_de_exibicao: '2026-09-04', praca_codigo: 'SP', cliente_nome: 'CLIENTE A' },
      { data_de_exibicao: '2026-09-04', praca_codigo: 'RJ', cliente_nome: 'CLIENTE B' },
      { data_de_exibicao: '2026-09-04', praca_codigo: 'BH', cliente_nome: 'CLIENTE C' },
      { data_de_exibicao: '2026-09-04', praca_codigo: 'DF', cliente_nome: 'CLIENTE D' },
    ]
    const onze = dia(regionais({ acoesRegionais: quatroAcoes }), '2026-09-11')
    expect(onze.estado).toBe('bloqueado')
    expect(onze.motivos.join(' ')).toContain('4 ações')
  })

  it('soma o valor das praças livres mais a produção, uma vez só', () => {
    // 49.000 + 25.000 + 9.000 + 6.000 + 7.000 = 96.000 de mídia
    // direitos 15% de cada = 14.400; produção 7.797 uma vez
    expect(dia(regionais(), '2026-09-11').valor_unitario).toBe(118197)
  })

  /**
   * R16 regional — caso discriminante. Os dois testes acima têm contagem de
   * linha e contagem de ação coincidindo por construção (3 linhas/1 ação
   * contra o teto 4; 4 linhas/4 ações contra o teto 4), então uma
   * implementação ingênua que contasse LINHA de `acoes_regionais` em vez de
   * AÇÃO distinta (`data|cliente_nome`) passaria nos dois sem ser pega.
   *
   * Este teste separa as duas leituras de propósito: 2 ações de 2 praças
   * cada somam 4 linhas mas só 2 ações. Contando ação (correto): 2 < 4,
   * mês continua aberto. Contando linha (bug): 4 >= 4, mês fecharia sem
   * motivo. Se alguém inverter a leitura de R16 regional amanhã — e a área
   * ainda não confirmou por escrito qual das duas é a certa — é este teste
   * que quebra primeiro.
   */
  it('duas ações de 2 praças cada não fecham o mês — conta ação, não linha', () => {
    const duasAcoesDeDuasPracas = [
      { data_de_exibicao: '2026-09-04', praca_codigo: 'SP', cliente_nome: 'NESTLE' },
      { data_de_exibicao: '2026-09-04', praca_codigo: 'RJ', cliente_nome: 'NESTLE' },
      { data_de_exibicao: '2026-09-04', praca_codigo: 'BH', cliente_nome: 'COCA-COLA' },
      { data_de_exibicao: '2026-09-04', praca_codigo: 'DF', cliente_nome: 'COCA-COLA' },
    ]
    // 4 linhas, 2 ações — bem abaixo do teto de 4 ações.
    expect(
      dia(regionais({ acoesRegionais: duasAcoesDeDuasPracas }), '2026-09-11').estado,
    ).toBe('disponivel')
  })
})

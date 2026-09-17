import { describe, expect, it } from 'vitest'
import { deduplicarPorNome, projetarLinhaCarteiraSiscom, type ClienteDaCarteiraSiscom } from './carteira-siscom'

function linha(camposExtras: Record<string, unknown> = {}) {
  return {
    Cliente: 'Ambev',
    CNPJ: '00.000.000/0000-00',
    'Cód SISCOM': '12345',
    Setor: 'Bebidas',
    Indústria: 'Cervejas',
    'Head Setor': 'Fulana',
    'Gerente Indústria': 'Sicrano',
    'Executivo Linear (360)': 'Raphael Jucá',
    'Executivo Digital': 'Adriana Lima',
    'Elegível para regional': 'Sim',
    ...camposExtras,
  }
}

describe('projetarLinhaCarteiraSiscom', () => {
  it('projeta todas as colunas da planilha', () => {
    expect(projetarLinhaCarteiraSiscom(linha())).toEqual({
      nome: 'Ambev',
      cnpj: '00.000.000/0000-00',
      cod_siscom: '12345',
      setor: 'Bebidas',
      industria: 'Cervejas',
      head_setor: 'Fulana',
      gerente_industria: 'Sicrano',
      executivo_linear_360: 'Raphael Jucá',
      executivo_digital: 'Adriana Lima',
      apto_regional: true,
    })
  })

  it('descarta a linha sem Cliente', () => {
    expect(projetarLinhaCarteiraSiscom(linha({ Cliente: '' }))).toBeNull()
    expect(projetarLinhaCarteiraSiscom(linha({ Cliente: '   ' }))).toBeNull()
  })

  it('trata células vazias como null, não string vazia', () => {
    const projetada = projetarLinhaCarteiraSiscom(linha({ 'Cód SISCOM': '', 'Head Setor': '' }))
    expect(projetada?.cod_siscom).toBeNull()
    expect(projetada?.head_setor).toBeNull()
  })

  it('só "Sim" conta como elegível para regional', () => {
    expect(projetarLinhaCarteiraSiscom(linha({ 'Elegível para regional': 'Não' }))?.apto_regional).toBe(false)
    expect(projetarLinhaCarteiraSiscom(linha({ 'Elegível para regional': '' }))?.apto_regional).toBe(false)
    expect(projetarLinhaCarteiraSiscom(linha({ 'Elegível para regional': 'sim' }))?.apto_regional).toBe(true)
  })
})

describe('deduplicarPorNome', () => {
  const base: ClienteDaCarteiraSiscom = {
    nome: '1XBET',
    cnpj: '00.000.000/0000-00',
    cod_siscom: null,
    setor: 'Serviços e Telecom',
    industria: 'Telecom & Plataformas',
    head_setor: null,
    gerente_industria: null,
    executivo_linear_360: 'Christina Vieira',
    executivo_digital: 'Adriana Lima',
    apto_regional: false,
  }

  it('mantém uma linha só quando não há repetição', () => {
    expect(deduplicarPorNome([base])).toEqual([base])
  })

  it('a linha com Cód SISCOM vence a linha sem código', () => {
    const semCodigo = base
    const comCodigo = { ...base, cod_siscom: '1046352' }
    expect(deduplicarPorNome([semCodigo, comCodigo])).toEqual([comCodigo])
    // ordem invertida — o resultado não deve depender de qual veio primeiro
    expect(deduplicarPorNome([comCodigo, semCodigo])).toEqual([comCodigo])
  })

  it('em empate (as duas com código, ou nenhuma), vence a última do arquivo', () => {
    const primeira = { ...base, cod_siscom: '111' }
    const ultima = { ...base, cod_siscom: '222' }
    expect(deduplicarPorNome([primeira, ultima])).toEqual([ultima])

    const primeiraSemCodigo = { ...base, setor: 'A' }
    const ultimaSemCodigo = { ...base, setor: 'B' }
    expect(deduplicarPorNome([primeiraSemCodigo, ultimaSemCodigo])).toEqual([ultimaSemCodigo])
  })

  it('ignora acento e caixa ao comparar nomes', () => {
    const comAcento = { ...base, nome: '1xbet' }
    const semAcento = { ...base, nome: '1XBET  ' }
    expect(deduplicarPorNome([comAcento, semAcento])).toHaveLength(1)
  })

  it('preserva clientes com nomes diferentes', () => {
    const outro = { ...base, nome: 'Nestlé' }
    expect(deduplicarPorNome([base, outro])).toHaveLength(2)
  })
})

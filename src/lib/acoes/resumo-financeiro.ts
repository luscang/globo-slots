'use server'

import { obterPrograma } from '../dados/programas'
import { listarDatasEspeciais } from '../dados/datas-especiais'
import { listarPrecos } from '../dados/regional'
import { obterSessao } from '../sessao-servidor'
import { calcularResumoFinanceiro, type ItemParaResumoFinanceiro, type ResumoFinanceiroDaProposta } from '../dominio/resumo-financeiro'

export async function carregarResumoFinanceiro(params: {
  programaId: string
  modalidade: 'nacional' | 'regional'
  itens: ItemParaResumoFinanceiro[]
}): Promise<{ resumo: ResumoFinanceiroDaProposta | null; erro: string | null }> {
  const sessao = await obterSessao()
  if (!sessao) return { resumo: null, erro: 'Sessão expirada. Entre de novo.' }

  const programa = await obterPrograma(params.programaId)
  if (!programa) return { resumo: null, erro: 'Programa não encontrado.' }

  const [periodosEspeciais, precosRegionais] = await Promise.all([
    listarDatasEspeciais(params.programaId),
    params.modalidade === 'regional' ? listarPrecos(params.programaId) : Promise.resolve([]),
  ])

  return {
    resumo: calcularResumoFinanceiro({
      programa,
      modalidade: params.modalidade,
      itens: params.itens,
      periodosEspeciais,
      precosRegionais,
    }),
    erro: null,
  }
}

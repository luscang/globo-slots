import { obterPrograma } from '@/lib/dados/programas'
import { listarSlidesDoModelo } from '@/lib/dados/modelo-proposta'
import { listarDatasEspeciais } from '@/lib/dados/datas-especiais'
import { obterSessao } from '@/lib/sessao-servidor'
import { podeEditarPrograma } from '@/lib/dominio/perfis'
import { calcularResumoFinanceiro } from '@/lib/dominio/resumo-financeiro'
import { gerarPdfDaProposta } from '@/lib/propostas/pdf'

export const runtime = 'nodejs'

function iso(data: Date): string {
  return data.toISOString().slice(0, 10)
}

function datasDeTeste(diasDaSemana: number[]): string[] {
  const diasPermitidos = new Set(diasDaSemana)
  const hoje = new Date()
  const cursor = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + 1))
  const datas: string[] = []

  for (let tentativa = 0; tentativa < 90 && datas.length < 3; tentativa += 1) {
    if (diasPermitidos.has(cursor.getUTCDay())) datas.push(iso(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return datas.length > 0 ? datas : [iso(cursor)]
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const sessao = await obterSessao()
  if (!sessao) return new Response('Sessão expirada.', { status: 401 })

  if (!podeEditarPrograma(sessao.perfis, sessao.programasVinculados, id)) {
    return new Response('Sem permissão para visualizar o teste deste modelo.', { status: 403 })
  }

  const url = new URL(request.url)
  const modalidade = url.searchParams.get('modalidade') === 'regional' ? 'regional' : 'nacional'

  const [programa, slides, periodosEspeciais] = await Promise.all([
    obterPrograma(id),
    listarSlidesDoModelo(id, modalidade),
    listarDatasEspeciais(id),
  ])
  if (!programa) return new Response('Programa não encontrado.', { status: 404 })

  const itens = datasDeTeste(programa.dias_da_semana).map((data) => ({
    data,
    quantidade: 1,
    pracas: modalidade === 'regional' ? ['SP'] : ([] as string[]),
  }))

  // Digital e Redes Sociais não são mais escolha nenhuma: no Nacional entram
  // sempre que o programa os oferece; no Regional, nunca — calcularResumoFinanceiro
  // já aplica essa regra sozinho a partir de `programa` e `modalidade`.
  const resumo = calcularResumoFinanceiro({
    programa,
    modalidade,
    itens,
    periodosEspeciais,
  })

  const pdf = await gerarPdfDaProposta({
    propostaId: 'TESTE-0000',
    marcaNome: 'MARCA TESTE',
    clienteNome: 'ANUNCIANTE TESTE',
    programaNome: programa.nome,
    objetivo: 'Apresentar a marca de forma contextualizada ao público do programa, reforçando a mensagem principal da campanha e a conexão com a audiência.',
    modalidade,
    resumo,
    slides,
    modoTeste: true,
  })

  return new Response(Buffer.from(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="modelo-${programa.mnemonico.toLowerCase()}-teste.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}

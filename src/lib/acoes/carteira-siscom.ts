'use server'

import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'
import { criarClienteServidor } from '../supabase/cliente-servidor'
import { obterSessao } from '../sessao-servidor'
import { temPerfil } from '../dominio/perfis'
import {
  deduplicarPorNome,
  projetarLinhaCarteiraSiscom,
  type ClienteDaCarteiraSiscom,
  type LinhaBrutaCarteiraSiscom,
} from '../dominio/carteira-siscom'

export type ResultadoImportacaoCarteiraSiscom = {
  erro: string | null
  recebidos: number
  descartados: number
  inseridos: number
  atualizados: number
}

function resultadoDeErro(erro: string): ResultadoImportacaoCarteiraSiscom {
  return { erro, recebidos: 0, descartados: 0, inseridos: 0, atualizados: 0 }
}

async function exigirProprietario() {
  const sessao = await obterSessao()
  if (!sessao || !temPerfil(sessao.perfis, 'proprietario')) return null
  return sessao
}

/** Lê o `.xlsx` enviado pelo formulário e devolve as linhas cruas, uma por objeto. */
async function lerLinhasDoArquivo(arquivo: File): Promise<LinhaBrutaCarteiraSiscom[]> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  const livro = XLSX.read(bytes, { type: 'array' })
  const aba = livro.Sheets[livro.SheetNames[0]]
  return XLSX.utils.sheet_to_json<LinhaBrutaCarteiraSiscom>(aba, { defval: '' })
}

export async function importarCarteiraSiscom(
  formulario: FormData,
): Promise<ResultadoImportacaoCarteiraSiscom> {
  const sessao = await exigirProprietario()
  if (!sessao) return resultadoDeErro('Apenas o Proprietário pode importar a Carteira Siscom.')

  const arquivo = formulario.get('arquivo')
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return resultadoDeErro('Escolha um arquivo .xlsx para importar.')
  }

  let linhasBrutas: LinhaBrutaCarteiraSiscom[]
  try {
    linhasBrutas = await lerLinhasDoArquivo(arquivo)
  } catch {
    return resultadoDeErro('Não foi possível ler o arquivo. Confirme que é um .xlsx válido.')
  }

  const projetadas = linhasBrutas
    .map(projetarLinhaCarteiraSiscom)
    .filter((linha): linha is ClienteDaCarteiraSiscom => linha !== null)
  const deduplicadas = deduplicarPorNome(projetadas)

  if (deduplicadas.length === 0) {
    return resultadoDeErro('Nenhuma linha com "Cliente" preenchido foi encontrada no arquivo.')
  }

  const supabase = await criarClienteServidor()
  const { data, error } = await supabase.rpc('upsert_carteira_siscom', { p_linhas: deduplicadas })

  if (error) {
    const texto = error.message.toLowerCase()
    if (texto.includes('upsert_carteira_siscom') || texto.includes('could not find')) {
      return resultadoDeErro(
        'Execute supabase/schema-entrega-10-carteira-siscom.sql no Supabase antes de importar.',
      )
    }
    return resultadoDeErro(error.message || 'Não foi possível gravar a Carteira Siscom.')
  }

  const linha = Array.isArray(data) ? data[0] : data
  revalidatePath('/configuracoes/carteira-siscom')

  return {
    erro: null,
    recebidos: linhasBrutas.length,
    descartados: linhasBrutas.length - projetadas.length,
    inseridos: Number(linha?.inseridos ?? 0),
    atualizados: Number(linha?.atualizados ?? 0),
  }
}

export type EntradaClienteCarteiraSiscom = {
  nome: string
  cnpj: string
  codSiscom: string
  setor: string
  industria: string
  headSetor: string
  gerenteIndustria: string
  executivoLinear360: string
  executivoDigital: string
  aptoRegional: boolean
}

function vazioParaNull(valor: string): string | null {
  const limpo = valor.trim()
  return limpo === '' ? null : limpo
}

export async function adicionarClienteNaCarteiraSiscom(
  entrada: EntradaClienteCarteiraSiscom,
): Promise<{ erro: string | null }> {
  const sessao = await exigirProprietario()
  if (!sessao) return { erro: 'Apenas o Proprietário pode cadastrar clientes na Carteira Siscom.' }

  const nome = entrada.nome.trim()
  if (!nome) return { erro: 'Informe o nome do Cliente.' }

  const linha: ClienteDaCarteiraSiscom = {
    nome,
    cnpj: vazioParaNull(entrada.cnpj),
    cod_siscom: vazioParaNull(entrada.codSiscom),
    setor: vazioParaNull(entrada.setor),
    industria: vazioParaNull(entrada.industria),
    head_setor: vazioParaNull(entrada.headSetor),
    gerente_industria: vazioParaNull(entrada.gerenteIndustria),
    executivo_linear_360: vazioParaNull(entrada.executivoLinear360),
    executivo_digital: vazioParaNull(entrada.executivoDigital),
    apto_regional: entrada.aptoRegional,
  }

  const supabase = await criarClienteServidor()
  const { error } = await supabase.rpc('upsert_carteira_siscom', { p_linhas: [linha] })
  if (error) return { erro: error.message || 'Não foi possível gravar o cliente.' }

  revalidatePath('/configuracoes/carteira-siscom')
  return { erro: null }
}

'use server'

import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'
import { criarClienteServidor } from '../supabase/cliente-servidor'
import { obterSessao } from '../sessao-servidor'
import { temPerfil } from '../dominio/perfis'
import {
  deduplicarPorEmail,
  projetarLinhaCadastroExecutivo,
  type ExecutivoDoCadastro,
  type LinhaBrutaCadastroExecutivo,
} from '../dominio/cadastro-executivo'

export type ResultadoImportacaoCadastroExecutivo = {
  erro: string | null
  recebidos: number
  descartados: number
  gravados: number
}

function resultadoDeErro(erro: string): ResultadoImportacaoCadastroExecutivo {
  return { erro, recebidos: 0, descartados: 0, gravados: 0 }
}

function mensagemDeErroDoBanco(erro: { message: string }): string {
  const texto = erro.message.toLowerCase()
  if (texto.includes('carteira_executivo') || texto.includes('could not find')) {
    return 'Execute supabase/schema-entrega-10-carteira-siscom.sql no Supabase antes de importar.'
  }
  return erro.message || 'Não foi possível gravar o Cadastro Executivo.'
}

async function exigirProprietario() {
  const sessao = await obterSessao()
  if (!sessao || !temPerfil(sessao.perfis, 'proprietario')) return null
  return sessao
}

async function lerLinhasDoArquivo(arquivo: File): Promise<LinhaBrutaCadastroExecutivo[]> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  const livro = XLSX.read(bytes, { type: 'array' })
  const aba = livro.Sheets[livro.SheetNames[0]]
  return XLSX.utils.sheet_to_json<LinhaBrutaCadastroExecutivo>(aba, { defval: '' })
}

export async function importarCadastroExecutivo(
  formulario: FormData,
): Promise<ResultadoImportacaoCadastroExecutivo> {
  const sessao = await exigirProprietario()
  if (!sessao) return resultadoDeErro('Apenas o Proprietário pode importar o Cadastro Executivo.')

  const arquivo = formulario.get('arquivo')
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return resultadoDeErro('Escolha um arquivo .xlsx para importar.')
  }

  let linhasBrutas: LinhaBrutaCadastroExecutivo[]
  try {
    linhasBrutas = await lerLinhasDoArquivo(arquivo)
  } catch {
    return resultadoDeErro('Não foi possível ler o arquivo. Confirme que é um .xlsx válido.')
  }

  const projetadas = linhasBrutas
    .map(projetarLinhaCadastroExecutivo)
    .filter((linha): linha is ExecutivoDoCadastro => linha !== null)
  const deduplicadas = deduplicarPorEmail(projetadas)

  if (deduplicadas.length === 0) {
    return resultadoDeErro('Nenhuma linha com "Executivo Linear (360)" e e-mail válido foi encontrada no arquivo.')
  }

  const supabase = await criarClienteServidor()
  const { error, count } = await supabase
    .from('carteira_executivo')
    .upsert(deduplicadas, { onConflict: 'email', count: 'exact' })

  if (error) return resultadoDeErro(mensagemDeErroDoBanco(error))

  revalidatePath('/configuracoes/cadastro-executivo')
  return {
    erro: null,
    recebidos: linhasBrutas.length,
    descartados: linhasBrutas.length - projetadas.length,
    gravados: count ?? deduplicadas.length,
  }
}

export type EntradaExecutivo = {
  executivoLinear360: string
  email: string
  nomeSalesforce: string
}

export async function adicionarExecutivo(
  entrada: EntradaExecutivo,
): Promise<{ erro: string | null }> {
  const sessao = await exigirProprietario()
  if (!sessao) return { erro: 'Apenas o Proprietário pode cadastrar um executivo.' }

  const projetada = projetarLinhaCadastroExecutivo({
    'Executivo Linear (360)': entrada.executivoLinear360,
    Email: entrada.email,
    'Nome no Salesforce': entrada.nomeSalesforce,
  })
  if (!projetada) return { erro: 'Informe o nome e um e-mail válido.' }

  const supabase = await criarClienteServidor()
  const { error } = await supabase
    .from('carteira_executivo')
    .upsert(projetada, { onConflict: 'email' })

  if (error) return { erro: mensagemDeErroDoBanco(error) }

  revalidatePath('/configuracoes/cadastro-executivo')
  return { erro: null }
}

export async function removerExecutivo(id: string): Promise<{ erro: string | null }> {
  const sessao = await exigirProprietario()
  if (!sessao) return { erro: 'Apenas o Proprietário pode remover um executivo.' }

  const supabase = await criarClienteServidor()
  const { error } = await supabase.from('carteira_executivo').delete().eq('id', id)
  if (error) return { erro: mensagemDeErroDoBanco(error) }

  revalidatePath('/configuracoes/cadastro-executivo')
  return { erro: null }
}

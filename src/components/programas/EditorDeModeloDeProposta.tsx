'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  adicionarSlidesAoModelo,
  moverSlideDoModelo,
  removerSlideDoModelo,
} from '@/lib/acoes/modelo-proposta'
import {
  slidesDaSecao,
  type ModalidadeDoModelo,
  type SecaoDoModeloDeProposta,
  type SlideDoModeloDeProposta,
} from '@/lib/dominio/modelo-proposta'

type Props = {
  programaId: string
  programaNome: string
  contemDigital: boolean
  temRedesSociais: boolean
  aceitaRegional: boolean
  slides: SlideDoModeloDeProposta[]
}

type ConfiguracaoDaSecao = {
  id: SecaoDoModeloDeProposta
  titulo: string
  descricao: string
  unico?: boolean
  condicional?: 'digital' | 'redes'
  valorCalculado?: boolean
}

const SECOES: ConfiguracaoDaSecao[] = [
  {
    id: 'capa',
    titulo: 'Capa',
    descricao: 'Primeiro slide da proposta. Uma nova imagem substitui a atual.',
    unico: true,
  },
  {
    id: 'conteudo',
    titulo: 'Conteúdo',
    descricao: 'Apresentação do programa, formato, audiência e demais argumentos comerciais.',
  },
  {
    id: 'digital',
    titulo: 'Digital',
    descricao: 'Entra automaticamente em toda proposta nacional deste programa — não é mais uma escolha do executivo.',
    condicional: 'digital',
  },
  {
    id: 'redes_sociais',
    titulo: 'Redes Sociais',
    descricao: 'Entra automaticamente em toda proposta nacional deste programa — não é mais uma escolha do executivo.',
    condicional: 'redes',
  },
  {
    id: 'valor',
    titulo: 'Valor',
    descricao: 'Posição do resumo comercial calculado. A imagem é um fundo opcional; os valores são inseridos automaticamente.',
    unico: true,
    valorCalculado: true,
  },
  {
    id: 'observacoes',
    titulo: 'Observações',
    descricao: 'Regras, ressalvas e informações que devem aparecer depois do resumo comercial.',
  },
  {
    id: 'contracapa',
    titulo: 'Contracapa',
    descricao: 'Último slide da proposta. Uma nova imagem substitui a atual.',
    unico: true,
  },
]

export function EditorDeModeloDeProposta({
  programaId,
  programaNome,
  contemDigital,
  temRedesSociais,
  aceitaRegional,
  slides,
}: Props) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [secaoParaUpload, setSecaoParaUpload] = useState<ConfiguracaoDaSecao | null>(null)
  const [modalidade, setModalidade] = useState<ModalidadeDoModelo>('nacional')

  function abrirSeletor(secao: ConfiguracaoDaSecao) {
    setErro(null)
    setSecaoParaUpload(secao)
    requestAnimationFrame(() => input.current?.click())
  }

  async function adicionar(arquivos: File[]) {
    if (!secaoParaUpload || arquivos.length === 0) return
    const secao = secaoParaUpload
    setOcupado(true)
    setErro(null)

    // A seleção continua múltipla para o usuário, mas cada imagem é enviada
    // em uma Server Action própria. Assim o tamanho total de 6, 10 ou mais
    // slides não precisa caber em um único corpo de requisição.
    for (let indice = 0; indice < arquivos.length; indice += 1) {
      const arquivo = arquivos[indice]
      const formulario = new FormData()
      formulario.append('arquivos', arquivo)
      const resultado = await adicionarSlidesAoModelo(programaId, secao.id, modalidade, formulario)

      if (resultado.erro) {
        setOcupado(false)
        if (input.current) input.current.value = ''
        setErro(
          arquivos.length > 1
            ? `Falha no arquivo ${indice + 1} de ${arquivos.length} (“${arquivo.name}”): ${resultado.erro}`
            : resultado.erro,
        )
        router.refresh()
        return
      }
    }

    setOcupado(false)
    if (input.current) input.current.value = ''
    setSecaoParaUpload(null)
    router.refresh()
  }

  async function mover(slideId: string, direcao: 'subir' | 'descer') {
    setOcupado(true)
    setErro(null)
    const resultado = await moverSlideDoModelo(programaId, slideId, direcao)
    setOcupado(false)
    if (resultado.erro) setErro(resultado.erro)
    else router.refresh()
  }

  async function remover(slideId: string) {
    if (!window.confirm('Remover este slide do modelo de proposta?')) return
    setOcupado(true)
    setErro(null)
    const resultado = await removerSlideDoModelo(programaId, slideId)
    setOcupado(false)
    if (resultado.erro) setErro(resultado.erro)
    else router.refresh()
  }

  const urlTeste = `/configuracoes/programas/${programaId}/modelo/teste?modalidade=${modalidade}`

  return (
    <div className="flex flex-col gap-5">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        multiple={!secaoParaUpload?.unico}
        className="hidden"
        onChange={(evento) => {
          const arquivos = Array.from(evento.target.files ?? [])
          if (arquivos.length > 0) void adicionar(arquivos)
        }}
      />

      {aceitaRegional && (
        <div className="flex gap-1 self-start rounded-[11px] border border-[var(--borda)] bg-[var(--superficie)] p-1">
          <button
            type="button"
            onClick={() => setModalidade('nacional')}
            className="rounded-[8px] px-4 py-2 text-[12px] font-bold transition-colors"
            style={
              modalidade === 'nacional'
                ? { background: 'var(--marca)', color: '#fff' }
                : { color: 'var(--texto-3)' }
            }
          >
            Nacional
          </button>
          <button
            type="button"
            onClick={() => setModalidade('regional')}
            className="rounded-[8px] px-4 py-2 text-[12px] font-bold transition-colors"
            style={
              modalidade === 'regional'
                ? { background: 'var(--marca)', color: '#fff' }
                : { color: 'var(--texto-3)' }
            }
          >
            Regional
          </button>
        </div>
      )}

      <section className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-[var(--roxo)]">
              Modelo de propostas {aceitaRegional && `— ${modalidade === 'nacional' ? 'Nacional' : 'Regional'}`}
            </p>
            <h2 className="mt-1 text-[16px] font-bold text-[var(--texto)]">{programaNome}</h2>
            <p className="mt-1 max-w-[720px] text-[12.5px] leading-[1.55] text-[var(--texto-3)]">
              Monte o PDF pela ordem das seções abaixo. Conteúdo, Digital, Redes Sociais e Observações aceitam várias imagens de uma vez. A proposta final respeita esta mesma sequência.
            </p>
          </div>

          <div className="flex min-w-[280px] flex-col gap-3 rounded-[12px] border border-[var(--borda)] bg-[var(--superficie-suave)] p-4">
            <div>
              <p className="text-[11.5px] font-bold text-[var(--texto)]">Prévia do PDF</p>
              <p className="mt-0.5 text-[10.5px] leading-[1.4] text-[var(--texto-3)]">Não cria proposta, não envia e-mail e não entra no histórico.</p>
            </div>
            <a
              href={urlTeste}
              target="_blank"
              rel="noreferrer"
              className="flex h-[40px] items-center justify-center rounded-[10px] border border-[var(--borda-forte)] bg-white px-4 text-[12px] font-bold text-[var(--texto-2)] hover:border-[var(--roxo)] hover:text-[var(--roxo)]"
            >
              Imprimir teste
            </a>
          </div>
        </div>

        <div className="mt-4 rounded-[11px] bg-[var(--prazo-fundo)] px-4 py-3 text-[11.5px] leading-[1.5] text-[var(--texto-2)]">
          Use PNG ou JPG em 16:9. Arquivos de até 8 MB. Slides das seções condicionais só aparecem quando a entrega correspondente estiver incluída na proposta.
        </div>

        {erro && (
          <p role="alert" className="mt-3 rounded-[10px] border border-[var(--concorrencia)] bg-[var(--concorrencia-fundo)] px-4 py-3 text-[12px] font-semibold text-[var(--concorrencia-texto)]">
            {erro}
          </p>
        )}
      </section>

      <div className="flex flex-col gap-4">
        {/* Digital e Redes Sociais só existem no Nacional — o Regional não tem esses complementos. */}
        {SECOES.filter((secao) => modalidade === 'nacional' || secao.condicional === undefined).map((secao, indiceDaSecao) => {
          const slidesDaVez = slidesDaSecao(slides, secao.id, modalidade)
          const condicionalIndisponivel =
            (secao.condicional === 'digital' && !contemDigital) ||
            (secao.condicional === 'redes' && !temRedesSociais)

          return (
            <section
              key={secao.id}
              className="rounded-[var(--raio-card)] border border-[var(--borda)] bg-[var(--superficie)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--superficie-suave)] text-[11px] font-bold text-[var(--texto-3)]">
                    {indiceDaSecao + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[13.5px] font-bold text-[var(--texto)]">{secao.titulo}</h3>
                      {secao.condicional && (
                        <span className="rounded-full bg-[#F5F3FF] px-2 py-0.5 text-[9.5px] font-bold text-[var(--roxo)]">
                          Condicional
                        </span>
                      )}
                      {secao.valorCalculado && (
                        <span className="rounded-full bg-[var(--disponivel-fundo)] px-2 py-0.5 text-[9.5px] font-bold text-[var(--disponivel-texto)]">
                          Calculado
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-[1.45] text-[var(--texto-3)]">{secao.descricao}</p>
                    {condicionalIndisponivel && (
                      <p className="mt-1 text-[10.5px] font-semibold text-[var(--texto-3)]">
                        Habilite este complemento no Cadastro do programa para utilizá-lo.
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={ocupado || condicionalIndisponivel}
                  onClick={() => abrirSeletor(secao)}
                  className="h-9 rounded-[9px] border border-[var(--borda-forte)] px-3.5 text-[11.5px] font-bold text-[var(--roxo)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {ocupado && secaoParaUpload?.id === secao.id
                    ? 'Enviando…'
                    : secao.unico && slidesDaVez.length > 0
                      ? 'Substituir imagem'
                      : secao.unico
                        ? '+ Adicionar imagem'
                        : '+ Adicionar imagens'}
                </button>
              </div>

              <div className="mt-3 border-t border-[var(--borda)] pt-3">
                {secao.valorCalculado && slidesDaVez.length === 0 ? (
                  <div className="flex h-[86px] max-w-[155px] items-center justify-center rounded-[9px] border border-dashed border-[var(--borda-forte)] bg-[var(--superficie-suave)] px-3 text-center">
                    <p className="text-[10.5px] font-semibold leading-[1.35] text-[var(--texto-3)]">
                      Layout padrão do resumo comercial
                    </p>
                  </div>
                ) : slidesDaVez.length === 0 ? (
                  <p className="py-2 text-[11px] text-[var(--texto-3)]">Nenhuma imagem nesta seção.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {slidesDaVez.map((slide, indice) => (
                      <MiniaturaDeSlide
                        key={slide.id}
                        slide={slide}
                        indice={indice}
                        total={slidesDaVez.length}
                        unico={Boolean(secao.unico)}
                        ocupado={ocupado}
                        mover={mover}
                        remover={remover}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function MiniaturaDeSlide({
  slide,
  indice,
  total,
  unico,
  ocupado,
  mover,
  remover,
}: {
  slide: SlideDoModeloDeProposta
  indice: number
  total: number
  unico: boolean
  ocupado: boolean
  mover: (slideId: string, direcao: 'subir' | 'descer') => Promise<void>
  remover: (slideId: string) => Promise<void>
}) {
  return (
    <article className="w-[155px] overflow-hidden rounded-[9px] border border-[var(--borda)] bg-[var(--superficie-suave)]">
      <div className="relative aspect-video bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={slide.imagem_url} alt={`Slide ${indice + 1}`} className="h-full w-full object-contain" />
        {!unico && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[8.5px] font-bold text-white">
            {indice + 1}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1 border-t border-[var(--borda)] px-1.5 py-1.5">
        {!unico ? (
          <div className="flex gap-1">
            <button
              type="button"
              title="Mover para antes"
              aria-label="Mover para antes"
              disabled={ocupado || indice === 0}
              onClick={() => void mover(slide.id, 'subir')}
              className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-[var(--borda)] text-[11px] font-bold text-[var(--texto-2)] disabled:opacity-25"
            >
              ↑
            </button>
            <button
              type="button"
              title="Mover para depois"
              aria-label="Mover para depois"
              disabled={ocupado || indice === total - 1}
              onClick={() => void mover(slide.id, 'descer')}
              className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-[var(--borda)] text-[11px] font-bold text-[var(--texto-2)] disabled:opacity-25"
            >
              ↓
            </button>
          </div>
        ) : <span />}
        <button
          type="button"
          title="Remover imagem"
          aria-label="Remover imagem"
          disabled={ocupado}
          onClick={() => void remover(slide.id)}
          className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[14px] font-bold text-[var(--concorrencia-texto)] disabled:opacity-30"
        >
          ×
        </button>
      </div>
    </article>
  )
}

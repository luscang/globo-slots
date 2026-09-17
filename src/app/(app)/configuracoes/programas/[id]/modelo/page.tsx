import { notFound } from 'next/navigation'
import { EditorDeModeloDeProposta } from '@/components/programas/EditorDeModeloDeProposta'
import { listarSlidesDoModelo } from '@/lib/dados/modelo-proposta'
import { obterPrograma } from '@/lib/dados/programas'

export default async function PaginaDeModeloDeProposta({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [programa, slides] = await Promise.all([
    obterPrograma(id),
    listarSlidesDoModelo(id),
  ])

  if (!programa) notFound()

  return (
    <EditorDeModeloDeProposta
      programaId={id}
      programaNome={programa.nome}
      contemDigital={programa.contem_digital}
      temRedesSociais={programa.redes_sociais}
      aceitaRegional={programa.aceita_regional}
      slides={slides}
    />
  )
}

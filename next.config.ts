import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async rewrites() {
    const baseHubAmplificado = process.env.URL_HUB_AMPLIFICADO ?? 'https://hub-amplificado.vercel.app'
    return [
      // Duas regras, não uma: '/amplificado/:path*' sozinho não cobre o caminho
      // exato '/amplificado' (gerava redirecionamento para si mesmo). Padrão
      // documentado pela Vercel para Multi-Zones.
      { source: '/amplificado', destination: `${baseHubAmplificado}/amplificado` },
      { source: '/amplificado/:path*', destination: `${baseHubAmplificado}/amplificado/:path*` },
    ]
  },
  experimental: {
    serverActions: {
      // Cada slide pode ter até 8 MB no validador da aplicação. O limite de
      // 10 MB deixa folga para o multipart/FormData sem liberar requests
      // gigantes. O editor envia uploads múltiplos uma imagem por requisição.
      bodySizeLimit: '10mb',
    },
  },
}

export default nextConfig

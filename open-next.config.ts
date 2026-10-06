import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Sem cache incremental persistente: as telas do Globo Slots são dinâmicas
// (dependem da sessão de quem está logado), então não há o que pré-gerar.
export default defineCloudflareConfig()

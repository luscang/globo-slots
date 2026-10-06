# Deploy na Cloudflare (Workers)

O Globo Slots roda como um Worker, usando o adaptador OpenNext (`@opennextjs/cloudflare`).
Arquivos de configuração: `wrangler.jsonc` e `open-next.config.ts`.

## Variáveis de ambiente

| Variável | Onde | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Build** | Embutida no código na hora do build. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Build** | Chave pública (`anon`). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** do Worker | Ignora o RLS. Só no servidor; nunca como variável de build. |
| `URL_HUB_AMPLIFICADO` | Variável do Worker | Já tem valor padrão em `wrangler.jsonc`. |
| `NEXT_PUBLIC_LOGIN_MOCK` | **Não definir** | O login mock é desligado em produção, mas não o ligue. |

`NEXT_PUBLIC_*` precisam existir **no ambiente do build**; defini-las só como secret do Worker não adianta.

## Opção A — pelo painel (recomendada, sem credenciais no terminal)

1. Cloudflare → *Workers & Pages* → *Create* → *Import a repository* → escolha `luscang/globo-slots` (branch `main`).
2. Nome do projeto: `globo-slots`.
3. Build command: `npx opennextjs-cloudflare build`
   Deploy command: `npx wrangler deploy`
4. Em *Variables and Secrets* (build): `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Em *Settings → Variables and Secrets* (runtime): adicione `SUPABASE_SERVICE_ROLE_KEY` como **Secret**.
6. Salve e faça o deploy. A URL sai como `https://globo-slots.<subdominio>.workers.dev`.

## Opção B — pelo terminal

```bash
npx wrangler login
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # cola a chave quando pedir
npm run cf:deploy
```

No Windows o build do OpenNext pode falhar em alguns ambientes; se acontecer, use a Opção A ou o WSL.

## Depois do deploy

1. **Supabase → Authentication → URL Configuration**: ponha a URL do Worker em *Site URL* e adicione
   `https://<url-do-worker>/**` em *Redirect URLs* (sem isso, "Esqueci minha senha" é recusado).
2. **Quem pode abrir o site**: por padrão a URL é pública. Para limitar a pessoas da área, use o
   Cloudflare Access (Zero Trust → Access → Applications → Self-hosted) com uma regra por e-mail
   ou domínio. Recomendado enquanto o banco tiver dados de teste.
3. **Contas**: cada pessoa precisa de uma conta no Supabase Auth (ou pedir em `/solicitar-acesso`,
   que o Proprietário aprova em Configurações → Perfis e acessos).
4. Para o e-mail de convite funcionar com volume, configure um SMTP próprio no Supabase
   (o envio padrão tem limite baixo por hora).

## Limitação conhecida

O `proxy.ts` do Next 16 roda como middleware Node, que o OpenNext trata como **experimental**
na Cloudflare. Ele só renova o token de sessão do Supabase; testado em `workerd` (login, rota protegida
e página pública funcionam). Se aparecer deslogamento inesperado em produção, é o primeiro lugar a olhar.

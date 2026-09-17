-- Globo Slots — Solicitação de acesso (self-service) + fechamento da lacuna
-- do perfil automático.
--
-- Duas mudanças de comportamento que andam juntas:
--
-- 1. Antes desta entrega, QUALQUER conta autenticada sem linha em
--    `perfil_usuario` virava "executivo" automaticamente (fallback em
--    `src/lib/sessao-servidor.ts`) — mesmo alguém com conta no Supabase por
--    outro motivo, nunca vinculado à Carteira Siscom. Agora esse fallback só
--    vale para quem está em `carteira_executivo`; sem isso, a pessoa fica sem
--    nenhum perfil (tela "Sem acesso" no app, não um erro).
--
-- 2. Como agora é possível "logar e não ter perfil nenhum", precisa haver um
--    caminho para pedir acesso sem depender do painel do Supabase. Esta
--    migration cria `solicitacao_de_acesso`: qualquer pessoa (mesmo sem
--    login) pode criar um pedido pela tela pública `/solicitar-acesso`; só o
--    Proprietário lê e aprova/rejeita, pela tela Perfis e acessos. Aprovar
--    cria a conta de verdade (Admin API do Supabase, convite por e-mail) e já
--    grava o(s) perfil(is) escolhido(s).
--
-- Rode no SQL Editor do Supabase depois de schema-entrega-10-carteira-siscom.sql.
-- Idempotente.

create table if not exists solicitacao_de_acesso (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  perfil_solicitado text not null
    check (perfil_solicitado in ('executivo', 'executivo_regional', 'consultor_programa', 'proprietario')),
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'rejeitada')),
  perfis_concedidos text[],
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid references auth.users (id) on delete set null
);

-- Só uma solicitação pendente por e-mail — reenviar o formulário não empilha
-- pedidos duplicados; a pessoa só precisa esperar a análise da primeira.
create unique index if not exists solicitacao_de_acesso_pendente_email_idx
  on solicitacao_de_acesso (lower(email))
  where status = 'pendente';

create index if not exists solicitacao_de_acesso_status_idx on solicitacao_de_acesso (status);

alter table solicitacao_de_acesso enable row level security;

-- A tela de pedido é pública (fica fora do grupo autenticado, em
-- /solicitar-acesso) — por isso o insert precisa valer também para `anon`.
-- O `with check` trava os campos que só a aprovação pode preencher.
drop policy if exists "solicitacao acesso criar publica" on solicitacao_de_acesso;
create policy "solicitacao acesso criar publica" on solicitacao_de_acesso
  for insert to anon, authenticated with check (
    status = 'pendente'
    and perfis_concedidos is null
    and resolvido_em is null
    and resolvido_por is null
  );

drop policy if exists "solicitacao acesso leitura proprietario" on solicitacao_de_acesso;
create policy "solicitacao acesso leitura proprietario" on solicitacao_de_acesso
  for select to authenticated using (e_proprietario());

drop policy if exists "solicitacao acesso resolucao proprietario" on solicitacao_de_acesso;
create policy "solicitacao acesso resolucao proprietario" on solicitacao_de_acesso
  for update to authenticated using (e_proprietario()) with check (e_proprietario());

-- ---------------------------------------------------------------------------
-- Remover o acesso de um usuário (botão "Remover" em Perfis e acessos).
--
-- Só apaga `perfil_usuario`/`consultor_programa` — a conta no Supabase Auth
-- continua existindo (a pessoa só passa a ver a tela "Sem acesso" no próximo
-- login). `atualizar_acessos_usuario` não serve pra isso: ela exige pelo
-- menos um perfil de propósito, então remover todos precisa de uma função
-- própria.
-- ---------------------------------------------------------------------------
create or replace function remover_acessos_usuario(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_era_proprietario boolean;
  v_total_proprietarios integer;
begin
  if not e_proprietario() then
    raise exception 'Apenas o proprietário pode remover o acesso de um usuário.';
  end if;

  select exists(
    select 1 from perfil_usuario where usuario_id = p_usuario_id and perfil = 'proprietario'
  ) into v_era_proprietario;

  if v_era_proprietario then
    select count(*) into v_total_proprietarios from perfil_usuario where perfil = 'proprietario';
    if v_total_proprietarios <= 1 then
      raise exception 'Não é possível remover o único Proprietário do sistema.';
    end if;
  end if;

  delete from consultor_programa where usuario_id = p_usuario_id;
  delete from perfil_usuario where usuario_id = p_usuario_id;
end;
$$;

revoke all on function remover_acessos_usuario(uuid) from public;
grant execute on function remover_acessos_usuario(uuid) to authenticated;

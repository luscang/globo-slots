-- Globo Slots — Carteira Siscom e Cadastro Executivo.
--
-- Duas coisas novas:
-- 1. `clientes` ganha as colunas da planilha "Carteira Siscom.xlsx" que ainda
--    não existiam (Head Setor, Gerente Indústria, Executivo Linear (360),
--    Executivo Digital). As demais colunas da planilha (Cliente, CNPJ, Cód
--    SISCOM, Setor, Indústria, Elegível para regional) já existem — mapeiam
--    para nome/cnpj/cod_siscom/setor/industria/apto_regional.
-- 2. Tabela `carteira_executivo`: liga o e-mail de quem loga ao nome usado
--    nas colunas "Executivo Linear (360)"/"Executivo Digital" de `clientes`.
--    É a partir dela que o app decide quais clientes cada executivo pode ver.
--
-- Também corrige uma policy de escrita em `clientes` que estava morta: a
-- policy antiga usava `e_administrador()`, uma função que checa os perfis
-- 'admin_programa'/'admin_geral' — perfis que não existem mais desde a
-- Entrega 2 (os perfis atuais são executivo/executivo_regional/
-- consultor_programa/proprietario). Na prática, ninguém nunca conseguiu
-- gravar em `clientes` pela tela (só pelo script com a chave de serviço, que
-- ignora RLS). Substituída por `e_proprietario()`, a mesma já usada em todo
-- o resto do app.
--
-- Rode no SQL Editor do Supabase depois de schema-clientes-regional.sql.
-- Idempotente.

-- ---------------------------------------------------------------------------
-- 1. Colunas novas em `clientes`
-- ---------------------------------------------------------------------------
alter table clientes
  add column if not exists head_setor text,
  add column if not exists gerente_industria text,
  add column if not exists executivo_linear_360 text,
  add column if not exists executivo_digital text;

comment on column clientes.head_setor is
  'Head Setor da Carteira Siscom. Só guardado — nenhuma regra depende dele.';
comment on column clientes.gerente_industria is
  'Gerente Indústria da Carteira Siscom. Só guardado — nenhuma regra depende dele.';
comment on column clientes.executivo_linear_360 is
  'Executivo Linear (360) da Carteira Siscom. Junto com executivo_digital, define '
  'quais clientes um executivo pode ver ao montar uma consulta (ver carteira_executivo).';
comment on column clientes.executivo_digital is
  'Executivo Digital da Carteira Siscom. Mesma função de executivo_linear_360: um '
  'cliente fica visível para quem aparecer em QUALQUER uma das duas colunas.';

-- Toda busca de cliente na consulta passa por aqui quando quem procura não é
-- Proprietário/PO do produto — sem índice, filtra 15+ mil linhas na mão.
create index if not exists clientes_executivo_linear_idx on clientes (executivo_linear_360);
create index if not exists clientes_executivo_digital_idx on clientes (executivo_digital);

-- ---------------------------------------------------------------------------
-- 2. Tabela `carteira_executivo`
-- ---------------------------------------------------------------------------
-- `email` é gravado sempre em minúsculas pela aplicação (nunca confie nisso
-- sozinho: é convenção da camada de ações, não uma garantia do banco) — assim
-- a constraint única fica numa coluna simples, compatível com `upsert(...,
-- { onConflict: 'email' })` do supabase-js, que não sabe montar
-- `ON CONFLICT (lower(email))` a partir de um índice de expressão.
create table if not exists carteira_executivo (
  id uuid primary key default gen_random_uuid(),
  executivo_linear_360 text not null,
  email text not null unique,
  nome_salesforce text,
  atualizado_em timestamptz not null default now()
);

alter table carteira_executivo enable row level security;

drop policy if exists "carteira executivo leitura autenticada" on carteira_executivo;
create policy "carteira executivo leitura autenticada" on carteira_executivo
  for select to authenticated using (true);

drop policy if exists "carteira executivo escrita proprietario" on carteira_executivo;
create policy "carteira executivo escrita proprietario" on carteira_executivo
  for all to authenticated using (e_proprietario()) with check (e_proprietario());

-- ---------------------------------------------------------------------------
-- 3. RLS de escrita em `clientes` — corrige a policy morta
-- ---------------------------------------------------------------------------
drop policy if exists "escrita administrador" on clientes;
drop policy if exists "clientes escrita proprietario" on clientes;
create policy "clientes escrita proprietario" on clientes
  for all to authenticated using (e_proprietario()) with check (e_proprietario());

-- ---------------------------------------------------------------------------
-- 4. Upsert em lote da Carteira Siscom
--
-- `nome` não tem (e não ganha aqui) constraint única — a base atual, herdada
-- da Carteira.xlsx original, pode já ter nomes repetidos, e criar a
-- constraint agora quebraria a migration se isso acontecer. Por isso o
-- casamento é feito em SQL, por comparação (upper+trim), não por
-- `on conflict`: uma viagem só ao banco para milhares de linhas, sem exigir
-- que a tabela já esteja limpa.
-- ---------------------------------------------------------------------------
create or replace function upsert_carteira_siscom(p_linhas jsonb)
returns table(inseridos integer, atualizados integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inseridos integer;
  v_atualizados integer;
begin
  if not e_proprietario() then
    raise exception 'Apenas o proprietário pode importar a Carteira Siscom.';
  end if;

  create temporary table tmp_carteira_siscom on commit drop as
  select *
  from jsonb_to_recordset(p_linhas) as x(
    nome text,
    cnpj text,
    cod_siscom text,
    setor text,
    industria text,
    head_setor text,
    gerente_industria text,
    executivo_linear_360 text,
    executivo_digital text,
    apto_regional boolean
  )
  where nullif(trim(x.nome), '') is not null;

  with linhas_atualizadas as (
    update clientes c set
      cnpj = t.cnpj,
      cod_siscom = t.cod_siscom,
      setor = t.setor,
      industria = t.industria,
      head_setor = t.head_setor,
      gerente_industria = t.gerente_industria,
      executivo_linear_360 = t.executivo_linear_360,
      executivo_digital = t.executivo_digital,
      apto_regional = coalesce(t.apto_regional, false)
    from tmp_carteira_siscom t
    where upper(trim(c.nome)) = upper(trim(t.nome))
    returning c.id
  )
  select count(*) into v_atualizados from linhas_atualizadas;

  insert into clientes (
    nome, cnpj, cod_siscom, setor, industria,
    head_setor, gerente_industria, executivo_linear_360, executivo_digital, apto_regional
  )
  select
    t.nome, t.cnpj, t.cod_siscom, t.setor, t.industria,
    t.head_setor, t.gerente_industria, t.executivo_linear_360, t.executivo_digital,
    coalesce(t.apto_regional, false)
  from tmp_carteira_siscom t
  where not exists (
    select 1 from clientes c where upper(trim(c.nome)) = upper(trim(t.nome))
  );
  get diagnostics v_inseridos = row_count;

  return query select v_inseridos, v_atualizados;
end;
$$;

revoke all on function upsert_carteira_siscom(jsonb) from public;
grant execute on function upsert_carteira_siscom(jsonb) to authenticated;

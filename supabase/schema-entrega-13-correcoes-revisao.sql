-- Globo Slots — correções da revisão geral pós-Carteira Siscom.
--
-- 1. `upsert_carteira_siscom` casava nomes com `upper(trim())`, sem tirar
--    acento — diferente de toda comparação de nome usada no resto do
--    projeto (`normalizar_nome_take` em SQL, `normalizarNome` em TS). Uma
--    grafia "NESTLÉ" na planilha contra "NESTLE" já cadastrado não batia,
--    e a importação criava um cliente NOVO em vez de atualizar o existente.
--    Isso já aconteceu de verdade na carga desta entrega (37 clientes
--    duplicados, mesclados manualmente à parte). Agora usa
--    `normalizar_nome_take` como todo o resto do projeto já faz.
--
-- 2. `cadastrar_marca_da_carteira` ainda decidia se o executivo pode
--    cadastrar uma marca nova por `clientes.email`/`clientes.executivo`
--    (colunas antigas, texto livre) e `usuario.nome` (que quase nunca
--    existe — nada no app grava a tabela `usuario`). Era o mesmo mecanismo
--    quebrado que schema-entrega-12-carteira-em-busca-de-marcas.sql já
--    corrigiu em `buscar_marcas`/`marcas_do_cliente`, só que esta função
--    ficou de fora daquela correção. Agora usa `carteira_executivo` +
--    `executivo_linear_360`/`executivo_digital`, igual às outras duas.
--
-- Rode no SQL Editor do Supabase depois de
-- schema-entrega-12-carteira-em-busca-de-marcas.sql. Idempotente.

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
    where normalizar_nome_take(c.nome) = normalizar_nome_take(t.nome)
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
    select 1 from clientes c where normalizar_nome_take(c.nome) = normalizar_nome_take(t.nome)
  );
  get diagnostics v_inseridos = row_count;

  return query select v_inseridos, v_atualizados;
end;
$$;

revoke all on function upsert_carteira_siscom(jsonb) from public;
grant execute on function upsert_carteira_siscom(jsonb) to authenticated;

create or replace function cadastrar_marca_da_carteira(
  p_nome_marca text,
  p_cliente_id uuid
)
returns table (
  marca_id uuid,
  marca_nome text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_nome text := trim(coalesce(p_nome_marca, ''));
  v_normalizado text;
  v_marca_id uuid;
  v_cliente_existente uuid;
  v_email_logado text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_nome_logado text;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada.';
  end if;

  if v_nome = '' then
    raise exception 'Informe somente o nome da marca.';
  end if;

  if length(v_nome) > 120 then
    raise exception 'O nome da marca deve ter no máximo 120 caracteres.';
  end if;

  select normalizar_nome_take(ce.executivo_linear_360)
    into v_nome_logado
  from carteira_executivo ce
  where lower(trim(ce.email)) = v_email_logado;

  if p_cliente_id is null or not exists (
    select 1
    from clientes c
    where c.id = p_cliente_id
      and (
        e_proprietario()
        or tem_perfil('consultor_programa')
        or (
          coalesce(v_nome_logado, '') <> ''
          and (
            normalizar_nome_take(c.executivo_linear_360) = v_nome_logado
            or normalizar_nome_take(c.executivo_digital) = v_nome_logado
          )
        )
      )
  ) then
    raise exception 'Escolha um anunciante válido da sua carteira.';
  end if;

  v_normalizado := normalizar_nome_take(v_nome);

  select m.id into v_marca_id
  from marcas m
  where m.nome_normalizado = v_normalizado
  limit 1;

  if v_marca_id is not null then
    select mcm.cliente_id into v_cliente_existente
    from marca_cliente_manual mcm
    where mcm.marca_id = v_marca_id
    limit 1;

    if v_cliente_existente is not null and v_cliente_existente is distinct from p_cliente_id then
      raise exception 'Esta marca já está vinculada a outro anunciante. Solicite a revisão em Marcas e anunciantes.';
    end if;
  end if;

  insert into marcas (nome, nome_normalizado, primeiro_visto_em, ultimo_visto_em)
  values (v_nome, v_normalizado, now(), now())
  on conflict (nome_normalizado) do update
    set ultimo_visto_em = greatest(marcas.ultimo_visto_em, excluded.ultimo_visto_em)
  returning id into v_marca_id;

  insert into marca_cliente_manual (
    marca_id,
    cliente_id,
    criado_por,
    criado_em,
    origem,
    revisao_status,
    revisado_por,
    revisado_em
  )
  values (
    v_marca_id,
    p_cliente_id,
    auth.uid(),
    now(),
    'consulta',
    'pendente',
    null,
    null
  )
  on conflict on constraint marca_cliente_manual_pkey do nothing;

  return query
  select m.id, m.nome
  from marcas m
  where m.id = v_marca_id;
end;
$$;

revoke all on function cadastrar_marca_da_carteira(text, uuid) from public;
grant execute on function cadastrar_marca_da_carteira(text, uuid) to authenticated;

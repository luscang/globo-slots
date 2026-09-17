-- Globo Slots — corrige `buscar_marcas` e `marcas_do_cliente` para usar a
-- Carteira Siscom / Cadastro Executivo.
--
-- Achado testando como executivo: a Nova Consulta busca cliente/marca por
-- estas duas funções, NUNCA por `buscarClientes` (`src/lib/dados/busca-
-- clientes.ts`) — a restrição de carteira que entrou ali (Entrega da
-- Carteira Siscom) nunca chegou a valer para o fluxo de verdade.
--
-- Pior: as duas funções já tinham uma tentativa de restrição de carteira,
-- só que usando o mecanismo ANTIGO — `clientes.email`, `clientes.executivo`
-- (coluna única, texto livre) e `usuario.nome` (que quase nunca existe,
-- porque nada no app grava `usuario` — ver `src/lib/sessao-servidor.ts`).
-- Um executivo sem linha em `usuario` e sem essas colunas antigas preenchidas
-- não batia em NENHUMA condição — nem nas dele, nem nas de ninguém — e por
-- isso enxergava só clientes cujo `clientes.email` batesse por acaso, na
-- prática nenhum filtro real.
--
-- Esta migration troca essa checagem pela mesma fonte usada em toda a
-- Carteira Siscom: `carteira_executivo` (e-mail → Executivo Linear 360) mais
-- `clientes.executivo_linear_360`/`executivo_digital`, comparados com
-- `normalizar_nome_take` (mesma função já usada aqui, maiúsculas + sem
-- acento) em vez de `upper(trim())` cru.
--
-- Rode no SQL Editor do Supabase depois de schema-entrega-10-carteira-siscom.sql.
-- Idempotente.

create or replace function buscar_marcas(
  termo_busca text,
  limite_busca integer default 20
)
returns table (
  marca_id uuid,
  marca_nome text,
  cliente_id uuid,
  cliente_nome text,
  cnpj text,
  setor text,
  industria text,
  apto_regional boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with contexto as (
    select
      trim(coalesce(termo_busca, '')) as termo,
      lower(trim(coalesce(auth.jwt() ->> 'email', ''))) as email_logado,
      e_proprietario() or tem_perfil('consultor_programa') as pode_ver_toda_carteira
  ),
  executivo_logado as (
    select normalizar_nome_take(ce.executivo_linear_360) as nome
    from carteira_executivo ce
    cross join contexto ctx
    where lower(trim(ce.email)) = ctx.email_logado
  ),
  clientes_visiveis as (
    select c.*
    from clientes c
    cross join contexto ctx
    left join executivo_logado el on true
    where ctx.pode_ver_toda_carteira
       or (
         el.nome is not null
         and (
           normalizar_nome_take(c.executivo_linear_360) = el.nome
           or normalizar_nome_take(c.executivo_digital) = el.nome
         )
       )
  ),
  relacoes_marca as (
    -- Relações do Take somente quando não há uma decisão manual para a marca.
    select distinct
      m.id as marca_id,
      m.nome as marca_nome,
      coalesce(atm.cliente_id_override, at.cliente_id) as cliente_id
    from anunciante_take_marcas atm
    join anunciantes_take at on at.id = atm.anunciante_take_id
    join marcas m on m.id = atm.marca_id
    where coalesce(atm.cliente_id_override, at.cliente_id) is not null
      and not exists (
        select 1
        from marca_cliente_manual mcm
        where mcm.marca_id = m.id
      )

    union all

    -- Vínculo explícito é a fonte de verdade quando existir.
    select
      m.id,
      m.nome,
      mcm.cliente_id
    from marca_cliente_manual mcm
    join marcas m on m.id = mcm.marca_id
  ),
  resultados as (
    select
      null::uuid as marca_id,
      null::text as marca_nome,
      c.id as cliente_id,
      c.nome as cliente_nome,
      c.cnpj,
      c.setor,
      c.industria,
      c.apto_regional,
      0 as prioridade
    from clientes_visiveis c
    cross join contexto ctx
    where ctx.termo = ''
       or c.nome ilike '%' || ctx.termo || '%'

    union all

    select distinct
      rm.marca_id,
      rm.marca_nome,
      c.id,
      c.nome,
      c.cnpj,
      c.setor,
      c.industria,
      c.apto_regional,
      1 as prioridade
    from relacoes_marca rm
    join clientes_visiveis c on c.id = rm.cliente_id
    cross join contexto ctx
    where ctx.termo <> ''
      and (
        rm.marca_nome ilike '%' || ctx.termo || '%'
        or c.nome ilike '%' || ctx.termo || '%'
      )
  )
  select
    r.marca_id,
    r.marca_nome,
    r.cliente_id,
    r.cliente_nome,
    r.cnpj,
    r.setor,
    r.industria,
    r.apto_regional
  from resultados r
  order by
    r.prioridade,
    r.cliente_nome,
    r.marca_nome nulls first
  limit greatest(1, least(coalesce(limite_busca, 20), 50));
$$;

revoke execute on function buscar_marcas(text, integer) from public;
grant execute on function buscar_marcas(text, integer) to authenticated;

create or replace function marcas_do_cliente(p_cliente_id uuid)
returns table (
  marca_id uuid,
  marca_nome text,
  cliente_id uuid,
  cliente_nome text,
  cnpj text,
  setor text,
  industria text,
  apto_regional boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email_logado text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_nome_logado text;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada.';
  end if;

  select normalizar_nome_take(ce.executivo_linear_360)
    into v_nome_logado
  from carteira_executivo ce
  where lower(trim(ce.email)) = v_email_logado;

  if not exists (
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

  return query
  with marcas_relacionadas as (
    -- Vínculos manuais são a fonte de verdade quando existem.
    select mcm.marca_id
    from marca_cliente_manual mcm
    where mcm.cliente_id = p_cliente_id

    union

    -- O Take só participa quando a marca NÃO possui decisão manual. Assim uma
    -- correção administrativa nunca reaparece sob o anunciante automático antigo.
    select atm.marca_id
    from anunciante_take_marcas atm
    join anunciantes_take at on at.id = atm.anunciante_take_id
    where coalesce(atm.cliente_id_override, at.cliente_id) = p_cliente_id
      and not exists (
        select 1
        from marca_cliente_manual mcm
        where mcm.marca_id = atm.marca_id
      )
  )
  select
    m.id::uuid,
    m.nome::text,
    c.id::uuid,
    c.nome::text,
    c.cnpj::text,
    c.setor::text,
    c.industria::text,
    coalesce(c.apto_regional, false)::boolean
  from marcas_relacionadas mr
  join marcas m on m.id = mr.marca_id
  join clientes c on c.id = p_cliente_id
  order by m.nome;
end;
$$;

revoke all on function marcas_do_cliente(uuid) from public;
grant execute on function marcas_do_cliente(uuid) to authenticated;

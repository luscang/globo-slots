-- Globo Slots — segurança: funções SECURITY DEFINER não ficam mais expostas a quem não está logado.
--
-- No Supabase, toda função criada em `public` nasce executável pelo papel `anon`
-- (via PUBLIC e via grant padrão do projeto) — ou seja, chamável sem login por
-- /rest/v1/rpc/<nome>. Os `revoke ... from public` dos schemas anteriores não
-- bastam: `anon` também recebe o grant diretamente. Este arquivo fecha isso.
--
-- O app só chama estas funções com usuário logado (conferido por `.rpc(` em
-- src/lib), e cada uma ainda checa o perfil por dentro. Funções que só rodam por
-- gatilho ou dentro de outra função perdem também o acesso do `authenticated`.
--
-- RODE POR ÚLTIMO, depois de TODOS os outros schema-*.sql: reaplicar qualquer
-- schema que recrie uma função (`create or replace`) pode devolver o acesso ao
-- `anon` — se isso acontecer, rode este arquivo de novo. Idempotente.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    if f.proname in (
      'aprender_marca_ao_importar_acao',
      'preencher_executivo_nome_proposta',
      'registrar_marca_take',
      'rls_auto_enable'
    ) then
      -- Só rodam por gatilho ou dentro de outra função: ninguém precisa chamar pela API.
      execute format('revoke execute on function %s from authenticated', f.assinatura);
    else
      execute format('grant execute on function %s to authenticated', f.assinatura);
    end if;
  end loop;
end $$;

-- Funções de normalização com search_path fixo (alerta function_search_path_mutable).
alter function public.normalizar_nome_take(text) set search_path = public;
alter function public.sincronizar_nome_normalizado_take() set search_path = public;

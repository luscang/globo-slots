-- Globo Slots — regional consome o próprio inventário.
--
-- Bug reportado: proposta regional gerada pelo app (Nova Consulta → Gerar
-- Proposta) nunca gravava nada em `acoes_regionais`. `gravar_consulta`
-- (schema-entrega-3.sql) só insere em `consultas`/`consulta_itens`; quem
-- grava `acoes_regionais` é só `registrarAcaoRegional`
-- (`src/lib/acoes/regional.ts`), chamada exclusivamente pela tela manual de
-- Configurações → Regional (Step 3), um fluxo totalmente separado do wizard
-- de consulta do executivo.
--
-- Consequência: o motor de disponibilidade (`calcularDisponibilidadeDoMes`,
-- R8 e R16) só enxerga ações regionais registradas manualmente ou importadas
-- da API — nunca as vendidas de verdade pelo próprio app. Duas propostas
-- regionais para dias diferentes do mesmo mês (mesmo com
-- `bloqueio_mensal_regional = 1`) passavam direto, porque cada uma via o mês
-- como vazio: a da véspera nunca tinha sido escrita em lugar nenhum que o
-- cálculo de disponibilidade leia. A mesma lacuna também deixava uma praça
-- já vendida por proposta aparecer livre para OUTRO cliente (R8).
--
-- Fix: ao gravar uma consulta regional, gravar também uma linha por praça em
-- `acoes_regionais` (origem 'proposta') — na mesma transação de
-- `gravar_consulta`, para nunca existir uma consulta sem o inventário
-- correspondente reservado. Como `gravar_consulta` roda `security invoker`
-- (a policy de `consultas`/`consulta_itens` é a proteção real, de propósito
-- — ver o comentário em schema-entrega-3.sql) e a policy de ESCRITA de
-- `acoes_regionais` é "só consultor/proprietário do programa", o executivo
-- comum não teria privilégio para esse insert. Por isso a reserva do
-- inventário é uma função `security definer` À PARTE, chamada pelo app logo
-- depois de `gravar_consulta` suceder — não de dentro dela, para não mudar o
-- modo de segurança de uma função já revisada e comentada.
--
-- Superfície de risco do `security definer` (ver `Errors and fixes` desta
-- entrega): a função não aceita data/praça/cliente como parâmetro algum —
-- ela RELÊ `consultas`/`consulta_itens` pelo `p_consulta_id` e confere
-- `usuario_id = auth.uid()`. Um usuário autenticado só consegue "forçar" a
-- reserva de praças que já pertencem a uma consulta que ele mesmo gravou
-- (e que já passou pelas validações de `gravarConsulta`/`validarConsulta`
-- para existir) — nunca de praças arbitrárias de outro programa/cliente. A
-- unicidade `(programa_id, data_de_exibicao, praca_codigo)` da tabela cuida
-- do resto: uma segunda tentativa de reservar a mesma praça (deste ou de
-- outro cliente) sempre falha.
--
-- Rode no SQL Editor do Supabase. Idempotente.

alter table acoes_regionais
  drop constraint if exists acoes_regionais_origem_check;
alter table acoes_regionais
  add constraint acoes_regionais_origem_check
  check (origem in ('manual', 'sugerido_api', 'proposta'));

create or replace function registrar_pracas_da_consulta_regional(p_consulta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consulta record;
begin
  select id, usuario_id, cliente_id, cliente_nome, programa_id, modalidade
    into v_consulta
    from consultas
   where id = p_consulta_id;

  if not found then
    raise exception 'Consulta não encontrada.';
  end if;

  if v_consulta.usuario_id is distinct from auth.uid() then
    raise exception 'Esta consulta não pertence ao usuário autenticado.';
  end if;

  if v_consulta.modalidade is distinct from 'regional' then
    raise exception 'Esta consulta não é regional.';
  end if;

  insert into acoes_regionais (
    programa_id, data_de_exibicao, cliente_id, cliente_nome, praca_codigo, origem
  )
  select
    v_consulta.programa_id,
    ci.data,
    v_consulta.cliente_id,
    v_consulta.cliente_nome,
    praca,
    'proposta'
  from consulta_itens ci
  cross join lateral unnest(ci.pracas) as praca
  where ci.consulta_id = p_consulta_id;
end;
$$;

revoke all on function registrar_pracas_da_consulta_regional(uuid) from public;
grant execute on function registrar_pracas_da_consulta_regional(uuid) to authenticated;

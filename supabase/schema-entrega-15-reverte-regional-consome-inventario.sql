-- Globo Slots — reverte schema-entrega-14-regional-consome-inventario.sql.
--
-- Entendimento errado na entrega anterior: tratar "proposta regional gerada
-- pelo executivo" como "praça vendida" e reservar `acoes_regionais` nesse
-- momento. Não é isso — proposta é uma cotação, não uma venda confirmada.
-- Reservar inventário ali bloquearia OUTROS clientes por causa de uma
-- proposta que pode nem virar negócio, o que a área não quer.
--
-- O que de fato deve bloquear (R8) continua sendo só a ação REALMENTE
-- vendida: importada da API do Globo Take ou registrada manualmente em
-- Configurações → Regional (`registrarAcaoRegional`,
-- `src/lib/acoes/regional.ts`) — nunca a geração de proposta.
--
-- O que precisava de correção de verdade era outra coisa (ver
-- `src/lib/acoes/propostas.ts`, `validarLimiteMensal`): a MESMA consulta
-- não pode reunir mais de um dia do mês para o mesmo cliente — R16,
-- Bloqueio mensal regional. Isso já foi corrigido sem precisar gravar nada
-- em `acoes_regionais`, então a função criada na entrega anterior fica sem
-- uso; esta migração remove ela e desfaz a alteração de schema que só
-- existia para servi-la.
--
-- Rode no SQL Editor do Supabase depois de
-- schema-entrega-14-regional-consome-inventario.sql. Idempotente.
--
-- Remove primeiro as linhas com origem = 'proposta' que a função chegou a
-- gravar em produção durante o teste — são exatamente as reservas indevidas
-- que esta migração está desfazendo, nunca uma venda de fato. Sem apagá-las
-- antes, a constraint nova abaixo rejeita a alteração (violação por linha
-- já existente).

drop function if exists registrar_pracas_da_consulta_regional(uuid);

delete from acoes_regionais where origem = 'proposta';

alter table acoes_regionais
  drop constraint if exists acoes_regionais_origem_check;
alter table acoes_regionais
  add constraint acoes_regionais_origem_check
  check (origem in ('manual', 'sugerido_api'));

-- Globo Slots — Modelo de proposta separado por modalidade (nacional/regional).
--
-- Antes desta migration, `programa_modelo_slides` guardava um único conjunto
-- de slides por programa, usado tanto para propostas nacionais quanto
-- regionais. Esta migration acrescenta a coluna `modalidade`: todo slide já
-- cadastrado vira 'nacional' (o comportamento que já existia), e passa a ser
-- possível cadastrar um segundo conjunto completo para 'regional'.
--
-- Rode no SQL Editor do Supabase depois de schema-entrega-4-modelo-proposta.sql
-- e schema-entrega-4-modelo-proposta-secoes.sql. Idempotente.

alter table programa_modelo_slides
  add column if not exists modalidade text not null default 'nacional'
    check (modalidade in ('nacional', 'regional'));

drop index if exists programa_modelo_slides_capa_unica_idx;
create unique index if not exists programa_modelo_slides_capa_unica_idx
  on programa_modelo_slides (programa_id, modalidade)
  where secao = 'capa';

drop index if exists programa_modelo_slides_valor_unico_idx;
create unique index if not exists programa_modelo_slides_valor_unico_idx
  on programa_modelo_slides (programa_id, modalidade)
  where secao = 'valor';

drop index if exists programa_modelo_slides_contracapa_unica_idx;
create unique index if not exists programa_modelo_slides_contracapa_unica_idx
  on programa_modelo_slides (programa_id, modalidade)
  where secao = 'contracapa';

drop index if exists programa_modelo_slides_programa_secao_ordem_idx;
create index if not exists programa_modelo_slides_programa_secao_ordem_idx
  on programa_modelo_slides (programa_id, modalidade, secao, ordem, criado_em);

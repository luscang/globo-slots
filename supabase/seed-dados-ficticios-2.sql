-- Globo Slots — DADOS FICTÍCIOS, parte 2 (não depende de nenhum usuário).
-- Rode depois de seed-dados-ficticios.sql. Mesmas convenções: "[TESTE]", TST*,
-- TESTE-xxxx, @exemplo.test. Apagado por limpar-dados-ficticios.sql.
-- Idempotente.

-- 1. Programa com teto mensal curto (testa o limite mensal por anunciante, R16) ---
insert into programas (
  nome, mnemonico, canal, estado, dias_da_semana, slots, bloqueio_mensal,
  acoes_minimas, acoes_maximas, custo_midia_tv, custo_producao_tv,
  prazo_minimo_dias, disponivel_para_proposta, aceita_regional, max_pracas_por_acao
) values
  ('[TESTE] Mensal Curto', 'TST5', 'Globo', 'ativo', '{1,2,3,4,5}', 2, 2,
   1, 2, 60000, 4000, 2, true, false, 3)
on conflict (mnemonico) do nothing;

-- Imagem dos programas (http(s) é exigido pela aplicação; usa o próprio app local).
update programas
set imagem_url = 'http://localhost:3010/brand/logo-globo-slots.png'
where mnemonico like 'TST%' and imagem_url is null;

-- Apelido: programa que chega do Take sem mnemônico (R6).
insert into programa_apelidos (programa_id, texto)
select p.id, 'BOM DIA TESTE' from programas p where p.mnemonico = 'TST1'
on conflict (texto) do nothing;

-- 2. Ocupação: Alfa Bebidas esgota o teto mensal (2) em TST5 ------------------
-- Alfa não poderá mais comprar TST5 neste mês; os demais clientes ainda podem.
insert into acoes_vendidas (
  numero_da_entrega, programa, data_de_exibicao, anunciante, marca,
  formato, tipo_da_entrega, status_aprovacao
) values
  ('TESTE-0011', 'TST5', current_date + 1, '[TESTE] Alfa Bebidas Ltda', '[TESTE] Alfa Cola', 'AÇÃO PLENA', 'Venda', 'Aprovada'),
  ('TESTE-0012', 'TST5', current_date + 4, '[TESTE] Alfa Bebidas Ltda', '[TESTE] Alfa Zero', 'AÇÃO PLENA', 'Venda', 'Aprovada'),
  -- Dia cheio em TST5 (2 slots): dois anunciantes diferentes na mesma data.
  ('TESTE-0013', 'TST5', current_date + 7, '[TESTE] Delta Seguros',  '[TESTE] Delta Vida',  'AÇÃO PLENA', 'Venda', 'Aprovada'),
  ('TESTE-0014', 'TST5', current_date + 7, '[TESTE] Kappa Educação', '[TESTE] Kappa Online', 'AÇÃO PLENA', 'Venda', 'Aprovada'),
  -- Mais ocupação no TST1 para o calendário ter dias livres, parciais e cheios.
  ('TESTE-0015', 'TST1', current_date + 6, '[TESTE] Eta Cosméticos',  '[TESTE] Eta Glow',  'AÇÃO PLENA', 'Venda', 'Aprovada'),
  ('TESTE-0016', 'TST1', current_date + 6, '[TESTE] Iota Viagens',    '[TESTE] Iota Voos', 'AÇÃO PLENA', 'Venda', 'Aprovada'),
  ('TESTE-0017', 'TST1', current_date + 8, '[TESTE] Beta Refrescos S.A.', '[TESTE] Beta Guaraná', 'AÇÃO PLENA', 'Venda', 'Aprovada'),
  -- Anunciante que NÃO está na carteira: gera aviso "não casou com a carteira"
  -- e fica como pendente em Marcas e anunciantes.
  ('TESTE-0018', 'TST3', current_date + 14, '[TESTE] Anunciante Sem Carteira', '[TESTE] Marca Órfã', 'AÇÃO PLENA', 'Venda', 'Aprovada'),
  -- Formato sem categoria cadastrada: conta como Ação de Conteúdo e a importação avisa.
  ('TESTE-0019', 'TST3', current_date + 16, '[TESTE] Teta Energia', '[TESTE] Teta Luz', 'FORMATO-TESTE-NOVO', 'Venda', 'Aprovada')
on conflict (numero_da_entrega) do nothing;

-- 3. Governança de marcas ------------------------------------------------------
-- Uma marca cadastrada pelo executivo (pendente de revisão) e uma já revisada.
insert into marcas (nome, nome_normalizado)
values
  ('[TESTE] Marca Manual Pendente', normalizar_nome_take('[TESTE] Marca Manual Pendente')),
  ('[TESTE] Marca Manual Revisada', normalizar_nome_take('[TESTE] Marca Manual Revisada'))
on conflict (nome_normalizado) do nothing;

insert into marca_cliente_manual (marca_id, cliente_id, origem, revisao_status, revisado_em)
select m.id, c.id, 'consulta', 'pendente', null
from marcas m, clientes c
where m.nome = '[TESTE] Marca Manual Pendente' and c.nome = '[TESTE] Delta Seguros'
on conflict (marca_id, cliente_id) do nothing;

insert into marca_cliente_manual (marca_id, cliente_id, origem, revisao_status, revisado_em)
select m.id, c.id, 'administracao', 'revisada', now()
from marcas m, clientes c
where m.nome = '[TESTE] Marca Manual Revisada' and c.nome = '[TESTE] Gama Automóveis'
on conflict (marca_id, cliente_id) do nothing;

-- 4. Modelo de proposta (slides) para TST1 — nacional e regional ----------------
insert into programa_modelo_slides (programa_id, imagem_url, secao, ordem, modalidade)
select p.id, 'http://localhost:3010/brand/logo-globo-slots.png', v.secao, v.ordem, v.modalidade
from programas p
cross join (values
  ('capa', 1, 'nacional'), ('conteudo', 1, 'nacional'), ('conteudo', 2, 'nacional'),
  ('valor', 1, 'nacional'), ('contracapa', 1, 'nacional')
) as v(secao, ordem, modalidade)
where p.mnemonico = 'TST1'
  and not exists (
    select 1 from programa_modelo_slides s
    where s.programa_id = p.id and s.secao = v.secao and s.ordem = v.ordem and s.modalidade = v.modalidade
  );

insert into programa_modelo_slides (programa_id, imagem_url, secao, ordem, modalidade)
select p.id, 'http://localhost:3010/brand/logo-globo-slots.png', v.secao, v.ordem, 'regional'
from programas p
cross join (values ('capa', 1), ('conteudo', 1), ('valor', 1), ('contracapa', 1)) as v(secao, ordem)
where p.mnemonico = 'TST2'
  and not exists (
    select 1 from programa_modelo_slides s
    where s.programa_id = p.id and s.secao = v.secao and s.ordem = v.ordem and s.modalidade = 'regional'
  );

-- 5. Solicitações de acesso pendentes (tela Perfis e acessos) --------------------
insert into solicitacao_de_acesso (nome, email, perfil_solicitado)
select v.nome, v.email, v.perfil
from (values
  ('[TESTE] Pessoa Um',   'pessoa1@exemplo.test', 'executivo'),
  ('[TESTE] Pessoa Dois', 'pessoa2@exemplo.test', 'executivo_regional'),
  ('[TESTE] Pessoa Três', 'pessoa3@exemplo.test', 'consultor_programa')
) as v(nome, email, perfil)
where not exists (
  select 1 from solicitacao_de_acesso s where lower(s.email) = v.email and s.status = 'pendente'
);

-- 6. Ações regionais extras: Eta compra BH no sábado seguinte (TST2) -------------
insert into acoes_regionais (programa_id, data_de_exibicao, cliente_id, cliente_nome, praca_codigo, origem)
select p.id,
       current_date + ((6 - extract(dow from current_date)::int + 7) % 7) + 21,
       c.id, c.nome, 'BH', 'manual'
from programas p
join clientes c on c.nome = '[TESTE] Eta Cosméticos'
where p.mnemonico = 'TST2'
on conflict (programa_id, data_de_exibicao, praca_codigo) do nothing;

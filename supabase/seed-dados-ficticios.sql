-- Globo Slots — DADOS FICTÍCIOS para teste. Nada aqui é real.
--
-- Tudo é marcado para ser inconfundível e removível:
--   * nomes começam com "[TESTE]"; mnemônicos de programa são TST1..TST4;
--   * CNPJs são inválidos de propósito (00.000.0xx/0001-xx);
--   * e-mails são @exemplo.test; números de entrega são TESTE-xxxx.
-- Para apagar tudo: supabase/limpar-dados-ficticios.sql.
--
-- Datas são relativas a hoje (current_date), para a disponibilidade sempre ter
-- o que mostrar. Idempotente: pode ser rodado de novo sem duplicar.
--
-- Não cria contas nem oportunidades: ambas dependem de um usuário real em
-- auth.users (oportunidades.criado_por).

-- 1. Programas ---------------------------------------------------------------
insert into programas (
  nome, mnemonico, canal, estado, dias_da_semana, slots, bloqueio_mensal,
  acoes_minimas, acoes_maximas, custo_midia_tv, custo_producao_tv,
  custo_midia_digital, custo_producao_digital, prazo_minimo_dias, percentual_simulcast,
  disponivel_para_proposta, aceita_regional, dia_da_semana_regional,
  prazo_minimo_regional_dias, max_pracas_por_acao, bloqueio_mensal_regional,
  custo_producao_regional, possui_fluxo_aprovacao, contem_digital, redes_sociais
) values
  ('[TESTE] Bom Dia Fictício', 'TST1', 'Globo', 'ativo', '{1,2,3,4,5}', 2, 8,
   1, 4, 120000, 8000, 30000, 3000, 3, 10,
   true, false, null, null, 3, null, null, false, true, true),
  ('[TESTE] Sábado Show', 'TST2', 'Globo', 'ativo', '{6}', 1, 2,
   1, 2, 376000, 8300, null, null, 7, null,
   true, true, 6, 7, 3, 1, 7900, true, false, false),
  ('[TESTE] Tarde Fictícia', 'TST3', 'Globo', 'ativo', '{1,3,5}', 3, 12,
   1, 6, 90000, 6000, 20000, 2500, 5, 15,
   true, false, null, null, 3, null, null, false, true, false),
  ('[TESTE] Noite em Construção', 'TST4', 'Globo', 'em_configuracao', '{4}', 1, 0,
   1, 1, null, null, null, null, 10, null,
   false, false, null, null, 3, null, null, false, false, false)
on conflict (mnemonico) do nothing;

-- Preço por praça do programa regional (TST2).
insert into preco_regional (programa_id, praca_codigo, custo_midia_tv)
select p.id, v.praca, v.valor
from programas p
cross join (values ('SP', 49000), ('RJ', 41000), ('BH', 30000), ('DF', 28000), ('PE1', 22000))
  as v(praca, valor)
where p.mnemonico = 'TST2'
on conflict (programa_id, praca_codigo) do nothing;

-- 2. Clientes fictícios (carteira) -------------------------------------------
-- Alfa e Beta compartilham setor + indústria: servem para testar concorrência.
insert into clientes (
  nome, cnpj, cod_siscom, setor, industria, head_setor, gerente_industria,
  executivo_linear_360, executivo_digital, apto_regional, segmentacao_se
)
select v.* from (values
  ('[TESTE] Alfa Bebidas Ltda',      '00.000.001/0001-01', 'T0001', 'Bebidas',   'Refrigerantes', 'Head Teste A', 'Gerente Teste A', 'Executivo Teste Um',   'Executivo Teste Um',   false, null),
  ('[TESTE] Beta Refrescos S.A.',    '00.000.002/0001-02', 'T0002', 'Bebidas',   'Refrigerantes', 'Head Teste A', 'Gerente Teste A', 'Executivo Teste Um',   null,                   false, null),
  ('[TESTE] Gama Automóveis',        '00.000.003/0001-03', 'T0003', 'Automotivo','Veículos',      'Head Teste B', 'Gerente Teste B', 'Executivo Teste Um',   'Executivo Teste Dois', false, null),
  ('[TESTE] Delta Seguros',          '00.000.004/0001-04', 'T0004', 'Financeiro','Seguros',       'Head Teste C', 'Gerente Teste C', 'Executivo Teste Dois', null,                   false, null),
  ('[TESTE] Épsilon Telecom',        '00.000.005/0001-05', 'T0005', 'Telecom',   'Operadoras',    'Head Teste D', 'Gerente Teste D', 'Executivo Teste Dois', 'Executivo Teste Dois', false, 'SE-TESTE'),
  ('[TESTE] Zeta Supermercados',     '00.000.006/0001-06', 'T0006', 'Varejo',    'Supermercados', 'Head Teste E', 'Gerente Teste E', 'Executivo Teste Um',   null,                   true,  null),
  ('[TESTE] Eta Cosméticos',         '00.000.007/0001-07', 'T0007', 'Beleza',    'Cosméticos',    'Head Teste F', 'Gerente Teste F', 'Executivo Teste Dois', 'Executivo Teste Um',   true,  null),
  ('[TESTE] Teta Energia',           '00.000.008/0001-08', 'T0008', 'Energia',   'Distribuidoras','Head Teste G', 'Gerente Teste G', 'Executivo Teste Um',   null,                   false, null),
  ('[TESTE] Iota Viagens',           '00.000.009/0001-09', 'T0009', 'Turismo',   'Aéreas',        'Head Teste H', 'Gerente Teste H', 'Executivo Teste Dois', null,                   true,  null),
  ('[TESTE] Kappa Educação',         '00.000.010/0001-10', 'T0010', 'Educação',  'Ensino superior','Head Teste I','Gerente Teste I', 'Executivo Teste Um',   null,                   false, null)
) as v(nome, cnpj, cod_siscom, setor, industria, head_setor, gerente_industria,
       executivo_linear_360, executivo_digital, apto_regional, segmentacao_se)
where not exists (select 1 from clientes c where c.nome = v.nome);

-- Quem é cada executivo (e-mail fictício -> nome usado na Carteira Siscom).
insert into carteira_executivo (executivo_linear_360, email, nome_salesforce)
values
  ('Executivo Teste Um',   'exec1@exemplo.test', 'EXECUTIVO TESTE UM'),
  ('Executivo Teste Dois', 'exec2@exemplo.test', 'EXECUTIVO TESTE DOIS')
on conflict (email) do nothing;

-- 3. Ações vendidas (o que ocupa a disponibilidade) --------------------------
-- O gatilho de acoes_vendidas aprende marcas/anunciantes e casa com a carteira.
insert into acoes_vendidas (
  numero_da_entrega, programa, data_de_exibicao, anunciante, marca,
  formato, tipo_da_entrega, status_aprovacao
) values
  ('TESTE-0001', 'TST1', current_date + 2,  '[TESTE] Alfa Bebidas Ltda',  '[TESTE] Alfa Cola',    'AÇÃO PLENA',     'Venda', 'Aprovada'),
  ('TESTE-0002', 'TST1', current_date + 2,  '[TESTE] Gama Automóveis',    '[TESTE] Gama SUV',     'AÇÃO PLENA',     'Venda', 'Aprovada'),
  ('TESTE-0003', 'TST1', current_date + 5,  '[TESTE] Delta Seguros',      '[TESTE] Delta Vida',   'AÇÃO PLENA',     'Venda', 'Aprovada'),
  ('TESTE-0004', 'TST1', current_date + 9,  '[TESTE] Épsilon Telecom',   '[TESTE] Épsilon 5G',   'AÇÃO PLENA',     'Venda', 'Aprovada'),
  ('TESTE-0005', 'TST1', current_date + 12, '[TESTE] Zeta Supermercados', '[TESTE] Zeta Fresh',   'COMERCIAL BREAK','Venda', 'Aprovada'),
  ('TESTE-0006', 'TST3', current_date + 3,  '[TESTE] Eta Cosméticos',     '[TESTE] Eta Glow',     'AÇÃO PLENA',     'Venda', 'Aprovada'),
  ('TESTE-0007', 'TST3', current_date + 3,  '[TESTE] Teta Energia',       '[TESTE] Teta Luz',     'AÇÃO PLENA',     'Venda', 'Aprovada'),
  ('TESTE-0008', 'TST3', current_date + 3,  '[TESTE] Iota Viagens',       '[TESTE] Iota Voos',    'AÇÃO PLENA',     'Venda', 'Aprovada'),
  ('TESTE-0009', 'TST3', current_date + 10, '[TESTE] Kappa Educação',     '[TESTE] Kappa Online', 'AÇÃO PLENA',     'Venda', 'Aprovada'),
  ('TESTE-0010', 'TST2', current_date + 20, '[TESTE] Zeta Supermercados', '[TESTE] Zeta Fresh',   'AÇÃO PLENA',     'Venda', 'Aprovada')
on conflict (numero_da_entrega) do nothing;

-- 4. Bloqueios, período especial e restrição ---------------------------------
insert into datas_bloqueadas (programa_id, data, motivo)
select p.id, current_date + 15, '[TESTE] Data bloqueada fictícia'
from programas p where p.mnemonico = 'TST1'
on conflict (programa_id, data) do nothing;

insert into datas_especiais (programa_id, nome, data_inicio, data_fim, percentual_acrescimo, texto_investimento)
select p.id, '[TESTE] Período especial fictício', current_date + 30, current_date + 37, 20,
       'Texto de investimento fictício para teste.'
from programas p
where p.mnemonico = 'TST1'
  and not exists (
    select 1 from datas_especiais d where d.programa_id = p.id and d.nome = '[TESTE] Período especial fictício'
  );

insert into restricoes_anunciante (programa_id, anunciante, motivo)
select p.id, '[TESTE] Beta Refrescos S.A.', '[TESTE] Exclusividade fictícia'
from programas p
where p.mnemonico = 'TST1'
  and not exists (
    select 1 from restricoes_anunciante r where r.programa_id = p.id and r.anunciante = '[TESTE] Beta Refrescos S.A.'
  );

-- 5. Ação regional já vendida no próximo sábado livre (TST2, praças SP e RJ) --
insert into acoes_regionais (programa_id, data_de_exibicao, cliente_id, cliente_nome, praca_codigo, origem)
select p.id,
       current_date + ((6 - extract(dow from current_date)::int + 7) % 7) + 14,
       c.id, c.nome, v.praca, 'manual'
from programas p
join clientes c on c.nome = '[TESTE] Zeta Supermercados'
cross join (values ('SP'), ('RJ')) as v(praca)
where p.mnemonico = 'TST2'
on conflict (programa_id, data_de_exibicao, praca_codigo) do nothing;

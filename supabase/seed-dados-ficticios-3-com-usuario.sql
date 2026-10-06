-- Globo Slots — DADOS FICTÍCIOS, parte 3: oportunidades, consultas e propostas.
--
-- Estas tabelas pertencem a um usuário (oportunidades.criado_por,
-- consultas.usuario_id, propostas.usuario_id referenciam auth.users), por isso
-- este arquivo só faz algo DEPOIS que existir ao menos uma conta no Supabase
-- Auth. Ele usa o primeiro Proprietário; se não houver, a primeira conta. Sem
-- nenhuma conta, não grava nada e avisa. Idempotente.
--
-- Rode depois de seed-dados-ficticios.sql e seed-dados-ficticios-2.sql.

do $$
declare
  v_usuario uuid;
  v_nome text;
  v_tst1 uuid; v_tst2 uuid; v_tst3 uuid;
  v_cat_datas uuid; v_cat_talento uuid; v_cat_sazonais uuid;
  v_fmt_conteudo uuid; v_fmt_plena uuid; v_fmt_talento uuid; v_fmt_intervalo uuid;
  v_cli_alfa uuid; v_cli_zeta uuid; v_cli_eta uuid; v_cli_gama uuid;
  v_consulta uuid;
begin
  select pu.usuario_id into v_usuario
  from perfil_usuario pu where pu.perfil = 'proprietario' order by pu.usuario_id limit 1;
  if v_usuario is null then
    select id into v_usuario from auth.users order by created_at limit 1;
  end if;
  if v_usuario is null then
    raise notice 'Nenhuma conta em auth.users: crie um usuário e rode este arquivo de novo.';
    return;
  end if;

  select coalesce(u.nome, au.email, 'Usuário de teste') into v_nome
  from auth.users au left join usuario u on u.usuario_id = au.id where au.id = v_usuario;
  insert into usuario (usuario_id, nome) values (v_usuario, v_nome) on conflict (usuario_id) do nothing;

  select id into v_tst1 from programas where mnemonico = 'TST1';
  select id into v_tst2 from programas where mnemonico = 'TST2';
  select id into v_tst3 from programas where mnemonico = 'TST3';
  select id into v_cat_datas    from oportunidade_categorias where slug = 'datas-comemorativas';
  select id into v_cat_talento  from oportunidade_categorias where slug = 'talento';
  select id into v_cat_sazonais from oportunidade_categorias where slug = 'sazonais';
  select id into v_fmt_conteudo  from oportunidade_formatos where slug = 'acao-no-conteudo';
  select id into v_fmt_plena     from oportunidade_formatos where slug = 'acao-plena';
  select id into v_fmt_talento   from oportunidade_formatos where slug = 'participacao-de-talento';
  select id into v_fmt_intervalo from oportunidade_formatos where slug = 'intervalo-comercial';
  select id into v_cli_alfa from clientes where nome = '[TESTE] Alfa Bebidas Ltda';
  select id into v_cli_zeta from clientes where nome = '[TESTE] Zeta Supermercados';
  select id into v_cli_eta  from clientes where nome = '[TESTE] Eta Cosméticos';
  select id into v_cli_gama from clientes where nome = '[TESTE] Gama Automóveis';

  if v_tst1 is null or v_cli_alfa is null then
    raise notice 'Rode antes seed-dados-ficticios.sql e seed-dados-ficticios-2.sql.';
    return;
  end if;

  -- 1. Oportunidades (calendário e vitrine) --------------------------------------
  insert into oportunidades (
    programa_id, categoria_id, formato_id, tipo_exibicao, data_evento, data_inicio, data_fim,
    expira_em, prazo_envio_pi, sigla, valor_acao, direitos_conexos, custo_producao_tipo,
    custo_producao, titulo, descricao, imagem_url, criado_por, criado_por_nome, ativo
  )
  select v.* from (values
    (v_tst1, v_cat_datas,   v_fmt_plena,     'data_unica', current_date + 3,  null::date, null::date, current_date + 2,  current_date + 1,  'DDC', 95000::numeric, 9500::numeric,  'valor',        8000::numeric, '[TESTE] Dia do Cliente',          'Ação especial fictícia para o Dia do Cliente, com chamada e merchandising no programa.', 'http://localhost:3010/brand/logo-globo-slots.png', v_usuario, v_nome, true),
    (v_tst1, v_cat_talento, v_fmt_talento,   'data_unica', current_date + 6,  null,       null,       current_date + 5,  current_date + 4,  'TAL', 120000,         12000,         'sob_consulta', null,          '[TESTE] Participação de apresentador', 'Participação fictícia de apresentador em quadro patrocinado.',                              'http://localhost:3010/brand/logo-globo-slots.png', v_usuario, v_nome, true),
    (v_tst3, v_cat_sazonais,v_fmt_conteudo,  'periodo',    null,              current_date + 10, current_date + 17, current_date + 9,  current_date + 8,  'SAZ', 70000,          7000,          'valor',        5000,          '[TESTE] Semana sazonal fictícia',      'Período sazonal fictício com ações no conteúdo durante uma semana.',                       'http://localhost:3010/brand/logo-globo-slots.png', v_usuario, v_nome, true),
    (v_tst2, v_cat_datas,   v_fmt_plena,     'data_unica', current_date + 20, null,       null,       current_date + 19, current_date + 18, 'REG', 150000,         15000,         'valor',        7900,          '[TESTE] Especial regional de sábado',  'Oportunidade fictícia regional para o Sábado Show.',                                      'http://localhost:3010/brand/logo-globo-slots.png', v_usuario, v_nome, true),
    (v_tst3, v_cat_datas,   v_fmt_intervalo, 'data_unica', current_date + 25, null,       null,       current_date + 24, null,              'INT', 60000,          6000,          'valor',        3000,          '[TESTE] Intervalo comercial especial', 'Intervalo comercial fictício com posição diferenciada.',                                  'http://localhost:3010/brand/logo-globo-slots.png', v_usuario, v_nome, true),
    -- Já expirada: não deve aparecer na vitrine.
    (v_tst1, v_cat_datas,   v_fmt_conteudo,  'data_unica', current_date - 3,  null,       null,       current_date - 4,  null,              'EXP', 50000,          5000,          'valor',        2000,          '[TESTE] Oportunidade expirada',        'Fictícia e já expirada: não deve aparecer na vitrine.',                                    'http://localhost:3010/brand/logo-globo-slots.png', v_usuario, v_nome, true),
    -- Inativa: também não aparece.
    (v_tst1, v_cat_sazonais,v_fmt_conteudo,  'data_unica', current_date + 12, null,       null,       current_date + 11, null,              'OFF', 40000,          4000,          'valor',        2000,          '[TESTE] Oportunidade inativa',         'Fictícia e desativada: não deve aparecer na vitrine.',                                     'http://localhost:3010/brand/logo-globo-slots.png', v_usuario, v_nome, false)
  ) as v(programa_id, categoria_id, formato_id, tipo_exibicao, data_evento, data_inicio, data_fim,
         expira_em, prazo_envio_pi, sigla, valor_acao, direitos_conexos, custo_producao_tipo,
         custo_producao, titulo, descricao, imagem_url, criado_por, criado_por_nome, ativo)
  where not exists (select 1 from oportunidades o where o.titulo = v.titulo);

  -- 2. Consultas + propostas em estados diferentes -------------------------------
  -- Cada bloco só roda se a consulta de teste ainda não existir.

  -- A) Nacional, em negociação, sem aprovação (TST1, Alfa Bebidas).
  if not exists (select 1 from propostas where produto = '[TESTE] Produto A') then
    insert into consultas (usuario_id, cliente_id, cliente_nome, cliente_setor, cliente_industria,
                           programa_id, programa_nome, modalidade, valor_total)
    values (v_usuario, v_cli_alfa, '[TESTE] Alfa Bebidas Ltda', 'Bebidas', 'Refrigerantes',
            v_tst1, '[TESTE] Bom Dia Fictício', 'nacional', 240000) returning id into v_consulta;
    insert into consulta_itens (consulta_id, data, quantidade, valor_unitario, valor_total)
    values (v_consulta, current_date + 18, 1, 120000, 120000),
           (v_consulta, current_date + 19, 1, 120000, 120000);
    insert into propostas (consulta_id, usuario_id, cliente_id, cliente_nome, programa_id, programa_nome,
                           modalidade, valor_midia_tv, valor_total_comercial, valor_producao,
                           valor_direitos_tv, valor_direitos_total, valor_total_geral, status,
                           produto, objetivo, negociacao_status, executivo_nome)
    values (v_consulta, v_usuario, v_cli_alfa, '[TESTE] Alfa Bebidas Ltda', v_tst1, '[TESTE] Bom Dia Fictício',
            'nacional', 240000, 240000, 16000, 36000, 36000, 292000, 'gerada',
            '[TESTE] Produto A', 'Objetivo fictício A: lançamento de campanha.', 'em_negociacao', v_nome);
  end if;

  -- B) Regional aguardando APROVAÇÃO (TST2 tem fluxo de aprovação; Zeta).
  if not exists (select 1 from propostas where produto = '[TESTE] Produto B') then
    insert into consultas (usuario_id, cliente_id, cliente_nome, cliente_setor, cliente_industria,
                           programa_id, programa_nome, modalidade, valor_total)
    values (v_usuario, v_cli_zeta, '[TESTE] Zeta Supermercados', 'Varejo', 'Supermercados',
            v_tst2, '[TESTE] Sábado Show', 'regional', 90000) returning id into v_consulta;
    insert into consulta_itens (consulta_id, data, quantidade, pracas, valor_unitario, valor_total)
    values (v_consulta, current_date + ((6 - extract(dow from current_date)::int + 7) % 7) + 28,
            1, '{BH,DF}', 45000, 90000);
    insert into propostas (consulta_id, usuario_id, cliente_id, cliente_nome, programa_id, programa_nome,
                           modalidade, valor_midia_tv, valor_total_comercial, valor_producao,
                           valor_direitos_tv, valor_direitos_total, valor_total_geral, status,
                           produto, objetivo, negociacao_status, aprovacao_status,
                           aprovacao_solicitada_em, executivo_nome)
    values (v_consulta, v_usuario, v_cli_zeta, '[TESTE] Zeta Supermercados', v_tst2, '[TESTE] Sábado Show',
            'regional', 90000, 90000, 7900, 9000, 9000, 106900, 'gerada',
            '[TESTE] Produto B', 'Objetivo fictício B: ação regional em BH e DF.', 'em_negociacao', 'pendente',
            now(), v_nome);
  end if;

  -- C) FECHADA (TST3, Eta).
  if not exists (select 1 from propostas where produto = '[TESTE] Produto C') then
    insert into consultas (usuario_id, cliente_id, cliente_nome, cliente_setor, cliente_industria,
                           programa_id, programa_nome, modalidade, valor_total)
    values (v_usuario, v_cli_eta, '[TESTE] Eta Cosméticos', 'Beleza', 'Cosméticos',
            v_tst3, '[TESTE] Tarde Fictícia', 'nacional', 90000) returning id into v_consulta;
    insert into consulta_itens (consulta_id, data, quantidade, valor_unitario, valor_total)
    values (v_consulta, current_date + 22, 1, 90000, 90000);
    insert into propostas (consulta_id, usuario_id, cliente_id, cliente_nome, programa_id, programa_nome,
                           modalidade, valor_midia_tv, valor_total_comercial, valor_producao,
                           valor_direitos_tv, valor_direitos_total, valor_total_geral, status,
                           produto, objetivo, negociacao_status, valor_final_negociado, data_fechamento,
                           executivo_nome)
    values (v_consulta, v_usuario, v_cli_eta, '[TESTE] Eta Cosméticos', v_tst3, '[TESTE] Tarde Fictícia',
            'nacional', 90000, 90000, 6000, 13500, 13500, 109500, 'gerada',
            '[TESTE] Produto C', 'Objetivo fictício C: visibilidade de marca.', 'fechada', 100000, current_date - 1,
            v_nome);
  end if;

  -- D) PERDIDA (TST1, Gama).
  if not exists (select 1 from propostas where produto = '[TESTE] Produto D') then
    insert into consultas (usuario_id, cliente_id, cliente_nome, cliente_setor, cliente_industria,
                           programa_id, programa_nome, modalidade, valor_total)
    values (v_usuario, v_cli_gama, '[TESTE] Gama Automóveis', 'Automotivo', 'Veículos',
            v_tst1, '[TESTE] Bom Dia Fictício', 'nacional', 120000) returning id into v_consulta;
    insert into consulta_itens (consulta_id, data, quantidade, valor_unitario, valor_total)
    values (v_consulta, current_date + 24, 1, 120000, 120000);
    insert into propostas (consulta_id, usuario_id, cliente_id, cliente_nome, programa_id, programa_nome,
                           modalidade, valor_midia_tv, valor_total_comercial, valor_producao,
                           valor_direitos_tv, valor_direitos_total, valor_total_geral, status,
                           produto, objetivo, negociacao_status, motivo_perda, executivo_nome)
    values (v_consulta, v_usuario, v_cli_gama, '[TESTE] Gama Automóveis', v_tst1, '[TESTE] Bom Dia Fictício',
            'nacional', 120000, 120000, 8000, 18000, 18000, 146000, 'gerada',
            '[TESTE] Produto D', 'Objetivo fictício D: test drive.', 'perdida', 'Orçamento fictício reduzido.',
            v_nome);
  end if;
end $$;

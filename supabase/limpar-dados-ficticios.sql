-- Globo Slots — apaga os dados criados por seed-dados-ficticios.sql.
-- Só mexe no que é inequivocamente de teste: prefixo "[TESTE]", mnemônicos
-- TST1..TST4, entregas TESTE-xxxx e e-mails @exemplo.test. Dados reais ficam.

-- Parte 3 (depende de usuário): propostas -> consultas e oportunidades de teste.
delete from propostas where produto like '[TESTE]%';
delete from consultas where cliente_nome like '[TESTE]%';
delete from oportunidades where titulo like '[TESTE]%';

delete from solicitacao_de_acesso where email like '%@exemplo.test';

delete from acoes_vendidas where numero_da_entrega like 'TESTE-%';

-- Apagar o programa leva junto preço regional, ações regionais, bloqueios,
-- períodos especiais e restrições (on delete cascade).
delete from programas where mnemonico in ('TST1', 'TST2', 'TST3', 'TST4', 'TST5');

delete from marca_cliente_manual
 where cliente_id in (select id from clientes where nome like '[TESTE]%');
delete from anunciantes_take where nome like '[TESTE]%';
delete from marcas where nome like '[TESTE]%';
delete from clientes where nome like '[TESTE]%';
delete from carteira_executivo where email like '%@exemplo.test';

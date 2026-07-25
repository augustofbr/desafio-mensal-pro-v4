-- V4: metas de agosto/2026
-- Cabelo passa a pontuar apenas "Cronograma Capilar [pacote]" (5 pts).
-- Estetica migra de faturamento para pontos, com "Limpeza de Pele*" (3 pts).
-- Volume de atendimento (cliente unico/dia) vale 2 pts nas tres categorias.
-- Maquiagem fica fora do desafio (enabled = false).

INSERT INTO regras_desafio (valid_from, label, cabelo, unhas, estetica, maquiagem)
VALUES (
  '2026-08',
  'V4 - Agosto 2026',
  '{
    "scoringModel": "points",
    "clientPointValue": 2,
    "specialServicePointValue": 5,
    "specialServiceLabel": "Cronograma Capilar",
    "specialServiceMatch": { "type": "exact", "values": ["Cronograma Capilar [pacote]"] },
    "starPointValue": 3,
    "starsCountInScore": true,
    "qualificationGoals": { "minUniqueClients": 60, "minSpecialServices": 10 },
    "symbolicGoals": { "stars": 10 },
    "manufacturerConstraints": false,
    "enabled": true,
    "prize": "A definir"
  }'::jsonb,
  '{
    "scoringModel": "points",
    "clientPointValue": 2,
    "specialServicePointValue": 3,
    "specialServiceLabel": "SPA dos Pés",
    "specialServiceMatch": { "type": "exact", "values": ["SPA dos Pés"] },
    "starPointValue": 3,
    "starsCountInScore": true,
    "qualificationGoals": { "minUniqueClients": 80, "minSpecialServices": 10 },
    "symbolicGoals": { "stars": 10 },
    "manufacturerConstraints": false,
    "enabled": true,
    "prize": "A definir"
  }'::jsonb,
  '{
    "scoringModel": "points",
    "clientPointValue": 2,
    "specialServicePointValue": 3,
    "specialServiceLabel": "Limpeza de Pele",
    "specialServiceMatch": { "type": "prefix", "values": ["Limpeza de Pele"] },
    "starPointValue": 3,
    "starsCountInScore": true,
    "qualificationGoals": { "minUniqueClients": 80, "minSpecialServices": 10 },
    "symbolicGoals": { "stars": 10 },
    "manufacturerConstraints": false,
    "enabled": true,
    "prize": "A definir"
  }'::jsonb,
  '{
    "scoringModel": "revenue-points",
    "clientPointValue": 1,
    "specialServicePointValue": 0,
    "specialServiceLabel": "Serviços",
    "starPointValue": 2,
    "starsCountInScore": true,
    "revenuePointConversion": 140,
    "qualificationGoals": { "minRevenue": 3500 },
    "symbolicGoals": { "stars": 10 },
    "manufacturerConstraints": false,
    "enabled": false,
    "prize": "Fora do desafio em agosto"
  }'::jsonb
);

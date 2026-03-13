-- Tabela de mapeamento: tratamento capilar -> fabricante
CREATE TABLE IF NOT EXISTS tratamento_fabricante (
  id SERIAL PRIMARY KEY,
  service_name TEXT NOT NULL,
  fabricante TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(service_name, fabricante)
);

ALTER TABLE tratamento_fabricante ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access on tratamento_fabricante" ON tratamento_fabricante FOR SELECT USING (true);

-- Tabela de constraints: profissional -> fabricantes permitidos
CREATE TABLE IF NOT EXISTS profissional_fabricante (
  id SERIAL PRIMARY KEY,
  profissional_id INTEGER NOT NULL,
  nome_profissional TEXT NOT NULL,
  fabricante TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profissional_id, fabricante)
);

ALTER TABLE profissional_fabricante ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access on profissional_fabricante" ON profissional_fabricante FOR SELECT USING (true);

-- Seed: profissional_fabricante
INSERT INTO profissional_fabricante (profissional_id, nome_profissional, fabricante) VALUES
  (788360, 'Jóia', 'L''Oréal'),
  (829346, 'Manu', 'Nuance'),
  (829346, 'Manu', 'Keune'),
  (853281, 'Sarah', 'L''Oréal'),
  (793041, 'Rilley', 'Wella'),
  (649472, 'Brenda', 'Truss'),
  (649472, 'Brenda', 'Davines'),
  (804415, 'Ricardo', 'Vitaliss'),
  (804415, 'Ricardo', 'Cadiveu')
ON CONFLICT (profissional_id, fabricante) DO NOTHING;

-- Seed: tratamento_fabricante
INSERT INTO tratamento_fabricante (service_name, fabricante) VALUES
  ('Loreal Cachos', 'L''Oréal'),
  ('Loreal Inforcer', 'L''Oréal'),
  ('Loreal Metal Detox', 'L''Oréal'),
  ('Loreal Molecular', 'L''Oréal'),
  ('Loreal Nutrifier', 'L''Oréal'),
  ('Loreal Pós Quimica', 'L''Oréal'),
  ('Loreal Pro Longer', 'L''Oréal'),
  ('Loreal Scalp Argila', 'L''Oréal'),
  ('Loreal Vitamino Color Spectrum', 'L''Oréal'),
  ('Loreal Vitamino Color Tradicional', 'L''Oréal'),
  ('Kerastase Nutrição', 'L''Oréal'),
  ('Kerastase Recostrução', 'L''Oréal'),
  ('Wella BlondorPlex', 'Wella'),
  ('Wella Collor Brilliance', 'Wella'),
  ('Wella Color Motion', 'Wella'),
  ('Wella Ellements', 'Wella'),
  ('Wella Enrich', 'Wella'),
  ('Wella Fusion', 'Wella'),
  ('Wella Luxe Ultimate', 'Wella'),
  ('Wella Oil Reflections', 'Wella'),
  ('Wella Ultimate - reconstrução imediata', 'Wella'),
  ('Sebastian Penetraite', 'Wella'),
  ('NO BREAKER SEBASTIAN', 'Wella'),
  ('Truss Blond', 'Truss'),
  ('Truss Infusion', 'Truss'),
  ('Truss Net Mask', 'Truss'),
  ('Truss Nutri Infusion', 'Truss'),
  ('Davines calming', 'Davines'),
  ('Davines Purifying', 'Davines'),
  ('Cadiveu Blond Reconstrutor', 'Cadiveu'),
  ('Cadiveu Hair Remedy', 'Cadiveu'),
  ('Cadiveu Nutri Glow', 'Cadiveu'),
  ('Keune Smoth - Reconstrução', 'Keune'),
  ('Keune Vital Hidratação', 'Keune'),
  ('Keune Vital Nutrição', 'Keune'),
  ('Nuance Nutrição', 'Nuance'),
  ('Vitallis', 'Vitaliss'),
  ('Vitallis Reposição de Carbono', 'Vitaliss'),
  ('Plastica Premium - Vitallis', 'Vitaliss'),
  ('Joico Blonde Life', 'Joico'),
  ('Joico Defy Damage', 'Joico'),
  ('Joico K-Pack Reconstrutor', 'Joico'),
  ('Joico k-pak 4 passos', 'Joico'),
  ('Joico K-Pak Color Therapy', 'Joico'),
  ('Joico K-PAK Revitaluxe', 'Joico'),
  ('Joico Moisture Recovery', 'Joico'),
  ('Trat. Joico Luster lock', 'Joico'),
  ('Lavagem Especial (loreal, wella,kerastase, joico)', 'L''Oréal'),
  ('Lavagem Especial (loreal, wella,kerastase, joico)', 'Wella'),
  ('Banho de Ouro', 'Não classificado'),
  ('Cauterização Trivitt', 'Não classificado'),
  ('Detox Capilar e escova', 'Não classificado'),
  ('Donatti Profissional', 'Não classificado'),
  ('Hidratação Princesse', 'Não classificado'),
  ('Olaplex Donatti', 'Não classificado'),
  ('Plastica dos Fios', 'Não classificado'),
  ('Schwarzkopf bonacure', 'Não classificado'),
  ('Senscience Blond', 'Não classificado'),
  ('Senscience Nutrição', 'Não classificado'),
  ('Trat. CPR', 'Não classificado')
ON CONFLICT (service_name, fabricante) DO NOTHING;

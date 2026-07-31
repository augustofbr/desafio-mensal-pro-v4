CREATE OR REPLACE FUNCTION public.trinks_categoria_csv(p_api text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_api
    WHEN 'Cabelo'            THEN 'Serviços para o cabelo.'
    WHEN 'Estética Facial'   THEN 'Serviços de estética facial.'
    WHEN 'Estética Corporal' THEN 'Serviços de estética corporal'
    WHEN 'Depilação'         THEN 'Serviços de depilação.'
    WHEN 'Sobrancelha'       THEN 'Serviços de sobrancelha.'
    WHEN 'Maquiagem'         THEN 'Serviços de maquiagem.'
    ELSE p_api   -- Tratamentos para Cabelo, Manicure e Pedicure, Outros, Pedicure, futuras…
  END $$;

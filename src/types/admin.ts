import type { CategoryRules, StarBonusExtra } from "@/lib/rulesConfig";

export interface RegrasDesafioDB {
  id: string;
  valid_from: string;
  label: string | null;
  cabelo: CategoryRules;
  unhas: CategoryRules;
  estetica: CategoryRules;
  maquiagem: CategoryRules;
  /** Nullable; ausente antes da migracao 20261011120000. Validado no consumo. */
  star_bonus_extra?: StarBonusExtra | null;
  created_at: string;
  updated_at: string;
}

export interface FeriadoDB {
  id: number;
  data: string;
  descricao: string;
  created_at: string;
}

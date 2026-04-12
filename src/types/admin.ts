import type { CategoryRules } from "@/lib/rulesConfig";

export interface RegrasDesafioDB {
  id: string;
  valid_from: string;
  label: string | null;
  cabelo: CategoryRules;
  unhas: CategoryRules;
  estetica: CategoryRules;
  maquiagem: CategoryRules;
  created_at: string;
  updated_at: string;
}

export interface FeriadoDB {
  id: number;
  data: string;
  descricao: string;
  created_at: string;
}

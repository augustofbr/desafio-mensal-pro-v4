export interface ProfissionalAtivo {
  created_at: string;
  nome_profissional: string | null;
  profissionalId: number;
  categoria: string | null;
  apelido?: string | null;
  ativo?: boolean | null;
  /** Dia do aniversário (1-31). NULL = data não informada. */
  dia_aniversario?: number | null;
  /** Mês do aniversário (1-12). NULL = data não informada. Ano não é armazenado, por privacidade. */
  mes_aniversario?: number | null;
}

export type CategoriaAtiva = "Cabelo" | "Unhas" | "Estetica" | "Maquiagem";

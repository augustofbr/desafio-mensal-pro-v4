export interface ProfissionalAtivo {
  created_at: string;
  nome_profissional: string | null;
  profissionalId: number;
  categoria: string | null;
}

export type CategoriaAtiva = "Cabelo" | "Unhas" | "Estetica" | "Maquiagem";

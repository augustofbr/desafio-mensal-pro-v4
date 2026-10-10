import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cliente sem o schema tipado, so para `tratamento_fabricante` e
 * `profissional_fabricante`, que nao constam em `src/integrations/supabase/types.ts`
 * (arquivo gerado — nao editar a mao). Substitui os `from("..." as any)` espalhados.
 * Quem usa declara o formato das linhas que espera.
 */
export const fabricanteDb = supabase as unknown as SupabaseClient;

/** Mensagem de um erro capturado em `catch (err: unknown)`. */
export function mensagemDeErro(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

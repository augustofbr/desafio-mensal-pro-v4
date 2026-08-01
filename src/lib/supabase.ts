// auth-kit v0.1 — spa/lib/supabase.ts
//
// ⚠ DESVIO DELIBERADO DO TEMPLATE (único do kit neste app).
// O template original faz `createClient(import.meta.env.VITE_SUPABASE_URL, ...)`
// aqui, criando um client PRÓPRIO. Este app já tem um client
// (`src/integrations/supabase/client.ts`) usado por TODOS os hooks de dados do
// dashboard. Dois `createClient()` no mesmo bundle criam dois GoTrueClient sobre
// a MESMA storageKey (`sb-<ref>-auth-token`): além do warning "Multiple
// GoTrueClient instances detected in the same browser context", os dois disputam
// o refresh do token — o segundo a renovar manda um refresh token já rotacionado
// e derruba a sessão do usuário no meio do uso. Reexportamos o client existente:
// uma instância só, um único dono da sessão.
//
// O cast é necessário porque o client do app é tipado com o `Database` gerado
// (`src/integrations/supabase/types.ts`), que não conhece as tabelas
// `destaque_*` criadas pela fase SQL — `.from("destaque_users_app")` não
// compilaria sob aquele genérico. `SupabaseClient` sem genérico é exatamente o
// tipo que o client do template teria.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as clientDoApp } from "@/integrations/supabase/client";

export const supabase = clientDoApp as unknown as SupabaseClient;

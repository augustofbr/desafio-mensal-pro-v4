// "Sair" único do app: desloga só este aparelho e avisa se falhar. Usado pelo
// ContaLogada, AdminPanel, SemAcesso e pela tela de erro do RequirePage.
// - scope "local": o Auth é compartilhado com outros apps do Studio X; o
//   padrão ("global") derrubaria as sessões da pessoa neles também.
// - Se falhar, a sessão local continua (o supabase-js só apaga depois do
//   logout no servidor dar certo ou voltar 401/403/404): avisar, não fingir.
// - O cache do React Query é zerado pelo AuthProvider no SIGNED_OUT.
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export const MSG_FALHA_AO_SAIR = "Não foi possível sair agora. Verifique a conexão e tente de novo.";

export async function sairDesteAparelho(origem: string): Promise<boolean> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    console.error(`${origem}: signOut falhou`, error.message);
    toast.error(MSG_FALHA_AO_SAIR);
    return false;
  }
  return true;
}

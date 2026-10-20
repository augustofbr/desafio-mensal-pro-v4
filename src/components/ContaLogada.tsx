// E-mail de quem está logado + "Sair", no topo das páginas do painel
// (/, /aniversariantes, /minhas-avaliacoes). Só renderiza com sessão; as
// páginas já estão atrás de RequirePage, então na prática sempre há uma.
import { useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAcesso } from "@/auth/acesso";
import { supabase } from "@/lib/supabase";

export function ContaLogada() {
  const { session, acesso } = useAcesso();
  const [saindo, setSaindo] = useState(false);

  if (!session) return null;
  const email = acesso?.email || session.user.email || "";

  async function sair() {
    setSaindo(true);
    // scope "local": desloga só este aparelho. O Auth é compartilhado com
    // outros apps do Studio X; "global" derrubaria as sessões da pessoa
    // neles também.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      // A sessão local continua (o supabase-js só apaga depois do logout no
      // servidor dar certo ou voltar 401/403/404). Avisar em vez de fingir.
      console.error("ContaLogada: signOut falhou", error.message);
      toast.error("Não foi possível sair agora. Verifique a conexão e tente de novo.");
      setSaindo(false);
      return;
    }
    // O cache do React Query é zerado pelo AuthProvider no SIGNED_OUT (um
    // lugar só para todo signOut; ver src/auth/deveLimparCache.ts).
  }

  return (
    <div className="flex items-center justify-end gap-1 mb-2 animate-fade-slide-up">
      <span className="min-w-0 truncate text-xs text-gray-500 font-body" title={email}>
        {email}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={sair}
        disabled={saindo}
        className="shrink-0 gap-1.5 text-gray-600 hover:text-gray-800 font-body"
      >
        <LogOut className="h-4 w-4" />
        {saindo ? "Saindo…" : "Sair"}
      </Button>
    </div>
  );
}

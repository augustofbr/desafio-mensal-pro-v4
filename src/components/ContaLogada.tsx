// E-mail de quem está logado + "Sair", no topo das páginas do painel
// (/, /aniversariantes, /minhas-avaliacoes). Só renderiza com sessão; as
// páginas já estão atrás de RequirePage, então na prática sempre há uma.
import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAcesso } from "@/auth/acesso";
import { sairDesteAparelho } from "@/auth/sair";

export function ContaLogada() {
  const { session, acesso } = useAcesso();
  const [saindo, setSaindo] = useState(false);

  if (!session) return null;
  const email = acesso?.email || session.user.email || "";

  async function sair() {
    setSaindo(true);
    // Deu certo: o SIGNED_OUT leva o RequirePage ao login e este componente
    // desmonta. Falhou: o helper já avisou; o botão volta.
    const ok = await sairDesteAparelho("ContaLogada");
    if (!ok) setSaindo(false);
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

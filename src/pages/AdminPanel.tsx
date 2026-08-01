import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, LogOut, Settings, Factory, CalendarOff, Users, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { RulesManager } from "@/components/admin/RulesManager";
import { ManufacturerManager } from "@/components/admin/ManufacturerManager";
import { HolidaysManager } from "@/components/admin/HolidaysManager";
import { AvaliacoesManager } from "@/components/admin/AvaliacoesManager";
import { useAvaliacoesPendentes } from "@/hooks/useAdminAvaliacoes";
// auth-kit: identidade e nível de acesso vêm do provider do kit (matriz de
// páginas em destaque_perfis), não mais de uma lista de emails no bundle.
import { useAcesso } from "@/auth/acesso";
import { supabase } from "@/lib/supabase";
import { PAGES } from "@/lib/pages";

export default function AdminPanel() {
  const { acesso } = useAcesso();
  const navigate = useNavigate();
  // Contador da fila na própria aba: quem abre o painel vê o trabalho pendente
  // sem precisar entrar. Compartilha a queryKey do AvaliacoesManager — uma
  // requisição só para os dois.
  const { pendentes } = useAvaliacoesPendentes();

  // O link para a tela de usuários só aparece para quem alcança aquela página.
  // Isso é UX: quem forçar a URL bate no RequirePage de dentro de @/pages/Usuarios,
  // e as mutações de lá passam pela Edge Function, que checa o nível de novo.
  const podeVerUsuarios = acesso != null && acesso.paginas.usuarios !== "none";

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="gap-1 text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
            <div className="h-5 w-px bg-gray-200" />
            <h1 className="text-lg font-heading font-semibold text-gray-900">
              Painel Administrativo
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {podeVerUsuarios && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(PAGES.usuarios.href)}
                className="gap-1 text-gray-500 hover:text-gray-700"
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">{PAGES.usuarios.label}</span>
              </Button>
            )}
            <span className="text-xs text-gray-400 font-body hidden sm:block">
              {acesso?.email}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="gap-1 text-gray-500"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Aprovações abre por padrão: é a única aba com trabalho diário
            (a fila de estrelas). As outras três são configuração, mexidas de
            vez em quando. No celular a lista quebra em 2×2 — daí o h-auto. */}
        <Tabs defaultValue="aprovacoes" className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:h-10 sm:max-w-2xl sm:grid-cols-4">
            <TabsTrigger value="aprovacoes" className="gap-2 font-body">
              <Star className="h-4 w-4" />
              Aprovações
              {pendentes.length > 0 && (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-mono-num text-xs font-semibold text-amber-700">
                  {pendentes.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="regras" className="gap-2 font-body">
              <Settings className="h-4 w-4" />
              Regras
            </TabsTrigger>
            <TabsTrigger value="fabricantes" className="gap-2 font-body">
              <Factory className="h-4 w-4" />
              Fabricantes
            </TabsTrigger>
            <TabsTrigger value="feriados" className="gap-2 font-body">
              <CalendarOff className="h-4 w-4" />
              Feriados
            </TabsTrigger>
          </TabsList>

          <TabsContent value="aprovacoes">
            <AvaliacoesManager />
          </TabsContent>

          <TabsContent value="regras">
            <RulesManager />
          </TabsContent>

          <TabsContent value="fabricantes">
            <ManufacturerManager />
          </TabsContent>

          <TabsContent value="feriados">
            <HolidaysManager />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}


import React, { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Aniversariantes from "./pages/Aniversariantes";
import MinhasAvaliacoes from "./pages/MinhasAvaliacoes";
import AdminPanel from "./pages/AdminPanel";
import NotFound from "./pages/NotFound";
// auth-kit: nenhuma rota é pública (decisão do dono, 2026-10-20). O
// AuthProvider envolve o <Routes> inteiro e cada rota passa por um
// RequirePage. Isto é UX; o gate real é a RLS.
import { AuthProvider } from "./auth/AuthProvider";
import { RequirePage } from "./auth/guards";
import Usuarios from "./pages/Usuarios";

function App() {
  // Um client só pela vida do app: criado no corpo do componente, cada
  // re-render do App (ex.: HMR) trocaria o client, perderia o cache e faria o
  // AuthProvider (que depende dele) reassinar e recarregar o acesso.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route
                path="/"
                element={
                  <RequirePage chave="painel">
                    <Index />
                  </RequirePage>
                }
              />
              <Route
                path="/aniversariantes"
                element={
                  <RequirePage chave="painel">
                    <Aniversariantes />
                  </RequirePage>
                }
              />
              <Route
                path="/minhas-avaliacoes"
                element={
                  <RequirePage chave="painel">
                    <MinhasAvaliacoes />
                  </RequirePage>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequirePage chave="admin">
                    <AdminPanel />
                  </RequirePage>
                }
              />
              {/* @/pages/Usuarios já se envolve no RequirePage chave="usuarios"
                  (é assim que o kit entrega a página): não duplicamos o guard. */}
              <Route path="/admin/usuarios" element={<Usuarios />} />
              <Route
                path="*"
                element={
                  <RequirePage chave="painel">
                    <NotFound />
                  </RequirePage>
                }
              />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;


import React from "react";
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
// auth-kit: o provider monta SÓ na subárvore /admin — as rotas públicas
// ("/", /aniversariantes, /minhas-avaliacoes) continuam sem auth nenhum,
// por decisão de produto. Não mova o AuthProvider para fora do <Routes>.
import { AuthProvider } from "./auth/AuthProvider";
import { RequirePage } from "./auth/guards";
import Usuarios from "./pages/Usuarios";

function App() {
  // Create a client
  const queryClient = new QueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/aniversariantes" element={<Aniversariantes />} />
            <Route path="/minhas-avaliacoes" element={<MinhasAvaliacoes />} />
            <Route
              path="/admin"
              element={
                <AuthProvider>
                  <RequirePage chave="admin">
                    <AdminPanel />
                  </RequirePage>
                </AuthProvider>
              }
            />
            <Route
              path="/admin/usuarios"
              element={
                // @/pages/Usuarios já se envolve no RequirePage chave="usuarios"
                // (é assim que o kit entrega a página) — não duplicamos o guard.
                <AuthProvider>
                  <Usuarios />
                </AuthProvider>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

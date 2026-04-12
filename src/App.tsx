
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
import { AuthProvider } from "./contexts/AuthContext";
import { AdminRouteGuard } from "./components/admin/AdminRouteGuard";

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
                  <AdminRouteGuard>
                    <AdminPanel />
                  </AdminRouteGuard>
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

// auth-kit v0.1 — spa/pages/Login.tsx
// Adaptado neste repo (login em todas as rotas, 2026-10-20): o link mágico
// volta para a URL em que a pessoa estava (não para uma página fixa) e a tela
// aceita um aviso opcional (ex.: acesso removido).
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

// Destino do link mágico: a URL atual, sem o fragmento (#...). O app usa
// BrowserRouter, então o fragmento nunca é rota; e ele pode trazer lixo de uma
// tentativa anterior (ex.: "#error=access_denied&error_code=otp_expired" de um
// link vencido). No fluxo implícito o Auth devolve a sessão no fragmento da
// URL de destino, então um fragmento antigo ali estragaria o retorno.
// PRÉ-REQUISITO: a URL precisa casar com a lista de Redirect URLs do projeto
// Supabase (Auth → URL Configuration), por exemplo
// "https://x3.studioxbrasil.com.br/**"; senão o Auth ignora o destino e manda
// para a Site URL.
function destinoDoLink(): string {
  return window.location.href.split("#")[0];
}

export default function Login({ aviso }: { aviso?: string } = {}) {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "erro">("idle");
  const [erro, setErro] = useState("");

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    // shouldCreateUser:false — login NUNCA cadastra; cadastro é só por convite
    // do admin (docs/armadilhas.md #1). Só link mágico, sem senha.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: destinoDoLink() },
    });
    if (error) {
      setErro(/not.*found|signup|disabled/i.test(error.message)
        ? "Email não cadastrado. Peça a um administrador para criar seu acesso."
        : error.message);
      setEstado("erro");
    } else {
      setEstado("enviado");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">destaque-mensal-pro</h1>
        {aviso && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {aviso}
          </p>
        )}
        {estado === "enviado" ? (
          <p className="text-sm">Link de acesso enviado para <strong>{email}</strong>. Abra o email neste dispositivo.</p>
        ) : (
          <>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            <button type="submit" disabled={estado === "enviando"}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
              {estado === "enviando" ? "Enviando…" : "Entrar por email"}
            </button>
            {estado === "erro" && <p className="text-sm text-destructive">{erro}</p>}
          </>
        )}
      </form>
    </div>
  );
}

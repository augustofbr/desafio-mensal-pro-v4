// auth-kit v0.1 — spa/pages/Login.tsx
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { PAGES, PAGE_KEYS } from "@/lib/pages";

// Destino do link mágico: a primeira página do registry, NÃO a origin nua
// ("/"). O kit não garante página em "/" — o schema só exige a chave
// "usuarios" — então um app cuja primeira página seja "/painel" mandaria o
// link mágico pra origin, o shell não teria rota ali, e o usuário veria 404
// (ou tela branca) logo depois de um login bem-sucedido. Mesmo raciocínio
// do DESTINO_PADRAO em next/app/auth/callback/route.ts, adaptado pra SPA:
// aqui não há callback route — o supabase-js já resolve a sessão a partir
// da própria URL de destino (detectSessionInUrl, ligado por padrão).
const DESTINO_PADRAO = PAGES[PAGE_KEYS[0]].href;

export default function Login() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "erro">("idle");
  const [erro, setErro] = useState("");

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    // shouldCreateUser:false — login NUNCA cadastra; cadastro é só por convite
    // do admin (docs/armadilhas.md #1). emailRedirectTo aponta pra
    // DESTINO_PADRAO (primeira página do registry), não pra origin nua — veja
    // o comentário acima. PRÉ-REQUISITO DE INSTALAÇÃO: essa URL completa
    // precisa estar na lista de Redirect URLs permitidas do projeto Supabase
    // (Auth → URL Configuration), senão o link mágico volta com erro.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}${DESTINO_PADRAO}` },
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

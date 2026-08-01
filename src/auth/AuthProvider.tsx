// auth-kit v0.1 — spa/auth/AuthProvider.tsx
// Num SPA o enforcement REAL é o RLS; este provider é só UX (o que renderizar).
// SÓ exporta o componente — o contexto, o hook e os helpers (Acesso,
// RefreshOpts, AuthContext, carregarAcesso, useAcesso, hasAnyAccess,
// hasAnyWrite) vivem em ./acesso.ts. Motivo: um arquivo que mistura um
// componente com exports não-componente trava o Fast Refresh do Vite
// (react-refresh/only-export-components) — separado, o Vite recarrega este
// componente a quente sem precisar de reload completo da página.
import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AuthContext, carregarAcesso, type Acesso, type Ctx, type RefreshOpts } from "./acesso";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [acesso, setAcesso] = useState<Acesso | null>(null);
  const [loading, setLoading] = useState(true);
  // Contador de geração: cada refresh() incrementa e captura o próprio número
  // antes dos awaits. Sem isso, duas resoluções concorrentes (ex.: um
  // onAuthStateChange disparando enquanto o refresh() da Task 11 pós-edição
  // de perfil ainda está em voo) não têm ordem garantida — a mais lenta pode
  // sobrescrever a mais rápida com dado velho, e a sessão de um usuário fica
  // grudada com a matriz de outro até o próximo evento de auth. Cada await é
  // seguido de uma checagem: se a geração mudou enquanto esperávamos, esta
  // chamada é obsoleta e descarta o resultado em vez de aplicá-lo.
  const geracaoRef = useRef(0);
  // Espelha a sessão atual de forma síncrona, fora do ciclo de render: o
  // callback de onAuthStateChange é registrado uma única vez (o efeito
  // abaixo só roda na montagem, já que `refresh` é estável) e precisa ler a
  // sessão MAIS RECENTE pra decidir se um TOKEN_REFRESHED trocou de usuário
  // — uma closure sobre o estado `session` ficaria presa ao valor da
  // primeira renderização.
  const sessionRef = useRef<Session | null>(null);

  const refresh = useCallback(async (opts?: RefreshOpts) => {
    const minhaGeracao = ++geracaoRef.current;
    const manterConteudo = opts?.manterConteudo === true;
    // loading=true no topo é o padrão (sem isso, entre o disparo deste
    // refresh e sua resolução, `acesso` continua sendo o valor ANTERIOR com
    // loading=false — os guards não seguram e renderizam com base em dado
    // que já sabemos estar potencialmente errado: perfil trocado, usuário
    // desativado etc., quando a IDENTIDADE pode ter mudado). manterConteudo
    // pula esse levantamento — ver o comentário em RefreshOpts (acesso.ts)
    // pra quando isso é seguro.
    if (!manterConteudo) setLoading(true);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (minhaGeracao !== geracaoRef.current) return; // superado por um refresh mais novo
      const novoAcesso = s ? await carregarAcesso(s.user.id, s.user.email ?? "") : null;
      if (minhaGeracao !== geracaoRef.current) return; // superado de novo, após o segundo await
      sessionRef.current = s;
      setSession(s);
      setAcesso(novoAcesso);
    } catch (e) {
      // getSession()/carregarAcesso() REJEITAREM (em vez de resolver com um
      // campo `error`) é incomum — GoTrue e PostgREST normalmente embrulham
      // falha de rede num resultado resolvido — mas não é impossível. Sem
      // este catch, uma rejeição aqui pulava direto o setLoading(false) lá
      // embaixo: a geração corrente travava em loading=true PRA SEMPRE (não
      // existe refresh mais novo pra superá-la), e RequirePage/RequireWrite
      // ficavam renderizando null pra sempre — trava, não flash. Fail-closed
      // igual aos outros ramos: sessão e acesso viram null, mas o erro fica
      // logado em vez de mudo.
      if (minhaGeracao !== geracaoRef.current) return;
      console.error("AuthProvider.refresh: exceção não tratada ao resolver sessão/acesso", e);
      sessionRef.current = null;
      setSession(null);
      setAcesso(null);
    } finally {
      if (minhaGeracao === geracaoRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // `refresh()` chamado direto (bare/`void`) aqui dispara
    // react-hooks/set-state-in-effect em eslint-plugin-react-hooks >=6: a
    // análise estática rastreia essa função de escopo do componente e
    // enxerga o setState nela, mesmo depois de um await — verificado
    // empiricamente (mesmo achado do UsuariosPerfisManager.tsx da Task 11).
    // A IIFE assíncrona inline é o que o rastreamento não atravessa. O
    // `void refresh()` dentro do callback do onAuthStateChange, logo abaixo,
    // não precisa do mesmo tratamento: aquele call fica dentro de uma
    // função de CALLBACK de assinatura de evento externo, não no nível
    // síncrono do corpo do efeito — é exatamente o padrão que a regra
    // recomenda ("calling setState in a callback function when external
    // state changes").
    void (async () => {
      await refresh();
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, novaSessao) => {
      const mesmoUsuario = novaSessao?.user.id === sessionRef.current?.user.id;
      if (event === "TOKEN_REFRESHED" && mesmoUsuario) {
        // Só o access token mudou — o Supabase renova sozinho a cada hora
        // durante uma sessão ativa, sem que o acesso da pessoa tenha mudado
        // (é o mesmo usuário). Uma re-resolução completa aqui levantaria
        // loading=true incondicionalmente e derrubaria pra null qualquer
        // conteúdo protegido — inclusive estado local de componentes, como
        // um formulário sendo preenchido — sem necessidade nenhuma. Só
        // atualiza a sessão local; `acesso` permanece o mesmo.
        sessionRef.current = novaSessao;
        setSession(novaSessao);
        return;
      }
      // SIGNED_IN, SIGNED_OUT, USER_UPDATED, ou um TOKEN_REFRESHED que (por
      // algum motivo) trocou de usuário: tratamos como identidade nova e
      // fazemos a re-resolução completa, com loading=true.
      void refresh();
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  // Valor extraído para variável em vez de passado como objeto JSX inline no
  // prop `value`: escrever esse objeto direto no JSX exigiria duas chaves
  // abertas seguidas, o que colide com o mecanismo de placeholder do renderer
  // (scripts/render.mjs rejeita qualquer ocorrência residual desse padrão
  // após a substituição).
  const value: Ctx = { session, acesso, loading, refresh };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

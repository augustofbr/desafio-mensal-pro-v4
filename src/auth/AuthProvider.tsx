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
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { AuthContext, carregarAcesso, type Acesso, type Ctx, type RefreshOpts } from "./acesso";
import { deveLimparCache } from "./deveLimparCache";
import { reacaoAoEvento } from "./reacaoAoEvento";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [acesso, setAcesso] = useState<Acesso | null>(null);
  const [erroAcesso, setErroAcesso] = useState(false);
  // Precisa estar dentro do QueryClientProvider (App.tsx: QueryClientProvider
  // > ... > AuthProvider). Usado só para zerar o cache quando a sessão sai ou
  // troca de dono (ver deveLimparCache.ts).
  const queryClient = useQueryClient();
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

  // true enquanto um refresh VISÍVEL (loading=true) está em voo. Um refresh
  // silencioso que chegue nesse meio tempo supera a geração do visível; se
  // continuasse silencioso, poderia sair cedo (erro de rede) e baixar o
  // loading com o estado de antes da troca de identidade. Por isso ele herda
  // o modo visível.
  const visivelEmVooRef = useRef(false);

  const refresh = useCallback(async (opts?: RefreshOpts) => {
    const minhaGeracao = ++geracaoRef.current;
    const manterConteudo = opts?.manterConteudo === true && !visivelEmVooRef.current;
    if (!manterConteudo) visivelEmVooRef.current = true;
    // loading=true no topo é o padrão (sem isso, entre o disparo deste
    // refresh e sua resolução, `acesso` continua sendo o valor ANTERIOR com
    // loading=false — os guards não seguram e renderizam com base em dado
    // que já sabemos estar potencialmente errado: perfil trocado, usuário
    // desativado etc., quando a IDENTIDADE pode ter mudado). manterConteudo
    // pula esse levantamento — ver o comentário em RefreshOpts (acesso.ts)
    // pra quando isso é seguro.
    if (!manterConteudo) setLoading(true);
    try {
      const { data: { session: s }, error: erroSessao } = await supabase.auth.getSession();
      if (minhaGeracao !== geracaoRef.current) return; // superado por um refresh mais novo
      if (erroSessao) {
        // Ex.: token vencido e rede caída: o auth-js devolve session null COM
        // error (AuthRetryableFetchError) e mantém a sessão guardada. Isso não
        // é "sem sessão": tratar como login pediria link mágico novo à toa.
        // Visível → tela "erro" (Tentar de novo). Silencioso → mantém o que
        // está na tela; a próxima ação/carregamento tenta de novo.
        console.error("AuthProvider.refresh: getSession devolveu erro", erroSessao.message);
        if (!manterConteudo) {
          setAcesso(null);
          setErroAcesso(true);
        }
        return;
      }
      const resultado = s ? await carregarAcesso(s.user.id, s.user.email ?? "") : null;
      if (minhaGeracao !== geracaoRef.current) return; // superado de novo, após o segundo await
      if (manterConteudo && resultado?.tipo === "erro") {
        // Revalidação silenciosa que falhou (rede): não troca a tela por
        // "erro" no meio do uso, nem desloga. Fica o acesso já resolvido.
        return;
      }
      sessionRef.current = s;
      setSession(s);
      setAcesso(resultado?.tipo === "ok" ? resultado.acesso : null);
      // "erro" (consulta falhou) ≠ "ausente" (sem acesso): só o segundo vira
      // "removido" e desloga; o primeiro mostra "Tentar de novo".
      setErroAcesso(resultado?.tipo === "erro");
    } catch (e) {
      // getSession()/carregarAcesso() REJEITAREM (em vez de resolver com um
      // campo `error`) é incomum — GoTrue e PostgREST normalmente embrulham
      // falha de rede num resultado resolvido — mas não é impossível. Sem
      // este catch, uma rejeição aqui pulava direto o setLoading(false) lá
      // embaixo: a geração corrente travava em loading=true PRA SEMPRE (não
      // existe refresh mais novo pra superá-la), e RequirePage/RequireWrite
      // ficavam renderizando null pra sempre — trava, não flash. Fail-closed
      // sem deslogar: acesso vira null e erroAcesso true (tela "erro", com
      // "Tentar de novo"); a sessão fica como estava, porque não sabemos se
      // ela mudou e um soluço não pode exigir link mágico novo.
      if (minhaGeracao !== geracaoRef.current) return;
      console.error("AuthProvider.refresh: exceção não tratada ao resolver sessão/acesso", e);
      if (manterConteudo) return; // silencioso: não derruba a tela por um soluço
      setAcesso(null);
      setErroAcesso(true);
    } finally {
      if (minhaGeracao === geracaoRef.current) {
        visivelEmVooRef.current = false;
        setLoading(false);
      }
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
      // Cache do React Query: zera em SIGNED_OUT e quando o dono da sessão
      // muda. Um lugar só cobre todo signOut (removido, Sair do ContaLogada,
      // do SemAcesso e do AdminPanel) e a troca de conta em outra aba.
      if (deveLimparCache(event, sessionRef.current?.user.id ?? null, novaSessao?.user.id ?? null)) {
        queryClient.clear();
      }
      // Ver reacaoAoEvento.ts: só a troca de IDENTIDADE desmonta a área
      // protegida. O SIGNED_IN que o auth-js emite a cada volta da aba
      // (mesmo usuário) revalida em silêncio; TOKEN_REFRESHED só troca o
      // token; INITIAL_SESSION fica com o refresh() da montagem.
      const reacao = reacaoAoEvento(event, sessionRef.current?.user.id ?? null, novaSessao?.user.id ?? null);
      if (reacao === "nada") return;
      if (reacao === "so_sessao") {
        sessionRef.current = novaSessao;
        setSession(novaSessao);
        return;
      }
      void refresh(reacao === "silencioso" ? { manterConteudo: true } : undefined);
    });
    return () => subscription.unsubscribe();
  }, [refresh, queryClient]);

  // Valor extraído para variável em vez de passado como objeto JSX inline no
  // prop `value`: escrever esse objeto direto no JSX exigiria duas chaves
  // abertas seguidas, o que colide com o mecanismo de placeholder do renderer
  // (scripts/render.mjs rejeita qualquer ocorrência residual desse padrão
  // após a substituição).
  const value: Ctx = { session, acesso, erroAcesso, loading, refresh };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

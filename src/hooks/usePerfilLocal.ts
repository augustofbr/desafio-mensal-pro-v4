import { useCallback, useEffect, useMemo, useState } from "react";
import { gravarPerfil, lerPerfil, validarPerfil } from "@/lib/perfilLocal";
import { normalizeProfessionalId } from "@/lib/scoring";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";

/**
 * localStorage do navegador, ou null quando indisponivel (SSR, Safari privado,
 * cookies bloqueados). Sem storage o app continua funcionando: a identidade vale
 * so enquanto a aba estiver aberta.
 */
function obterStorageLocal(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export interface PerfilLocal {
  /** Id normalizado, ja validado contra o cadastro (auto-limpa se invalido). */
  perfilId: string | null;
  perfil: ProfissionalAtivo | null;
  escolher: (id: string) => void;
  limpar: () => void;
}

/**
 * Identidade local do dashboard: quem esta olhando o painel, guardado no
 * aparelho (sem login). SEMPRE reversivel — `escolher` troca, `limpar` apaga e
 * um id que sumiu do cadastro se limpa sozinho assim que a lista carrega.
 */
export function usePerfilLocal(ativos: ProfissionalAtivo[]): PerfilLocal {
  const storage = useMemo(obterStorageLocal, []);
  const [perfilId, setPerfilId] = useState<string | null>(() =>
    storage ? lerPerfil(storage) : null
  );

  const persistir = useCallback(
    (id: string | null) => {
      if (!storage) return;
      try {
        gravarPerfil(storage, id);
      } catch (erro) {
        // Cota estourada / storage bloqueado: a escolha vale nesta sessao.
        console.warn("Nao foi possivel salvar o perfil local:", erro);
      }
    },
    [storage]
  );

  // Auto-limpeza: o id salvo pode nao existir mais (pessoa removida do cadastro,
  // aparelho compartilhado, storage adulterado). So valida com a lista ja
  // carregada — durante o fetch `ativos` vem vazio e apagaria todo perfil.
  useEffect(() => {
    if (ativos.length === 0) return;
    const valido = validarPerfil(perfilId, ativos);
    if (valido !== perfilId) {
      persistir(valido);
      setPerfilId(valido);
    }
  }, [ativos, perfilId, persistir]);

  const escolher = useCallback(
    (id: string) => {
      const normalizado = normalizeProfessionalId(id);
      persistir(normalizado);
      setPerfilId(normalizado);
    },
    [persistir]
  );

  const limpar = useCallback(() => {
    persistir(null);
    setPerfilId(null);
  }, [persistir]);

  const perfil = useMemo(() => {
    if (!perfilId) return null;
    return (
      ativos.find((prof) => normalizeProfessionalId(prof.profissionalId) === perfilId) ?? null
    );
  }, [ativos, perfilId]);

  return { perfilId, perfil, escolher, limpar };
}

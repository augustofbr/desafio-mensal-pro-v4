import { useCallback, useEffect, useMemo, useState } from "react";
import { escolherPerfilId } from "@/lib/identidade";
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
  /**
   * Id exibido, ja normalizado. Com vinculo da conta e SEMPRE o do vinculo; sem
   * vinculo, o do aparelho (validado contra o cadastro, auto-limpa se invalido).
   * Enquanto o vinculo carrega, null: nunca pisca a identidade errada.
   */
  perfilId: string | null;
  perfil: ProfissionalAtivo | null;
  escolher: (id: string) => void;
  limpar: () => void;
  /**
   * true logo apos a auto-limpeza ter apagado um perfil invalido — a tela deve
   * avisar a pessoa e reabrir o seletor. Some ao chamar `reconhecerAutoLimpeza`.
   */
  autoLimpou: boolean;
  reconhecerAutoLimpeza: () => void;
  /** A identidade vem da conta: sem "Trocar", sem "limpar", sem seletor. */
  fixo: boolean;
  /** O vinculo ainda carrega: nem seletor livre nem "Trocar" por enquanto. */
  carregando: boolean;
  /**
   * A leitura do vinculo falhou: identidade indefinida. Tambem sem seletor livre
   * nem "Trocar" (o vinculo pode existir), e a tela explica a falha.
   */
  erro: boolean;
}

export interface OpcoesPerfilLocal {
  /** `user.id` da conta logada: dono do perfil guardado no aparelho. */
  userId: string | null;
  /** Profissional ligada a conta (RPC `destaque_minha_profissional`), ou null. */
  vinculoId: number | null;
  /** O vinculo ainda esta sendo consultado. */
  vinculoCarregando: boolean;
  /** A consulta do vinculo falhou (nao e o mesmo que "sem vinculo"). */
  vinculoErro: boolean;
}

/** Le o perfil do aparelho para a conta; storage que falha vale como vazio. */
function lerDoAparelho(storage: Storage | null, userId: string | null): string | null {
  if (!storage) return null;
  try {
    return lerPerfil(storage, userId);
  } catch {
    return null;
  }
}

/**
 * Identidade do dashboard: quem esta olhando o painel.
 *
 * - Conta ligada a uma profissional (`vinculoId`): a identidade e a dela, fixa.
 *   O perfil do aparelho nao e usado (nem gravado, nem apagado).
 * - Conta sem vinculo: identidade local, guardada no aparelho JUNTO com o
 *   `user.id` que a escolheu. Em aparelho compartilhado, o perfil de uma conta
 *   nao passa para a outra (ver `lerPerfil`). SEMPRE reversivel — `escolher`
 *   troca, `limpar` apaga e um id que sumiu do cadastro se limpa sozinho assim
 *   que a lista carrega.
 */
export function usePerfilLocal(
  ativos: ProfissionalAtivo[],
  { userId, vinculoId, vinculoCarregando, vinculoErro }: OpcoesPerfilLocal
): PerfilLocal {
  const storage = useMemo(obterStorageLocal, []);
  // `dono` acompanha o estado: se a conta mudar com o componente montado, o id
  // lido para a conta anterior deixa de valer e e relido para a nova.
  const [estado, setEstado] = useState(() => ({
    dono: userId,
    id: lerDoAparelho(storage, userId),
  }));
  const [autoLimpou, setAutoLimpou] = useState(false);

  if (estado.dono !== userId) {
    setEstado({ dono: userId, id: lerDoAparelho(storage, userId) });
  }
  const perfilLocalId = estado.dono === userId ? estado.id : null;

  const { perfilId: perfilDaRegra, fixo } = escolherPerfilId(vinculoId, perfilLocalId);
  const carregando = vinculoCarregando && !fixo;
  const erro = vinculoErro && !fixo;
  // Sem saber se a conta e ligada, o perfil local nao esta em uso.
  const indefinido = carregando || erro;

  const persistir = useCallback(
    (id: string | null) => {
      if (!storage) return;
      try {
        gravarPerfil(storage, id, userId);
      } catch (erro) {
        // Cota estourada / storage bloqueado: a escolha vale nesta sessao.
        console.warn("Nao foi possivel salvar o perfil local:", erro);
      }
    },
    [storage, userId]
  );

  // Auto-limpeza: o id salvo pode nao existir mais (pessoa removida do cadastro,
  // aparelho compartilhado, storage adulterado). So valida com a lista ja
  // carregada — durante o fetch `ativos` vem vazio e apagaria todo perfil. Com
  // vinculo (ou ainda carregando) o perfil local nao esta em uso: nao mexe nele.
  useEffect(() => {
    if (fixo || indefinido) return;
    if (ativos.length === 0) return;
    const valido = validarPerfil(perfilLocalId, ativos);
    if (valido !== perfilLocalId) {
      persistir(valido);
      setEstado({ dono: userId, id: valido });
      // Perder a identidade sem explicacao confunde; a tela usa esse sinal para
      // avisar e reabrir o seletor.
      setAutoLimpou(true);
    }
  }, [ativos, perfilLocalId, persistir, fixo, indefinido, userId]);

  const escolher = useCallback(
    (id: string) => {
      const normalizado = normalizeProfessionalId(id);
      persistir(normalizado);
      setEstado({ dono: userId, id: normalizado });
      setAutoLimpou(false);
    },
    [persistir, userId]
  );

  const limpar = useCallback(() => {
    persistir(null);
    setEstado({ dono: userId, id: null });
    setAutoLimpou(false);
  }, [persistir, userId]);

  const reconhecerAutoLimpeza = useCallback(() => setAutoLimpou(false), []);

  // Vinculo vence o local (regra em `escolherPerfilId`); indefinido nao mostra nenhum.
  const perfilId = indefinido ? null : perfilDaRegra;

  const perfil = useMemo(() => {
    if (!perfilId) return null;
    return (
      ativos.find((prof) => normalizeProfessionalId(prof.profissionalId) === perfilId) ?? null
    );
  }, [ativos, perfilId]);

  return {
    perfilId,
    perfil,
    escolher,
    limpar,
    autoLimpou,
    reconhecerAutoLimpeza,
    fixo,
    carregando,
    erro,
  };
}

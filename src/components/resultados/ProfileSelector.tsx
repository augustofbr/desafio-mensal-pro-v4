import { useMemo } from "react";
import { Check } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  PROF_CATEGORIES,
  getCategoryDisplayName,
  isCategoryActive,
} from "@/lib/categoryDisplayNames";
import type { RulesVersion } from "@/lib/rulesConfig";
import { normalizeProfessionalId } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";

interface ProfileSelectorProps {
  aberto: boolean;
  onFechar: () => void;
  ativos: ProfissionalAtivo[];
  rules: RulesVersion;
  perfilId: string | null;
  onEscolher: (id: string) => void;
  onLimpar: () => void;
}

/** Ordem fixa de exibicao das categorias (a mesma do dashboard). */
const ORDEM_CATEGORIAS: string[] = [
  PROF_CATEGORIES.CABELO,
  PROF_CATEGORIES.UNHAS,
  PROF_CATEGORIES.ESTETICA,
  PROF_CATEGORIES.MAQUIAGEM,
];

/** Apelido quando existe; o nome completo e o fallback. So exibicao. */
function nomeExibicao(prof: ProfissionalAtivo): string {
  const apelido = prof.apelido?.trim();
  if (apelido) return apelido;
  const nome = prof.nome_profissional?.trim();
  if (nome) return nome;
  return `Profissional ${prof.profissionalId}`;
}

function inicial(nome: string): string {
  return (Array.from(nome)[0] ?? "?").toUpperCase();
}

/**
 * Folha de rosto da identidade local: "Quem é você?".
 *
 * Escolher grava o perfil no aparelho; o rodape permite desfazer a qualquer
 * momento ("Não sou nenhum destes"). Nenhuma acao aqui e definitiva.
 */
export function ProfileSelector({
  aberto,
  onFechar,
  ativos,
  rules,
  perfilId,
  onEscolher,
  onLimpar,
}: ProfileSelectorProps) {
  const grupos = useMemo(() => {
    return ORDEM_CATEGORIAS.filter((categoria) => isCategoryActive(rules, categoria))
      .map((categoria) => ({
        categoria,
        titulo: getCategoryDisplayName(categoria),
        pessoas: ativos
          .filter((prof) => prof.categoria === categoria)
          .map((prof) => ({
            id: normalizeProfessionalId(prof.profissionalId),
            nome: nomeExibicao(prof),
          }))
          // Sem id nao ha como associar aos servicos — fica fora da lista.
          .filter((pessoa): pessoa is { id: string; nome: string } => pessoa.id !== null)
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      }))
      .filter((grupo) => grupo.pessoas.length > 0);
  }, [ativos, rules]);

  const escolherEFechar = (id: string) => {
    onEscolher(id);
    onFechar();
  };

  const limparEFechar = () => {
    onLimpar();
    onFechar();
  };

  return (
    <Sheet open={aberto} onOpenChange={(estaAberto) => !estaAberto && onFechar()}>
      <SheetContent
        side="bottom"
        className="flex max-h-[85vh] flex-col gap-4 rounded-t-2xl"
      >
        <SheetHeader>
          <SheetTitle className="text-xl">Quem é você?</SheetTitle>
          <SheetDescription className="text-base">
            Seus resultados aparecem no seu cartão. Você pode trocar ou limpar quando quiser.
          </SheetDescription>
        </SheetHeader>

        {grupos.length === 0 ? (
          <p className="py-6 text-center text-base text-muted-foreground">
            Nenhum profissional disponível para escolher neste período.
          </p>
        ) : (
          <ScrollArea className="-mx-2 flex-1">
            <div className="space-y-5 px-2 pb-2">
              {grupos.map((grupo) => (
                <div key={grupo.categoria} className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {grupo.titulo}
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {grupo.pessoas.map((pessoa) => {
                      const selecionado = pessoa.id === perfilId;
                      return (
                        <button
                          key={pessoa.id}
                          type="button"
                          onClick={() => escolherEFechar(pessoa.id)}
                          aria-pressed={selecionado}
                          className={cn(
                            "flex min-h-[44px] w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-base transition-colors",
                            selecionado
                              ? "border-primary bg-primary/10 font-semibold"
                              : "border-border hover:bg-accent"
                          )}
                        >
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="text-sm font-semibold">
                              {inicial(pessoa.nome)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="flex-1 truncate">{pessoa.nome}</span>
                          {selecionado && (
                            <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <Button
          type="button"
          variant="secondary"
          onClick={limparEFechar}
          className="min-h-[44px] w-full text-base"
        >
          Não sou nenhum destes (limpar)
        </Button>
      </SheetContent>
    </Sheet>
  );
}

export default ProfileSelector;

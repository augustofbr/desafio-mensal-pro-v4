// auth-kit v0.1 — spa/components/usuarios/PerfilDialog.tsx
import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authAdmin } from "@/auth/authAdmin";
import { useAcesso } from "@/auth/acesso";
import { PAGES, PAGE_KEYS, type PageAccess, type PageKey } from "@/lib/pages";
import type { PerfilRow } from "./UsuariosPerfisManager";

type Props = {
  perfil?: PerfilRow;
  // O diálogo fecha no sucesso, então a mensagem sobe pra quem o renderizou.
  // O erro fica inline aqui embaixo: com o modal aberto, nada atrás dele é visível.
  onSucesso?: (mensagem: string) => void;
  // Disparado ao abrir, pra quem renderiza limpar feedback antigo da tela.
  onAbrir?: () => void;
  // Disparado depois de TODA tentativa de submit (sucesso ou falha) — não há
  // revalidatePath num SPA; isto é o que recarrega a lista do Manager. Chamado
  // também na falha porque um erro aqui pode ser exatamente sinal de que a
  // linha mudou por baixo (perfil excluído/alterado por outra sessão etc.).
  onFeito?: () => void;
};

// Perfil novo nasce zerado: a pessoa escolhe página por página. Perfil com a
// matriz toda "none" é legítimo (cai na tela /sem-acesso, que é terminal).
function paginasIniciais(perfil: PerfilRow | undefined): Record<PageKey, PageAccess> {
  return (
    perfil?.paginas ??
    (Object.fromEntries(PAGE_KEYS.map((key) => [key, "none"])) as Record<
      PageKey,
      PageAccess
    >)
  );
}

const LABEL_ACESSO: Record<PageAccess, string> = {
  none: "Nenhum",
  read: "Leitura",
  write: "Edição",
};

export function PerfilDialog({ perfil, onSucesso, onAbrir, onFeito }: Props) {
  const { acesso, refresh } = useAcesso();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState(perfil?.nome ?? "");
  const [descricao, setDescricao] = useState(perfil?.descricao ?? "");
  const [paginas, setPaginas] = useState<Record<PageKey, PageAccess>>(() =>
    paginasIniciais(perfil),
  );
  const [erro, setErro] = useState<string | null>(null);

  const editar = Boolean(perfil);
  // Perfis de sistema (os seeds do 001_core) são só leitura na UI; o servidor
  // (Edge Function) valida de novo.
  const travado = perfil?.isSystem === true;

  // Ressincroniza o formulário com as props toda vez que o diálogo abre — sem
  // isso, fechar sem salvar e reabrir (ou reabrir após um recarregamento de
  // lista) mostra o estado antigo do submit anterior em vez do valor
  // persistido. Roda no handler de abertura, não num efeito: abrir é um
  // evento, não sincronização com sistema externo, e setState em efeito
  // dispara render em cascata (react-hooks/set-state-in-effect).
  const recarregarCampos = () => {
    setNome(perfil?.nome ?? "");
    setDescricao(perfil?.descricao ?? "");
    setPaginas(paginasIniciais(perfil));
    setErro(null);
  };

  const submit = () =>
    startTransition(async () => {
      const res = editar
        ? await authAdmin("atualizar_perfil", { perfilId: perfil!.id, nome, descricao, paginas })
        : await authAdmin("criar_perfil", { nome, descricao, paginas });
      if (res.ok) {
        setErro(null);
        setOpen(false);
        // A Edge Function não devolve mensagem pronta (ao contrário da Server
        // Action do sabor Next) — só {ok:true}. A cópia mora aqui, espelhando
        // next/lib/actions/usuarios.ts (criarPerfil/atualizarPerfil).
        onSucesso?.(editar ? "Perfil atualizado." : "Perfil criado.");
        // Editar o PRÓPRIO perfil (o perfil ao qual o usuário logado pertence)
        // muda o que a sessão enxerga — refresh() reavalia acesso.paginas pros
        // guards (RequirePage/RequireWrite). É exatamente o caso pro qual
        // AuthProvider.refresh() foi desenhado. manterConteudo:true: sem isso,
        // `loading` sobe, RequirePage devolve null, o Manager (que acabou de
        // trocar o aviso para "Perfil atualizado.") desmonta inteiro, e o
        // operador leva um flash em branco sem confirmação — na mutação de
        // maior consequência da tela, que é exatamente a que mudou as
        // permissões dele mesmo. É o mesmo usuário agindo de propósito sobre
        // o próprio perfil; RLS/Edge Function continuam sendo a autoridade
        // real, então a matriz antiga valer por um round-trip é inofensivo.
        if (editar && perfil!.id === acesso?.perfilId) {
          void refresh({ manterConteudo: true });
        }
      } else {
        setErro(res.error);
      }
      onFeito?.();
    });

  const nomeValido = nome.trim().length >= 2;
  // Edição na página "usuarios" = administrador total (vide o comentário de
  // escalonamento de privilégio no topo de spa/edge/auth-admin/index.ts).
  const viraAdmin = paginas["usuarios"] === "write";

  return (
    // Com a action em voo o diálogo não fecha (Esc e clique no overlay
    // inclusive): se fechasse, o setErro cairia num componente desmontado e a
    // falha sumiria sem aparecer em lugar nenhum — o erro mora aqui dentro, e
    // o banner de trás está coberto pelo modal.
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (pending) return;
        if (v) {
          recarregarCampos();
          onAbrir?.();
        }
        setOpen(v);
      }}
    >
      <DialogTrigger
        className={buttonVariants({ variant: editar ? "ghost" : "default", size: "sm" })}
      >
        {editar ? (travado ? "Ver" : "Editar") : "Novo perfil"}
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editar ? `Perfil: ${perfil!.nome}` : "Novo perfil"}
          </DialogTitle>
          <DialogDescription>
            {travado
              ? "Perfil de sistema — não editável."
              : 'Defina o acesso deste perfil em cada página. "Nenhum" tira a página do menu e bloqueia a rota; "Leitura" e "Edição" são o que as funções de gate do banco leem para liberar SELECT e escrita.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="perfil-nome">Nome</Label>
            <Input
              id="perfil-nome"
              value={nome}
              disabled={travado}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="perfil-descricao">Descrição</Label>
            <Input
              id="perfil-descricao"
              value={descricao}
              disabled={travado}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <div className="rounded-md border border-border">
            {PAGE_KEYS.map((key) => {
              const p = PAGES[key];
              return (
                <div
                  key={p.key}
                  className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0"
                >
                  <span className="text-sm">{p.label}</span>
                  {travado ? (
                    <span className="text-xs font-medium text-muted-foreground">
                      {LABEL_ACESSO[paginas[p.key]]}
                    </span>
                  ) : (
                    <Select
                      value={paginas[p.key]}
                      onValueChange={(v) =>
                        setPaginas((prev) => ({ ...prev, [p.key]: v as PageAccess }))
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        <SelectItem value="read">Leitura</SelectItem>
                        <SelectItem value="write">Edição</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {viraAdmin ? (
          <p className="text-sm text-destructive">
            ⚠ Edição em Usuários torna este perfil administrador total (pode criar e
            alterar qualquer usuário).
          </p>
        ) : null}
        {erro ? <p className="text-sm text-destructive">{erro}</p> : null}

        {!travado ? (
          <DialogFooter>
            <Button onClick={submit} disabled={pending || !nomeValido}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// auth-kit v0.1 — spa/components/usuarios/UsuarioDialog.tsx
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
import type { PerfilRow, UsuarioRow } from "./UsuariosPerfisManager";

// Checagem propositalmente simples (não reimplementa RFC 5322) — só o
// suficiente pra casar com a intenção de validação server-side (a Edge
// Function usa a mesma EMAIL_RE) e habilitar o botão na mesma condição.
const EMAIL_PLAUSIVEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  perfis: PerfilRow[];
  usuario?: UsuarioRow;
  // O diálogo fecha no sucesso, então a mensagem sobe pra quem o renderizou.
  // O erro fica inline aqui embaixo: com o modal aberto, nada atrás dele é visível.
  onSucesso?: (mensagem: string) => void;
  // Disparado ao abrir, pra quem renderiza limpar feedback antigo da tela.
  onAbrir?: () => void;
  // Disparado depois de TODA tentativa de submit (sucesso ou falha) — não há
  // revalidatePath num SPA; isto é o que recarrega a lista do Manager. Chamado
  // também na falha porque um erro aqui pode ser exatamente sinal de que a
  // linha mudou por baixo (perfil excluído por outra sessão etc.).
  onFeito?: () => void;
};

export function UsuarioDialog({
  perfis,
  usuario,
  onSucesso,
  onAbrir,
  onFeito,
}: Props) {
  const { acesso, refresh } = useAcesso();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [perfilId, setPerfilId] = useState(usuario?.perfilId ?? "");
  const [erro, setErro] = useState<string | null>(null);

  const editar = Boolean(usuario);
  // "Quem sou eu" tem uma única fonte: acesso.userId do hook (o Manager
  // também deriva o dele do mesmo lugar) — não duplicar via prop.
  const propriaLinha = editar && usuario!.id === acesso?.userId;

  // Ressincroniza o formulário com as props toda vez que o diálogo abre — sem
  // isso, o estado do submit anterior (ou de outra linha, no caso do botão
  // "Novo usuário" que é uma instância só) sobrevive ao fechar/reabrir.
  // Roda no handler de abertura, não num efeito: abrir é um evento, não
  // sincronização com sistema externo, e setState em efeito dispara render em
  // cascata (react-hooks/set-state-in-effect).
  const recarregarCampos = () => {
    setNome(usuario?.nome ?? "");
    setEmail(usuario?.email ?? "");
    setPerfilId(usuario?.perfilId ?? "");
    setErro(null);
  };

  const submit = () =>
    startTransition(async () => {
      const res = editar
        ? await authAdmin("atualizar_usuario", { userId: usuario!.id, nome, perfilId })
        : await authAdmin("criar_usuario", { nome, email, perfilId });
      if (res.ok) {
        setErro(null);
        setOpen(false);
        // A Edge Function não devolve mensagem pronta (ao contrário da Server
        // Action do sabor Next) — só `data`. A cópia mora aqui, espelhando
        // next/lib/actions/usuarios.ts (criarUsuario/atualizarUsuario).
        const jaTinhaConta = (res.data as { jaTinhaConta?: boolean } | undefined)?.jaTinhaConta;
        const mensagem = editar
          ? "Usuário atualizado."
          : jaTinhaConta
            ? "Acesso liberado. A pessoa já tinha conta — basta entrar pelo login com o email dela."
            : "Convite enviado por email. Se o link não abrir o destaque-mensal-pro, a pessoa pode entrar direto pela tela de login com esse mesmo email.";
        onSucesso?.(mensagem);
        // Editar o próprio usuário pode mudar o que a sessão enxerga — refresh()
        // reavalia acesso.paginas pros guards (RequirePage/RequireWrite). Hoje o
        // seletor de perfil já vem travado pra própria linha, então só o nome
        // muda nesse caso — mas chamamos de qualquer forma: é o mesmo raciocínio
        // do PerfilDialog abaixo, e é barato. manterConteudo:true porque é o
        // MESMO usuário, agindo de propósito sobre si mesmo — levantar
        // `loading` aqui desmontaria a árvore inteira (RequirePage devolve
        // null) bem no instante em que o aviso "Usuário atualizado." acabou
        // de aparecer, apagando a confirmação da própria ação.
        if (editar && usuario!.id === acesso?.userId) {
          void refresh({ manterConteudo: true });
        }
      } else {
        setErro(res.error);
      }
      onFeito?.();
    });

  const nomeValido = nome.trim().length >= 2;
  const emailValido = editar || EMAIL_PLAUSIVEL.test(email.trim());
  const podeSalvar = nomeValido && Boolean(perfilId) && emailValido;

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
        {editar ? "Editar" : "Novo usuário"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editar ? "Editar usuário" : "Novo usuário"}</DialogTitle>
          <DialogDescription>
            {editar
              ? "Altere nome ou perfil de permissão."
              : "A pessoa recebe um convite por email e entra pelo login com magic link."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="usuario-nome">Nome</Label>
            <Input
              id="usuario-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="usuario-email">Email</Label>
            <Input
              id="usuario-email"
              type="email"
              value={email}
              disabled={editar}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Perfil de permissão</Label>
            <Select
              value={perfilId}
              onValueChange={(v) => setPerfilId(v ?? "")}
              disabled={propriaLinha}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha um perfil" />
              </SelectTrigger>
              <SelectContent>
                {perfis.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {propriaLinha ? (
              <p className="text-xs text-muted-foreground">
                Você não pode alterar o próprio perfil de permissão.
              </p>
            ) : null}
          </div>
        </div>

        {erro ? <p className="text-sm text-destructive">{erro}</p> : null}

        <DialogFooter>
          <Button onClick={submit} disabled={pending || !podeSalvar}>
            {pending ? "Salvando..." : editar ? "Salvar" : "Convidar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

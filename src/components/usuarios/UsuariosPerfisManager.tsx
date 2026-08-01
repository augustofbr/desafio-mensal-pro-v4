// auth-kit v0.1 — spa/components/usuarios/UsuariosPerfisManager.tsx
import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authAdmin, type AuthAdminResult } from "@/auth/authAdmin";
import { useAcesso } from "@/auth/acesso";
import { PAGES, PAGE_KEYS, type PageAccess, type PageKey } from "@/lib/pages";
import { UsuarioDialog } from "./UsuarioDialog";
import { PerfilDialog } from "./PerfilDialog";

// Data/hora local do navegador. Inline aqui (em vez de um helper de formatação
// do app) para o kit não depender de nada fora dele — mesmo tratamento do
// sabor Next.
const DATETIME = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return DATETIME.format(d);
}

// Não existe next/lib/queries/usuarios.ts no sabor SPA (não há servidor pra
// rodar a query) — os shapes vivem aqui, únicos consumidores são os dois
// diálogos deste diretório, que os importam deste módulo.
export type UsuarioRow = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  perfilId: string;
  perfilNome: string;
  ultimoAcesso: string | null;
};

export type PerfilRow = {
  id: string;
  nome: string;
  descricao: string | null;
  paginas: Record<PageKey, PageAccess>;
  isSystem: boolean;
  totalUsuarios: number;
};

// A Edge Function devolve `paginas` cru (Record<string,string>) — ela não tem
// acesso ao registry de páginas do app (é deployada avulsa). A normalização
// por PAGE_KEYS é responsabilidade do cliente, que é quem tem o registry:
// chave AUSENTE vira "none"; um valor PRESENTE passa direto, seja ele válido
// ("read"/"write") ou não — esta função não valida o conteúdo, só preenche
// buracos. Quem valida de verdade é o CHECK destaque_matriz_valida no banco;
// isto é inerte na prática, mas é exatamente o que o código faz — mesmo
// comportamento de normalizarMatriz() em next/lib/queries/usuarios.ts.
function normalizarMatriz(raw: Record<string, string> | null | undefined): Record<PageKey, PageAccess> {
  const matriz = (raw ?? {}) as Partial<Record<PageKey, PageAccess>>;
  return Object.fromEntries(
    PAGE_KEYS.map((k) => [k, matriz[k] ?? "none"]),
  ) as Record<PageKey, PageAccess>;
}

type CarregarResultado =
  | { ok: true; usuarios: UsuarioRow[]; perfis: PerfilRow[] }
  | { ok: false; error: string };

async function carregarListas(): Promise<CarregarResultado> {
  const [resU, resP] = await Promise.all([
    authAdmin("listar_usuarios"),
    authAdmin("listar_perfis"),
  ]);
  if (!resU.ok) return { ok: false, error: resU.error };
  if (!resP.ok) return { ok: false, error: resP.error };
  const usuarios = (resU.data as UsuarioRow[] | undefined) ?? [];
  const perfisRaw = (resP.data as (Omit<PerfilRow, "paginas"> & {
    paginas: Record<string, string>;
  })[] | undefined) ?? [];
  const perfis = perfisRaw.map((p) => ({ ...p, paginas: normalizarMatriz(p.paginas) }));
  return { ok: true, usuarios, perfis };
}

type StatusLista = "carregando" | "erro" | "ok";

// Colapsa a cadeia carregando/erro/vazio que, sem isto, se repetiria quatro
// vezes (mobile × desktop, usuários × perfis) — a fonte de boa parte do
// crescimento deste arquivo em relação ao Next (que nunca precisa disso: os
// dados chegam prontos via server component, sem estado de carregamento
// nenhum). Renderiza a MENSAGEM (carregando/erro-com-retry/vazio); o
// chamador decide o envelope (card empilhado no mobile, TableRow no
// desktop) e só entra no `.map` de verdade quando isto devolve `null`
// (status "ok" e a lista não está vazia).
function EstadoLista({
  status,
  erro,
  vazio,
  mensagemVazio,
  entidade,
  onTentarDeNovo,
  variant,
  colSpan,
}: {
  status: StatusLista;
  erro: string | null;
  vazio: boolean;
  mensagemVazio: string;
  entidade: string;
  onTentarDeNovo: () => void;
  variant: "mobile" | "desktop";
  colSpan?: number;
}) {
  let conteudo: ReactNode;
  let ehErro = false;
  if (status === "carregando") {
    conteudo = "Carregando…";
  } else if (status === "erro") {
    ehErro = true;
    conteudo = (
      <>
        Falha ao carregar {entidade}: {erro}
        <div className="mt-2">
          <Button variant="outline" size="sm" onClick={onTentarDeNovo}>
            Tentar de novo
          </Button>
        </div>
      </>
    );
  } else if (vazio) {
    conteudo = mensagemVazio;
  } else {
    return null;
  }

  if (variant === "mobile") {
    return (
      <div
        className={
          ehErro
            ? "rounded-2xl border border-destructive/50 bg-card p-6 text-center text-sm text-destructive"
            : "rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground"
        }
      >
        {conteudo}
      </div>
    );
  }
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className={
          ehErro
            ? "py-8 text-center text-sm text-destructive"
            : "py-8 text-center text-sm text-muted-foreground"
        }
      >
        {conteudo}
      </TableCell>
    </TableRow>
  );
}

export function UsuariosPerfisManager() {
  const { acesso } = useAcesso();
  const [pending, startTransition] = useTransition();
  // Sink único de feedback da tela (os diálogos reportam o sucesso aqui pelo
  // onSucesso; o erro deles fica inline, atrás do modal nada seria visível).
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(
    null,
  );
  const avisoOk = (texto: string) => setAviso({ tipo: "ok", texto });
  // Abrir um diálogo limpa o feedback anterior — senão um "Perfil criado." de
  // dois minutos atrás fica na tela como se fosse o resultado da ação atual.
  const limparAviso = () => setAviso(null);

  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [perfis, setPerfis] = useState<PerfilRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Não há revalidatePath num SPA: os dados vivem em estado local que só
  // reflete a realidade no instante em que foram buscados. `carregar` é a
  // única fonte de verdade — chamada no mount e depois de TODA tentativa de
  // mutação (sucesso OU falha, ver `run`/os diálogos), porque uma falha aqui
  // pode ser exatamente sinal de que a linha mudou por baixo (foi excluída,
  // reatribuída etc. por outra sessão) — recarregar é o que evita deixar o
  // operador olhando pra uma tela desatualizada como se fosse a verdade atual.
  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await carregarListas();
    if (res.ok) {
      setLoadError(null);
      setUsuarios(res.usuarios);
      setPerfis(res.perfis);
    } else {
      // Não zera `usuarios`/`perfis` — um erro de rede não deve fazer a
      // tabela aparentar "0 usuários" (mentira). `statusLista === "erro"`
      // curto-circuita antes do `.map` nas quatro cadeias abaixo, então a
      // faixa de erro SUBSTITUI as linhas (não convive com elas na tela) —
      // mas nunca cai na mensagem de vazio, que é a confusão que isto evita.
      setLoadError(res.error);
    }
    setLoading(false);
  }, []);

  // setState roda dentro da função assíncrona chamada pelo efeito (no corpo
  // do próprio carregar, após os awaits), não de forma síncrona no corpo do
  // efeito. IMPORTANTE: `void carregar()` direto (sem a IIFE abaixo) dispara
  // react-hooks/set-state-in-effect em eslint-plugin-react-hooks >=6 (a
  // análise estática rastreia a função nomeada de escopo do componente e
  // enxerga o setState nela, mesmo depois de um await) — verificado
  // empiricamente contra 7.1.1. Embrulhar a chamada numa IIFE assíncrona
  // inline é o que o rastreamento não atravessa; `.then()`/`.catch()`
  // apontando pra `carregar` direto tem o mesmo problema de `void carregar()`.
  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  const run = (fn: () => Promise<AuthAdminResult>, mensagemOk: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setAviso({ tipo: "ok", texto: mensagemOk });
      } else {
        setAviso({ tipo: "erro", texto: res.error });
      }
      await carregar();
    });

  // Hooks acima são sempre chamados, na mesma ordem, independente de `acesso`
  // — o retorno condicional vem só depois de todos declarados. Na prática
  // RequirePage (guards.tsx) já garante `acesso` presente com alguma página
  // liberada antes de montar este componente; esta é só uma guarda de tipos.
  if (!acesso) return null;

  const meuUserId = acesso.userId;
  // "Admin" no kit é exatamente isto: write na página "usuarios". Não existe
  // coluna de cargo no banco — a matriz é a única fonte de autorização. Isto
  // decide só o que RENDERIZAR (mostrar/esconder "Novo usuário", "Editar",
  // "Desativar", "Excluir") — não é enforcement. O enforcement real é a
  // Edge Function (que revalida "write" em "usuarios" no servidor antes de
  // qualquer mutação) e o RLS do banco, exatamente como o comentário no topo
  // de AuthProvider.tsx e o de PerfilDialog.tsx já documentam.
  const podeEditar = acesso.paginas["usuarios"] === "write";

  const statusLista = loading ? "carregando" : loadError ? "erro" : "ok";

  return (
    <>
      {/* Sem servidor não há o header que next/app/usuarios/page.tsx monta em
          volta do Manager — ele mora aqui, que é quem conhece `podeEditar`.
          A explicação de somente-leitura é a parte que importa: sem ela, um
          operador com "read" vê uma tabela sem nenhum botão e nenhuma pista
          do porquê. */}
      <header className="mb-4 flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Usuários e Perfis</h1>
        <p className="text-sm text-muted-foreground">{PAGES["usuarios"].resumo}</p>
        {!podeEditar ? (
          <p className="text-sm text-muted-foreground">
            Somente leitura. Seu perfil não tem permissão de edição nesta página.
          </p>
        ) : null}
      </header>

      {aviso ? (
        <p
          // Erro precisa interromper o leitor de tela (assertive); sucesso não.
          role={aviso.tipo === "erro" ? "alert" : "status"}
          className={
            aviso.tipo === "ok"
              ? "mb-3 text-sm text-muted-foreground"
              : "mb-3 text-sm text-destructive"
          }
        >
          {aviso.texto}
        </p>
      ) : null}

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="perfis">Perfis</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="mt-4">
          {podeEditar ? (
            <div className="mb-3 flex justify-end">
              <UsuarioDialog
                perfis={perfis}
                onSucesso={avisoOk}
                onAbrir={limparAviso}
                onFeito={carregar}
              />
            </div>
          ) : null}

          {/* Mobile: cards empilhados (md:hidden). */}
          <div className="flex flex-col gap-2.5 md:hidden">
            <EstadoLista
              status={statusLista}
              erro={loadError}
              vazio={usuarios.length === 0}
              mensagemVazio="Nenhum usuário cadastrado."
              entidade="usuários"
              onTentarDeNovo={() => void carregar()}
              variant="mobile"
            />
            {statusLista === "ok" &&
              usuarios.map((u) => (
                <div
                  key={u.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold">{u.nome}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {u.email}
                      </div>
                    </div>
                    {u.ativo ? (
                      <Badge>Ativo</Badge>
                    ) : (
                      <Badge variant="outline">Desativado</Badge>
                    )}
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Perfil</span>
                      <div className="mt-0.5">
                        <Badge variant="secondary">{u.perfilNome}</Badge>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Último acesso</span>
                      <div className="mt-0.5 font-medium">
                        {u.ultimoAcesso ? formatDateTime(u.ultimoAcesso) : "Nunca entrou"}
                      </div>
                    </div>
                  </div>
                  {podeEditar ? (
                    <div className="mt-3 flex items-center gap-2">
                      <UsuarioDialog
                        perfis={perfis}
                        usuario={u}
                        onSucesso={avisoOk}
                        onAbrir={limparAviso}
                        onFeito={carregar}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending || u.id === meuUserId}
                        onClick={() =>
                          run(
                            () => authAdmin("alternar_ativo", { userId: u.id, ativo: !u.ativo }),
                            u.ativo ? "Usuário desativado." : "Usuário reativado.",
                          )
                        }
                      >
                        {u.ativo ? "Desativar" : "Reativar"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
          </div>

          {/* Desktop: tabela (hidden em mobile). */}
          <div className="hidden rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead>Status</TableHead>
                  {podeEditar ? <TableHead className="text-right">Ações</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                <EstadoLista
                  status={statusLista}
                  erro={loadError}
                  vazio={usuarios.length === 0}
                  mensagemVazio="Nenhum usuário cadastrado."
                  entidade="usuários"
                  onTentarDeNovo={() => void carregar()}
                  variant="desktop"
                  colSpan={podeEditar ? 6 : 5}
                />
                {statusLista === "ok" &&
                  usuarios.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{u.perfilNome}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.ultimoAcesso ? formatDateTime(u.ultimoAcesso) : "Nunca entrou"}
                      </TableCell>
                      <TableCell>
                        {u.ativo ? (
                          <Badge>Ativo</Badge>
                        ) : (
                          <Badge variant="outline">Desativado</Badge>
                        )}
                      </TableCell>
                      {podeEditar ? (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <UsuarioDialog
                              perfis={perfis}
                              usuario={u}
                              onSucesso={avisoOk}
                              onAbrir={limparAviso}
                              onFeito={carregar}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={pending || u.id === meuUserId}
                              onClick={() =>
                                run(
                                  () =>
                                    authAdmin("alternar_ativo", {
                                      userId: u.id,
                                      ativo: !u.ativo,
                                    }),
                                  u.ativo ? "Usuário desativado." : "Usuário reativado.",
                                )
                              }
                            >
                              {u.ativo ? "Desativar" : "Reativar"}
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="perfis" className="mt-4">
          {podeEditar ? (
            <div className="mb-3 flex justify-end">
              <PerfilDialog onSucesso={avisoOk} onAbrir={limparAviso} onFeito={carregar} />
            </div>
          ) : null}

          {/* Mobile: cards empilhados (md:hidden). */}
          <div className="flex flex-col gap-2.5 md:hidden">
            <EstadoLista
              status={statusLista}
              erro={loadError}
              vazio={perfis.length === 0}
              mensagemVazio="Nenhum perfil cadastrado."
              entidade="perfis"
              onTentarDeNovo={() => void carregar()}
              variant="mobile"
            />
            {statusLista === "ok" &&
              perfis.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold">
                        {p.nome}{" "}
                        {p.isSystem ? (
                          <Badge variant="outline" className="ml-1">
                            sistema
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {p.descricao ?? "—"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 text-xs">
                    <span className="text-muted-foreground">Usuários</span>
                    <div className="mt-0.5 font-medium">{p.totalUsuarios}</div>
                  </div>
                  {podeEditar ? (
                    <div className="mt-3 flex items-center gap-2">
                      <PerfilDialog
                        perfil={p}
                        onSucesso={avisoOk}
                        onAbrir={limparAviso}
                        onFeito={carregar}
                      />
                      {/* O title fica no span, não no Button: botão desabilitado
                          tem pointer-events:none e nunca dispara o tooltip. */}
                      {!p.isSystem ? (
                        <span
                          title={
                            p.totalUsuarios > 0
                              ? "Perfil em uso — mova os usuários antes de excluir."
                              : undefined
                          }
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending || p.totalUsuarios > 0}
                            onClick={() =>
                              run(() => authAdmin("excluir_perfil", { perfilId: p.id }), "Perfil excluído.")
                            }
                          >
                            Excluir
                          </Button>
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
          </div>

          {/* Desktop: tabela (hidden em mobile). */}
          <div className="hidden rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Usuários</TableHead>
                  {podeEditar ? <TableHead className="text-right">Ações</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                <EstadoLista
                  status={statusLista}
                  erro={loadError}
                  vazio={perfis.length === 0}
                  mensagemVazio="Nenhum perfil cadastrado."
                  entidade="perfis"
                  onTentarDeNovo={() => void carregar()}
                  variant="desktop"
                  colSpan={podeEditar ? 4 : 3}
                />
                {statusLista === "ok" &&
                  perfis.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.nome}{" "}
                        {p.isSystem ? (
                          <Badge variant="outline" className="ml-1">
                            sistema
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.descricao ?? "—"}
                      </TableCell>
                      <TableCell>{p.totalUsuarios}</TableCell>
                      {podeEditar ? (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <PerfilDialog
                              perfil={p}
                              onSucesso={avisoOk}
                              onAbrir={limparAviso}
                              onFeito={carregar}
                            />
                            {!p.isSystem ? (
                              <span
                                title={
                                  p.totalUsuarios > 0
                                    ? "Perfil em uso — mova os usuários antes de excluir."
                                    : undefined
                                }
                              >
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={pending || p.totalUsuarios > 0}
                                  onClick={() =>
                                    run(
                                      () => authAdmin("excluir_perfil", { perfilId: p.id }),
                                      "Perfil excluído.",
                                    )
                                  }
                                >
                                  Excluir
                                </Button>
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

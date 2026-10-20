/**
 * Trava do lote de criação de contas, FORA do componente: trocar de aba da tela de usuários
 * desmonta a seção (TabsContent do Radix) mas o loop continua; ao voltar, a seção nova lê
 * este estado e não deixa começar um segundo lote por cima. Também protege o duplo clique
 * (a checagem e a marcação são síncronas) e avisa o navegador se a página for fechada no meio.
 */
let emAndamento = false;
const assinantes = new Set<() => void>();

const avisarAoSair = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  e.returnValue = "";
};

function notificar() {
  assinantes.forEach((cb) => cb());
}

export function loteEmAndamento(): boolean {
  return emAndamento;
}

/** true se conseguiu a vez; false se já há um lote rodando. */
export function iniciarLote(): boolean {
  if (emAndamento) return false;
  emAndamento = true;
  if (typeof window !== "undefined") window.addEventListener("beforeunload", avisarAoSair);
  notificar();
  return true;
}

export function encerrarLote(): void {
  const estava = emAndamento;
  emAndamento = false;
  if (typeof window !== "undefined") window.removeEventListener("beforeunload", avisarAoSair);
  if (estava) notificar();
}

/** Para `useSyncExternalStore`. */
export function assinarLote(cb: () => void): () => void {
  assinantes.add(cb);
  return () => {
    assinantes.delete(cb);
  };
}

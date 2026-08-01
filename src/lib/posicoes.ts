/**
 * Posicoes de ranking — a UNICA fonte da regra de empate do dashboard.
 *
 * Antes cada tela numerava do seu jeito: o ranking antigo usava `index + 1`
 * (dois empatados viravam 1o e 2o) e a Corrida dividia a posicao. Duas telas
 * lado a lado davam numeros diferentes para a mesma pessoa.
 */

/**
 * Posicao 1-based de cada valor de uma lista **ja ordenada** (decrescente).
 * Empate repete a posicao e quem vem depois pula os lugares ocupados:
 * `[10, 8, 8, 5]` → `[1, 2, 2, 4]`.
 *
 * Nao ordena nem julga se a corrida comecou: lista toda zerada devolve todo
 * mundo em 1o, e cabe a quem exibe decidir se aquilo e podio ou mes vazio.
 */
const MEDALHAS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/**
 * Medalha do pódio, ou `null` quando não há pódio a comemorar.
 *
 * Honra exige pontuação positiva: quem não atendeu no período continua com a
 * posição honesta ("2º"), mas sem medalha — prata para zero ponto premiaria
 * quem não correu. Mesma filosofia do pódio falso do mês recém-aberto.
 */
export function medalhaPara(posicao: number, valor: number): string | null {
  if (valor <= 0) return null;
  return MEDALHAS[posicao] ?? null;
}

export function calcularPosicoes(valores: number[]): number[] {
  const posicoes: number[] = [];
  let posicaoAnterior = 0;
  let valorAnterior: number | null = null;

  for (let i = 0; i < valores.length; i++) {
    const valor = valores[i];
    const posicao =
      valorAnterior !== null && valor === valorAnterior ? posicaoAnterior : i + 1;

    posicoes.push(posicao);
    posicaoAnterior = posicao;
    valorAnterior = valor;
  }

  return posicoes;
}

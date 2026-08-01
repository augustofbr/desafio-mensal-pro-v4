/**
 * Card compartilhavel do resultado pessoal — desenho em canvas 2D puro.
 *
 * Depende do DOM (canvas, getComputedStyle, navigator.share), entao nao entra no
 * vitest, que roda em ambiente node. A validacao e por smoke: gerar o PNG e
 * abrir o arquivo.
 *
 * PRIVACIDADE (spec §4.5): o card so mostra numeros de quem o gerou. Nenhum nome,
 * pontuacao ou posicao de terceiros — nem a da lider — entra na imagem.
 */

/** Espelho de `MetaItem` (`src/lib/metaProgress.ts`) — os campos que a imagem usa. */
export interface MetaDoCard {
  rotulo: string;
  atual: number;
  alvo: number;
  /** 0..100, ja com clamp. */
  pct: number;
  batida: boolean;
  /**
   * Meta de faturamento: aparece como percentual, nunca em reais — mesma
   * convencao do MeuCartao e do PremiacaoPanel.
   */
  percentual?: boolean;
}

export interface DadosCard {
  apelido: string;
  categoria: string;
  /** Posicao 1-based na categoria. So a propria; ninguem mais aparece. */
  posicao: number;
  /** Ja formatado com unidade pelo componente ("128 pts", "88,4%"). */
  pontosTexto: string;
  /** TODAS as metas da categoria, na ordem em que a tela as mostra. */
  metas: MetaDoCard[];
  mesLabel: string;
}

/** Quadrado de 1080: formato de story/post, bom em qualquer app de mensagem. */
const TAMANHO = 1080;
const MARGEM = 88;
const LARGURA_CONTEUDO = TAMANHO - MARGEM * 2;

const FAMILIA_TEXTO = "'DM Sans', system-ui, -apple-system, sans-serif";
const FAMILIA_NUMERO = "'DM Mono', ui-monospace, monospace";

const MEDALHAS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

interface Hsl {
  h: number;
  s: number;
  l: number;
}

/**
 * Fallback identico ao bloco `:root` de `src/index.css`. So entra em cena se a
 * leitura da variavel falhar (CSS ainda nao aplicado, valor em outro formato).
 */
const PRIMARY_PADRAO: Hsl = { h: 346, s: 77, l: 50 };
const TEXTO_PADRAO: Hsl = { h: 0, s: 0, l: 100 };

interface Paleta {
  primary: Hsl;
  /** Cor do texto sobre a marca (--primary-foreground). */
  texto: Hsl;
}

/** "346 77% 50%" ou "346, 77%, 50%" -> {h,s,l}. Outros formatos -> null. */
function parseHsl(valor: string): Hsl | null {
  const partes = valor
    .trim()
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((parte) => Number.parseFloat(parte));

  if (partes.length < 3) return null;
  const [h, s, l] = partes;
  if (![h, s, l].every((numero) => Number.isFinite(numero))) return null;
  return { h, s, l };
}

function hsla(cor: Hsl, alpha = 1): string {
  if (alpha >= 1) return `hsl(${cor.h}, ${cor.s}%, ${cor.l}%)`;
  return `hsla(${cor.h}, ${cor.s}%, ${cor.l}%, ${alpha})`;
}

/** Mesma matiz, luminosidade deslocada — usado nas pontas do gradiente. */
function comLuminosidade(cor: Hsl, delta: number): Hsl {
  return { ...cor, l: Math.min(100, Math.max(0, cor.l + delta)) };
}

/**
 * Cores da marca a partir das variaveis CSS — nada de hex duplicado aqui.
 *
 * O card e SEMPRE claro (a imagem sai igual para todo mundo, independente do
 * tema de quem gerou), entao a classe `.dark` sai do `<html>` durante a leitura
 * e volta no `finally`. A remocao e a leitura acontecem na mesma tarefa do
 * event loop: o navegador recalcula estilo, mas nao chega a pintar — quem esta
 * olhando a tela nao ve piscada.
 */
function lerPaleta(): Paleta {
  const raiz = document.documentElement;
  const estavaEscuro = raiz.classList.contains("dark");
  if (estavaEscuro) raiz.classList.remove("dark");

  try {
    const estilo = getComputedStyle(raiz);
    return {
      primary: parseHsl(estilo.getPropertyValue("--primary")) ?? PRIMARY_PADRAO,
      texto: parseHsl(estilo.getPropertyValue("--primary-foreground")) ?? TEXTO_PADRAO,
    };
  } finally {
    if (estavaEscuro) raiz.classList.add("dark");
  }
}

function fonteTexto(tamanho: number, peso: number): string {
  return `${peso} ${tamanho}px ${FAMILIA_TEXTO}`;
}

function fonteNumero(tamanho: number, peso: number): string {
  return `${peso} ${tamanho}px ${FAMILIA_NUMERO}`;
}

/**
 * Diminui a fonte ate o texto caber na largura; devolve o tamanho aplicado
 * (a fonte ja fica setada no contexto).
 */
function ajustarFonte(
  ctx: CanvasRenderingContext2D,
  texto: string,
  larguraMax: number,
  tamanhoInicial: number,
  tamanhoMinimo: number,
  montarFonte: (tamanho: number) => string
): number {
  let tamanho = tamanhoInicial;
  ctx.font = montarFonte(tamanho);
  while (ctx.measureText(texto).width > larguraMax && tamanho > tamanhoMinimo) {
    tamanho -= 4;
    ctx.font = montarFonte(tamanho);
  }
  return tamanho;
}

/** Corta com reticencias quando nem no menor tamanho o texto cabe. */
function truncar(
  ctx: CanvasRenderingContext2D,
  texto: string,
  larguraMax: number
): string {
  if (ctx.measureText(texto).width <= larguraMax) return texto;

  const letras = Array.from(texto);
  while (letras.length > 1) {
    letras.pop();
    const tentativa = `${letras.join("").trimEnd()}…`;
    if (ctx.measureText(tentativa).width <= larguraMax) return tentativa;
  }
  return "…";
}

/** `ctx.letterSpacing` ainda nao e universal; o espacamento vai na mao. */
function desenharTextoEspacado(
  ctx: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  espacamento: number
): void {
  let cursor = x;
  for (const letra of Array.from(texto)) {
    ctx.fillText(letra, cursor, y);
    cursor += ctx.measureText(letra).width + espacamento;
  }
}

/** `ctx.roundRect` so existe em navegadores recentes; caminho manual. */
function caminhoArredondado(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  largura: number,
  altura: number,
  raio: number
): void {
  const r = Math.min(raio, largura / 2, altura / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + largura - r, y);
  ctx.quadraticCurveTo(x + largura, y, x + largura, y + r);
  ctx.lineTo(x + largura, y + altura - r);
  ctx.quadraticCurveTo(x + largura, y + altura, x + largura - r, y + altura);
  ctx.lineTo(x + r, y + altura);
  ctx.quadraticCurveTo(x, y + altura, x, y + altura - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.closePath();
}

function preencherArredondado(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  largura: number,
  altura: number,
  raio: number,
  cor: string
): void {
  caminhoArredondado(ctx, x, y, largura, altura, raio);
  ctx.fillStyle = cor;
  ctx.fill();
}

function desenharFundo(ctx: CanvasRenderingContext2D, paleta: Paleta): void {
  const gradiente = ctx.createLinearGradient(0, 0, TAMANHO, TAMANHO);
  gradiente.addColorStop(0, hsla(comLuminosidade(paleta.primary, 8)));
  gradiente.addColorStop(0.55, hsla(paleta.primary));
  gradiente.addColorStop(1, hsla(comLuminosidade(paleta.primary, -22)));
  ctx.fillStyle = gradiente;
  ctx.fillRect(0, 0, TAMANHO, TAMANHO);

  // Brilho suave no canto superior: tira o ar de "fundo chapado" sem virar ruido.
  const brilho = ctx.createRadialGradient(300, 180, 0, 300, 180, 620);
  brilho.addColorStop(0, hsla(paleta.texto, 0.22));
  brilho.addColorStop(1, hsla(paleta.texto, 0));
  ctx.fillStyle = brilho;
  ctx.fillRect(0, 0, TAMANHO, TAMANHO);
}

/** Selo com a posicao propria — a unica informacao de ranking na imagem. */
function desenharSelo(
  ctx: CanvasRenderingContext2D,
  paleta: Paleta,
  dados: DadosCard,
  y: number
): number {
  const medalha = MEDALHAS[dados.posicao];
  const texto = `${medalha ? `${medalha} ` : ""}${dados.posicao}º lugar em ${dados.categoria}`;
  const altura = 88;
  const padding = 34;

  ajustarFonte(ctx, texto, LARGURA_CONTEUDO - padding * 2, 40, 26, (tamanho) =>
    fonteTexto(tamanho, 600)
  );
  const largura = Math.min(
    LARGURA_CONTEUDO,
    ctx.measureText(texto).width + padding * 2
  );

  preencherArredondado(
    ctx,
    MARGEM,
    y,
    largura,
    altura,
    altura / 2,
    hsla(paleta.texto, 0.2)
  );

  ctx.fillStyle = hsla(paleta.texto);
  ctx.textBaseline = "middle";
  ctx.fillText(texto, MARGEM + padding, y + altura / 2 + 2);
  ctx.textBaseline = "alphabetic";

  return y + altura;
}

/**
 * Numero-heroi: valor em fonte monoespacada grande e a unidade ("pts") em texto
 * menor ao lado. Na mesma fonte e no mesmo corpo, a unidade competia com o
 * numero — que e o que a pessoa quer mostrar.
 */
function desenharHeroi(
  ctx: CanvasRenderingContext2D,
  paleta: Paleta,
  pontosTexto: string,
  y: number
): void {
  const separador = pontosTexto.indexOf(" ");
  const numero = separador > 0 ? pontosTexto.slice(0, separador) : pontosTexto;
  const unidade = separador > 0 ? pontosTexto.slice(separador + 1) : "";
  const espaco = 26;
  const proporcaoUnidade = 0.36;

  const larguraTotal = (tamanho: number): number => {
    ctx.font = fonteNumero(tamanho, 500);
    const largura = ctx.measureText(numero).width;
    if (!unidade) return largura;
    ctx.font = fonteTexto(Math.round(tamanho * proporcaoUnidade), 600);
    return largura + espaco + ctx.measureText(unidade).width;
  };

  let tamanho = 210;
  while (larguraTotal(tamanho) > LARGURA_CONTEUDO && tamanho > 96) tamanho -= 4;

  ctx.font = fonteNumero(tamanho, 500);
  ctx.fillStyle = hsla(paleta.texto);
  ctx.fillText(numero, MARGEM, y);
  if (!unidade) return;

  const larguraNumero = ctx.measureText(numero).width;
  ctx.font = fonteTexto(Math.round(tamanho * proporcaoUnidade), 600);
  ctx.fillStyle = hsla(paleta.texto, 0.85);
  ctx.fillText(unidade, MARGEM + larguraNumero + espaco, y);
}

/** Numeros no padrao do app: separador de milhar pt-BR a partir de 1.000. */
const FORMATO_INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const FORMATO_DECIMAL = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const ALTURA_BARRA = 28;
/** Da linha de texto (baseline) ate o topo da barra. */
const TEXTO_ATE_BARRA = 22;
/** Altura visual do texto acima da baseline, para centrar o bloco. */
const ALTURA_DO_TEXTO = 34;
/** Faixa vertical reservada as metas: entre o heroi e o filete do rodape. */
const METAS_TOPO = 700;
const METAS_BASE = 920;

/** Pedaco de texto com fonte e opacidade proprias, desenhado em sequencia. */
interface Segmento {
  texto: string;
  fonte: string;
  alpha: number;
}

/**
 * Valor da meta em segmentos: numeros em monoespacada (alinham entre as linhas),
 * o "de" em texto normal. Tudo em mono deixaria vaos largos demais em volta da
 * palavra.
 */
function segmentosDoValor(meta: MetaDoCard, tamanho: number, tamanhoRotulo: number): Segmento[] {
  if (meta.percentual) {
    return [
      { texto: `${FORMATO_DECIMAL.format(meta.pct)}%`, fonte: fonteNumero(tamanho, 500), alpha: 1 },
    ];
  }
  return [
    { texto: FORMATO_INTEIRO.format(meta.atual), fonte: fonteNumero(tamanho, 500), alpha: 1 },
    { texto: " de ", fonte: fonteTexto(tamanhoRotulo, 500), alpha: 0.85 },
    { texto: FORMATO_INTEIRO.format(meta.alvo), fonte: fonteNumero(tamanho, 500), alpha: 1 },
  ];
}

function larguraDosSegmentos(ctx: CanvasRenderingContext2D, segmentos: Segmento[]): number {
  return segmentos.reduce((total, segmento) => {
    ctx.font = segmento.fonte;
    return total + ctx.measureText(segmento.texto).width;
  }, 0);
}

function desenharSegmentos(
  ctx: CanvasRenderingContext2D,
  paleta: Paleta,
  segmentos: Segmento[],
  x: number,
  y: number
): number {
  let cursor = x;
  for (const segmento of segmentos) {
    ctx.font = segmento.fonte;
    ctx.fillStyle = hsla(paleta.texto, segmento.alpha);
    ctx.fillText(segmento.texto, cursor, y);
    cursor += ctx.measureText(segmento.texto).width;
  }
  return cursor;
}

/**
 * Uma meta: "Rotulo: atual de alvo" (+ ✅ quando batida) e a barra logo abaixo.
 * Rotulo em corpo menor e opacidade menor; numeros em monoespacada maior — o
 * numero e a noticia, o nome so situa (mesma licao do "pts" gigante do heroi).
 * Devolve o y do fim da barra.
 */
function desenharMeta(
  ctx: CanvasRenderingContext2D,
  paleta: Paleta,
  meta: MetaDoCard,
  yBaseline: number
): number {
  const tamanhoRotulo = 34;
  const tamanhoValor = 44;
  const espaco = 14;

  const valor = segmentosDoValor(meta, tamanhoValor, tamanhoRotulo);
  const larguraValor = larguraDosSegmentos(ctx, valor);
  const marca = meta.batida ? "✅" : "";

  ctx.font = fonteTexto(tamanhoRotulo, 500);
  const larguraMarca = marca ? ctx.measureText(marca).width + espaco : 0;
  // O rotulo cede espaco primeiro: os numeros e o ✅ nunca sao cortados.
  const rotulo = truncar(
    ctx,
    `${meta.rotulo.trim() || "Meta do mês"}:`,
    LARGURA_CONTEUDO - larguraValor - espaco - larguraMarca
  );

  ctx.fillStyle = hsla(paleta.texto, 0.85);
  ctx.fillText(rotulo, MARGEM, yBaseline);
  const depoisDoRotulo = MARGEM + ctx.measureText(rotulo).width + espaco;

  const fimDoValor = desenharSegmentos(ctx, paleta, valor, depoisDoRotulo, yBaseline);

  if (marca) {
    ctx.font = fonteTexto(tamanhoRotulo, 500);
    ctx.fillStyle = hsla(paleta.texto);
    ctx.fillText(marca, fimDoValor + espaco, yBaseline);
  }

  const pct = Math.min(100, Math.max(0, meta.pct));
  const topo = yBaseline + TEXTO_ATE_BARRA;
  preencherArredondado(
    ctx,
    MARGEM,
    topo,
    LARGURA_CONTEUDO,
    ALTURA_BARRA,
    ALTURA_BARRA / 2,
    hsla(paleta.texto, 0.28)
  );

  if (pct > 0) {
    // Piso de uma altura de barra: 1% ainda precisa virar um tracinho visivel,
    // senao a barra parece vazia e o numero da linha parece errado.
    const largura = Math.max(ALTURA_BARRA, (LARGURA_CONTEUDO * pct) / 100);
    preencherArredondado(
      ctx,
      MARGEM,
      topo,
      largura,
      ALTURA_BARRA,
      ALTURA_BARRA / 2,
      hsla(paleta.texto)
    );
  }

  return topo + ALTURA_BARRA;
}

/**
 * Todas as metas da categoria, empilhadas e centradas na faixa entre o heroi e o
 * rodape. Hoje sao 1 ou 2 (nenhuma categoria tem mais); com 3+ o respiro entre
 * elas encolhe para o bloco nao invadir o rodape.
 */
function desenharMetas(
  ctx: CanvasRenderingContext2D,
  paleta: Paleta,
  metas: MetaDoCard[]
): void {
  if (metas.length === 0) return;

  const respiro = metas.length > 2 ? 26 : 56;
  const alturaBloco =
    metas.length * (TEXTO_ATE_BARRA + ALTURA_BARRA) + (metas.length - 1) * respiro;
  const faixa = METAS_BASE - METAS_TOPO;
  const sobra = faixa - (alturaBloco + ALTURA_DO_TEXTO);

  let baseline = METAS_TOPO + Math.max(0, sobra / 2) + ALTURA_DO_TEXTO;
  for (const meta of metas) {
    baseline = desenharMeta(ctx, paleta, meta, baseline) + respiro;
  }
}

/**
 * Desenha o card 1080×1080 no canvas (offscreen ou nao).
 *
 * Chame `aguardarFontes()` antes: sem isso a primeira geracao sai com a fonte
 * de sistema, porque DM Sans/DM Mono vem do Google Fonts e carregam depois.
 */
export function desenharCard(canvas: HTMLCanvasElement, dados: DadosCard): void {
  canvas.width = TAMANHO;
  canvas.height = TAMANHO;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador");

  const paleta = lerPaleta();
  desenharFundo(ctx, paleta);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Marca no topo.
  ctx.font = fonteTexto(30, 600);
  ctx.fillStyle = hsla(paleta.texto, 0.8);
  desenharTextoEspacado(ctx, "STUDIO X", MARGEM, 148, 8);

  const fimDoSelo = desenharSelo(ctx, paleta, dados, 200);

  // Nome de quem gerou.
  const nome = dados.apelido.trim() || "Profissional";
  ajustarFonte(ctx, nome, LARGURA_CONTEUDO, 92, 52, (tamanho) => fonteTexto(tamanho, 700));
  ctx.fillStyle = hsla(paleta.texto);
  ctx.fillText(truncar(ctx, nome, LARGURA_CONTEUDO), MARGEM, fimDoSelo + 130);

  desenharHeroi(ctx, paleta, dados.pontosTexto, fimDoSelo + 350);

  desenharMetas(ctx, paleta, dados.metas);

  // Rodape: assinatura a esquerda, periodo a direita.
  ctx.fillStyle = hsla(paleta.texto, 0.3);
  ctx.fillRect(MARGEM, 936, LARGURA_CONTEUDO, 2);

  ctx.font = fonteTexto(32, 500);
  ctx.fillStyle = hsla(paleta.texto, 0.88);
  ctx.fillText("Profissional Destaque · Studio X", MARGEM, 1002);

  const mes = dados.mesLabel.trim();
  if (mes) {
    ctx.fillText(mes, TAMANHO - MARGEM - ctx.measureText(mes).width, 1002);
  }
}

/**
 * Espera as webfonts ficarem prontas. Sem isso o primeiro card sai com a fonte
 * de sistema — o canvas nao dispara carregamento de fonte por conta propria.
 */
export async function aguardarFontes(): Promise<void> {
  const fontes = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fontes?.ready) return;
  try {
    await fontes.ready;
  } catch {
    // Fonte que nao carrega nao impede o card: o fallback de sistema serve.
  }
}

interface DadosCompartilhamento {
  files?: File[];
  title?: string;
  text?: string;
}

/** Tipagem minima propria: `share`/`canShare` variam entre libs do TS. */
type NavegadorCompartilhavel = Navigator & {
  share?: (dados: DadosCompartilhamento) => Promise<void>;
  canShare?: (dados: DadosCompartilhamento) => boolean;
};

/**
 * Usuaria que fecha a folha de compartilhamento. Nao e erro: nem toast de falha,
 * nem download que ela nao pediu.
 */
export function cancelouCompartilhamento(erro: unknown): boolean {
  return erro instanceof Error && erro.name === "AbortError";
}

function baixar(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revogar na hora cancelaria o download no Safari; um respiro basta.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Compartilha o PNG pela Web Share API (celular) ou baixa o arquivo (desktop).
 * Cancelamento da usuaria sobe como AbortError — use `cancelouCompartilhamento`.
 */
export async function compartilharOuBaixar(
  canvas: HTMLCanvasElement,
  nomeArquivo: string
): Promise<"share" | "download"> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) throw new Error("Não foi possível gerar a imagem");

  const navegador = navigator as NavegadorCompartilhavel;
  const arquivo = new File([blob], nomeArquivo, { type: "image/png" });
  const pacote: DadosCompartilhamento = {
    files: [arquivo],
    title: "Meu resultado no Studio X",
  };

  if (navegador.share && navegador.canShare?.(pacote)) {
    try {
      await navegador.share(pacote);
      return "share";
    } catch (erro) {
      // Cancelou: respeita a decisao. Qualquer outra falha (permissao, sistema
      // sem app de destino) cai no download, que sempre funciona.
      if (cancelouCompartilhamento(erro)) throw erro;
    }
  }

  baixar(blob, nomeArquivo);
  return "download";
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  clienteDaLista,
  normalizarBusca,
  type ClienteDoDia,
  type EstadoDaLista,
  type OrigemClienteTrinks,
} from "@/lib/clienteTrinks";

export interface ClienteSelecionada {
  nome: string;
  id: number | null;
  origem: OrigemClienteTrinks;
}

interface ClienteTrinksPickerProps {
  clientes: ClienteDoDia[];
  estado: EstadoDaLista;
  selecionado: ClienteSelecionada | null;
  /** `null` limpa a escolha (voltar para a lista). */
  onSelecionar: (v: ClienteSelecionada | null) => void;
}

const BOTAO_BASE =
  "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-body transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400";

/**
 * Escolha da cliente no Trinks: lista do dia com busca local e, no fim, a saida
 * "Nao encontrei a cliente" que vira um campo livre. Em erro ou lista vazia o
 * campo livre ja vem aberto. Para limpar a escolha ao trocar profissional/dia,
 * quem usa remonta o componente (`key`).
 */
export default function ClienteTrinksPicker({
  clientes,
  estado,
  selecionado,
  onSelecionar,
}: ClienteTrinksPickerProps) {
  const [busca, setBusca] = useState("");
  const [trocando, setTrocando] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);
  const trocarRef = useRef<HTMLButtonElement>(null);
  // Foco so depois de uma acao do usuario (nunca na montagem): "trocar" -> busca, escolher -> cartao.
  const foco = useRef<"busca" | "cartao" | null>(null);

  const mostrarCartao = selecionado?.origem === "lista" && !trocando;

  useEffect(() => {
    if (foco.current === "busca") buscaRef.current?.focus();
    if (foco.current === "cartao") trocarRef.current?.focus();
    foco.current = null;
  }, [mostrarCartao]);

  const digitando =
    estado === "erro" || estado === "vazia" || selecionado?.origem === "digitado";

  const filtradas = useMemo(() => {
    const termo = normalizarBusca(busca);
    if (!termo) return clientes;
    return clientes.filter((c) => normalizarBusca(c.nome).includes(termo));
  }, [clientes, busca]);

  if (estado === "carregando") {
    return (
      <div className="space-y-2" role="status" aria-label="Carregando clientes">
        <div className="h-11 rounded-lg animate-shimmer" />
        <div className="h-11 rounded-lg animate-shimmer" />
        <div className="h-11 rounded-lg animate-shimmer" />
      </div>
    );
  }

  if (digitando) {
    return (
      <div className="space-y-2">
        {estado === "erro" && (
          <p className="text-sm text-gray-600 font-body" role="status">
            Não foi possível carregar as clientes deste dia.
          </p>
        )}
        {estado === "vazia" && (
          <p className="text-sm text-gray-600 font-body" role="status">
            Nenhuma cliente encontrada para este dia.
          </p>
        )}
        <Input
          aria-label="Nome da cliente no Trinks"
          placeholder="Digite o nome da cliente"
          autoComplete="off"
          className="h-11 border-violet-200 focus:ring-violet-400"
          value={selecionado?.origem === "digitado" ? selecionado.nome : ""}
          onChange={(e) =>
            onSelecionar({ nome: e.target.value, id: null, origem: "digitado" })
          }
        />
        {estado === "pronta" && (
          <button
            type="button"
            onClick={() => {
              setBusca("");
              onSelecionar(null);
            }}
            className="min-h-11 text-sm font-body font-medium text-violet-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-md"
          >
            Voltar para a lista de clientes
          </button>
        )}
      </div>
    );
  }

  if (mostrarCartao && selecionado) {
    const servicos = clienteDaLista(clientes, selecionado.nome, selecionado.id)?.servicos ?? [];
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
        <div className="min-w-0">
          <span className="sr-only">Cliente selecionada: </span>
          <span className="flex items-start gap-1.5 text-sm font-body font-semibold text-violet-800">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
            <span className="break-words min-w-0">{selecionado.nome}</span>
          </span>
          {servicos.length > 0 && (
            <span
              title={servicos.join(" · ")}
              className="mt-0.5 block truncate text-xs text-gray-500 font-body"
            >
              {servicos.join(" · ")}
            </span>
          )}
        </div>
        <button
          ref={trocarRef}
          type="button"
          aria-label={`Trocar cliente ${selecionado.nome}`}
          onClick={() => {
            foco.current = "busca";
            setBusca("");
            setTrocando(true);
          }}
          className="min-h-11 min-w-11 shrink-0 rounded-md px-3 text-sm font-body font-medium text-violet-700 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          Trocar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <Input
          ref={buscaRef}
          type="search"
          aria-label="Buscar cliente pelo nome"
          placeholder="Buscar pelo nome"
          autoComplete="off"
          className="h-11 border-violet-200 pl-9 focus:ring-violet-400"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <ul className="max-h-56 overflow-y-auto rounded-lg border border-violet-100 p-1">
        {filtradas.map((c, i) => {
          const ativo =
            selecionado?.origem === "lista" &&
            selecionado.nome === c.nome &&
            selecionado.id === c.cliente_trinks_id;
          return (
            <li key={`${c.cliente_trinks_id ?? "fila"}-${c.nome}-${i}`}>
              <button
                type="button"
                aria-pressed={ativo}
                onClick={() => {
                  foco.current = "cartao";
                  setTrocando(false);
                  onSelecionar({
                    nome: c.nome,
                    id: c.cliente_trinks_id,
                    origem: "lista",
                  });
                }}
                className={cn(
                  BOTAO_BASE,
                  ativo
                    ? "bg-violet-100 text-violet-800"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.nome}</span>
                  {c.servicos.length > 0 && (
                    <span className="block truncate text-xs text-gray-500">
                      {c.servicos.join(" · ")}
                    </span>
                  )}
                </span>
                {ativo && <Check className="h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
        {filtradas.length === 0 && (
          <li className="px-3 py-3 text-sm text-gray-500 font-body">
            Nenhuma cliente com esse nome.
          </li>
        )}
        <li>
          <button
            type="button"
            onClick={() => onSelecionar({ nome: "", id: null, origem: "digitado" })}
            className={cn(BOTAO_BASE, "font-medium text-violet-700 hover:bg-violet-50")}
          >
            Não encontrei a cliente — digitar o nome
          </button>
        </li>
      </ul>
    </div>
  );
}

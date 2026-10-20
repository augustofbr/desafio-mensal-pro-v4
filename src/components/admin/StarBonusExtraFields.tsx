import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
// Mesma instancia do app, sem o generico `Database`.
import { supabase } from "@/lib/supabase";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProfissionalLinha {
  profissionalId: number;
  nome_profissional: string | null;
  apelido: string | null;
  categoria: string | null;
  ativo: boolean | null;
}

interface StarBonusExtraFieldsProps {
  /** Valor digitado (string crua do input; vazio = sem extras). */
  valor: string;
  onValorChange: (valor: string) => void;
  ids: number[];
  onIdsChange: (ids: number[]) => void;
  /** O valor salvo no banco tem dados invalidos (o app o ignora em parte ou no todo). */
  avisoBancoInvalido?: boolean;
  /** Marca a secao como alterada: ao salvar, grava so os dados validos mostrados. */
  onCorrigir?: () => void;
}

function nomeDe(prof: ProfissionalLinha): string {
  return prof.apelido?.trim() || prof.nome_profissional?.trim() || `Profissional ${prof.profissionalId}`;
}

/**
 * Campos de `regras_desafio.star_bonus_extra`: profissionais SEM categoria que
 * participam só do Bônus Estrelas no mês (nunca do ranking/premiação).
 *
 * Lista quem está sem categoria e ativo, mais quem já estiver marcado (mesmo
 * que hoje tenha categoria ou esteja inativo), para dar para desmarcar.
 */
export function StarBonusExtraFields({
  valor,
  onValorChange,
  ids,
  onIdsChange,
  avisoBancoInvalido = false,
  onCorrigir,
}: StarBonusExtraFieldsProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin_profissionais_bonus_extra"],
    queryFn: async (): Promise<ProfissionalLinha[]> => {
      const { data, error } = await supabase
        .from("profissionais_ativos")
        .select("profissionalId, nome_profissional, apelido, categoria, ativo");
      if (error) throw error;
      return (data as unknown as ProfissionalLinha[]) ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const marcados = new Set(ids);
  const opcoes = (data ?? [])
    .filter((prof) => marcados.has(prof.profissionalId) || (!prof.categoria?.trim() && prof.ativo !== false))
    .sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), "pt-BR"));
  // Ids marcados que nem existem mais no cadastro: aparecem para poder desmarcar.
  const conhecidos = new Set(opcoes.map((prof) => prof.profissionalId));
  const orfaos = ids.filter((id) => !conhecidos.has(id));

  const alternar = (id: number, marcado: boolean) => {
    const proximo = new Set(ids);
    if (marcado) proximo.add(id);
    else proximo.delete(id);
    onIdsChange([...proximo].sort((a, b) => a - b));
  };

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-3">
      <div>
        <p className="font-body text-sm font-semibold text-gray-800">Bônus Estrelas — sem categoria</p>
        <p className="text-[11px] text-gray-500 font-body">
          Profissionais sem categoria que participam só do Bônus Estrelas neste período. Não entram no
          ranking, nos pontos nem na premiação. Vazio = ninguém.
        </p>
      </div>

      {avisoBancoInvalido && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 font-body">
          O valor salvo no banco tem dados inválidos e está sendo ignorado; salve de novo esta seção para corrigir.
          {onCorrigir && (
            <>
              {" "}
              <button type="button" onClick={onCorrigir} className="font-semibold underline underline-offset-2">
                Gravar os dados válidos mostrados abaixo ao salvar
              </button>
            </>
          )}
        </p>
      )}

      <div>
        <Label className="text-xs text-gray-500">Valor por estrela aprovada (R$)</Label>
        <Input
          type="number"
          min={0}
          max={1000}
          step="0.01"
          value={valor}
          onChange={(e) => onValorChange(e.target.value)}
          placeholder="Sem bônus"
          className="font-body text-sm w-40"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-gray-500">Quem participa</Label>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : error ? (
          <p className="text-xs text-red-500 font-body">Não foi possível carregar os profissionais.</p>
        ) : opcoes.length === 0 && orfaos.length === 0 ? (
          <p className="text-xs text-gray-500 font-body">Nenhum profissional ativo sem categoria.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {opcoes.map((prof) => {
              const id = prof.profissionalId;
              const aviso = prof.ativo === false ? "inativo" : prof.categoria?.trim() ? `tem categoria ${prof.categoria}` : null;
              return (
                <label key={id} className="flex items-center gap-2 text-sm font-body cursor-pointer">
                  <Checkbox checked={marcados.has(id)} onCheckedChange={(v) => alternar(id, v === true)} />
                  <span>
                    {nomeDe(prof)}
                    {aviso && <span className="ml-1 text-[11px] text-gray-400">({aviso})</span>}
                  </span>
                </label>
              );
            })}
            {orfaos.map((id) => (
              <label key={id} className="flex items-center gap-2 text-sm font-body cursor-pointer">
                <Checkbox checked onCheckedChange={(v) => alternar(id, v === true)} />
                <span>
                  {id} <span className="text-[11px] text-gray-400">(fora do cadastro)</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StarBonusExtraFields;

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Star } from "lucide-react";
// Mesma instancia do app, sem o generico `Database` (que nao conhece as colunas novas).
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ClienteTrinksPicker from "@/components/avaliacoes/ClienteTrinksPicker";
import { useClientesDoDia } from "@/hooks/useClientesDoDia";
import { cn } from "@/lib/utils";
import {
  diaManaus,
  diasPermitidos,
  estadoDaLista,
  montarInsertAvaliacao,
  nomeGoogleEfetivo,
  rotuloDia,
} from "@/lib/clienteTrinks";
import ProfessionalSelect from "@/components/avaliacoes/ProfessionalSelect";
import { Button } from "@/components/ui/button";
import { useProfissionaisSelecionaveis } from "@/hooks/useProfissionaisSelecionaveis";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";

function criarSchema(hoje: string) {
  const dias = diasPermitidos(hoje);
  return z
    .object({
      profissionalId: z.string().min(1, "Selecione um profissional"),
      dataAtendimento: z
        .string()
        .refine((d) => dias.includes(d), "Escolha o dia do atendimento"),
      nomeTrinks: z
        .string()
        .trim()
        .min(2, "Escolha a cliente ou digite o nome"),
      clienteTrinksId: z.number().nullable(),
      origem: z.enum(["lista", "digitado"]),
      nomeGoogle: z.string(),
      mesmoNome: z.boolean(),
    })
    .superRefine((v, ctx) => {
      // Com "Mesmo nome do Trinks" marcado o nome do Google e o do Trinks (ja validado).
      if (!v.mesmoNome && v.nomeGoogle.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nomeGoogle"],
          message: "Nome deve ter pelo menos 2 caracteres",
        });
      }
    });
}

type FormValues = z.infer<ReturnType<typeof criarSchema>>;

function valoresIniciais(hoje: string): FormValues {
  return {
    profissionalId: "",
    dataAtendimento: hoje,
    nomeTrinks: "",
    clienteTrinksId: null,
    origem: "lista",
    nomeGoogle: "",
    // Desmarcado de proposito: o nome do Google e a chave da deteccao de duplicatas.
    mesmoNome: false,
  };
}

const CHIP_BASE =
  "inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-body font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2";

interface CadastrarAvaliacaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProfessionals: ProfissionalAtivo[];
}

export default function CadastrarAvaliacaoModal({
  isOpen,
  onClose,
  activeProfessionals,
}: CadastrarAvaliacaoModalProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  // Dia de hoje em Manaus, renovado a cada abertura (o modal pode ficar montado de um dia para o outro).
  const [hoje, setHoje] = useState(() => diaManaus());
  const [outroDiaAberto, setOutroDiaAberto] = useState(false);

  const schema = useMemo(() => criarSchema(hoje), [hoje]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: valoresIniciais(hoje),
  });

  useEffect(() => {
    if (!isOpen) return;
    const agora = diaManaus();
    setHoje(agora);
    setOutroDiaAberto(false);
    form.reset(valoresIniciais(agora));
  }, [isOpen, form]);

  const profissionalId = form.watch("profissionalId");
  const dataAtendimento = form.watch("dataAtendimento");
  const nomeTrinks = form.watch("nomeTrinks");
  const clienteTrinksId = form.watch("clienteTrinksId");
  const origem = form.watch("origem");
  const mesmoNome = form.watch("mesmoNome");

  const profId = profissionalId ? Number(profissionalId) : null;
  const diaEscolhido = dataAtendimento || null;
  const { clientes, isLoading, isError } = useClientesDoDia(profId, diaEscolhido);
  const estado = estadoDaLista({ isLoading, isError, clientes });

  const dias = useMemo(() => diasPermitidos(hoje), [hoje]);
  const ontem = dias[1];
  const outrosDias = dias.slice(2);

  // Trocar profissional ou dia invalida a escolha da cliente (a lista e outra).
  const limparCliente = () => {
    form.setValue("nomeTrinks", "");
    form.setValue("clienteTrinksId", null);
    form.setValue("origem", "lista");
    form.clearErrors("nomeTrinks");
  };

  const escolherDia = (dia: string) => {
    if (dia !== form.getValues("dataAtendimento")) limparCliente();
    form.setValue("dataAtendimento", dia, { shouldValidate: true });
  };

  // Estrela cadastrada AGORA: so quem aparece no desafio do mes atual (Manaus)
  // ou participa so do Bonus Estrelas. O `find` do submit segue no cadastro todo.
  const { profissionais: selecionaveis, regrasCarregando } =
    useProfissionaisSelecionaveis(activeProfessionals);

  const sortedProfessionals = [...selecionaveis]
    .filter((p) => p.nome_profissional)
    .sort((a, b) =>
      (a.nome_profissional ?? "").localeCompare(b.nome_profissional ?? "")
    );

  const onSubmit = async (values: FormValues) => {
    try {
      setSubmitting(true);

      const profId = Number(values.profissionalId);
      const prof = activeProfessionals.find(
        (p) => p.profissionalId === profId
      );
      const nomeGoogle = nomeGoogleEfetivo(
        values.nomeGoogle,
        values.nomeTrinks,
        values.mesmoNome
      ).trim();

      const { error } = await supabase.from("avaliacoes_cadastradas").insert(
        montarInsertAvaliacao({
          profissionalId: profId,
          nomeProfissional: prof?.nome_profissional ?? "",
          nomeGoogle,
          nomeTrinks: values.nomeTrinks,
          clienteTrinksId: values.clienteTrinksId,
          dataAtendimento: values.dataAtendimento,
          origem: values.origem,
          agoraISO: new Date().toISOString(),
        })
      );

      if (error) throw error;

      toast({
        title: "Avaliação cadastrada!",
        description: `Avaliação de ${nomeGoogle} registrada com sucesso.`,
      });

      form.reset(valoresIniciais(hoje));
      setOutroDiaAberto(false);
      onClose();
    } catch (error: unknown) {
      console.error("Erro ao cadastrar avaliação:", error);
      toast({
        title: "Erro ao cadastrar",
        description: "Não foi possível cadastrar a avaliação. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset(valoresIniciais(hoje));
      setOutroDiaAberto(false);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shadow-sm">
              <Star className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle className="font-display text-lg">
                Cadastrar Avaliação Google
              </DialogTitle>
              <p className="text-xs text-gray-500 font-body">
                Registre uma nova avaliação do Google
              </p>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <FormField
              control={form.control}
              name="profissionalId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-body text-sm font-medium text-gray-700">
                    Profissional
                  </FormLabel>
                  <FormControl>
                    {regrasCarregando ? (
                      <div className="h-10 rounded-lg animate-shimmer" />
                    ) : (
                      <ProfessionalSelect
                        professionals={sortedProfessionals}
                        value={field.value}
                        onValueChange={(v) => {
                          if (v !== field.value) limparCliente();
                          field.onChange(v);
                        }}
                      />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dataAtendimento"
              render={({ field }) => {
                const hojeAtivo = !outroDiaAberto && field.value === hoje;
                const ontemAtivo = !outroDiaAberto && field.value === ontem;
                const outroAtivo = outroDiaAberto;
                return (
                  <FormItem>
                    <FormLabel className="font-body text-sm font-medium text-gray-700">
                      Dia do atendimento
                    </FormLabel>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Dia do atendimento">
                      <button
                        type="button"
                        aria-pressed={hojeAtivo}
                        onClick={() => {
                          setOutroDiaAberto(false);
                          escolherDia(hoje);
                        }}
                        className={cn(
                          CHIP_BASE,
                          hojeAtivo
                            ? "border-violet-500 bg-violet-100 text-violet-800"
                            : "border-violet-200 text-gray-700 hover:bg-violet-50"
                        )}
                      >
                        {rotuloDia(hoje, hoje)}
                      </button>
                      <button
                        type="button"
                        aria-pressed={ontemAtivo}
                        onClick={() => {
                          setOutroDiaAberto(false);
                          escolherDia(ontem);
                        }}
                        className={cn(
                          CHIP_BASE,
                          ontemAtivo
                            ? "border-violet-500 bg-violet-100 text-violet-800"
                            : "border-violet-200 text-gray-700 hover:bg-violet-50"
                        )}
                      >
                        {rotuloDia(ontem, hoje)}
                      </button>
                      <button
                        type="button"
                        aria-pressed={outroAtivo}
                        onClick={() => {
                          if (outroDiaAberto) return;
                          setOutroDiaAberto(true);
                          // Ainda sem dia: a lista so aparece depois que ele for escolhido.
                          limparCliente();
                          form.setValue("dataAtendimento", "");
                        }}
                        className={cn(
                          CHIP_BASE,
                          outroAtivo
                            ? "border-violet-500 bg-violet-100 text-violet-800"
                            : "border-violet-200 text-gray-700 hover:bg-violet-50"
                        )}
                      >
                        Outro dia
                      </button>
                    </div>
                    {outroDiaAberto && (
                      <Select
                        value={field.value}
                        onValueChange={(v) => escolherDia(v)}
                      >
                        <SelectTrigger
                          aria-label="Escolha o dia do atendimento"
                          className="h-11 border-violet-200 focus:ring-violet-400"
                        >
                          <SelectValue placeholder="Escolha o dia" />
                        </SelectTrigger>
                        <SelectContent>
                          {outrosDias.map((d) => (
                            <SelectItem key={d} value={d}>
                              {rotuloDia(d, hoje)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="nomeTrinks"
              render={() => (
                <FormItem>
                  <FormLabel className="font-body text-sm font-medium text-gray-700">
                    Nome da cliente no Trinks
                  </FormLabel>
                  {profId === null || diaEscolhido === null ? (
                    <p className="text-sm text-gray-500 font-body">
                      Escolha a profissional e o dia para ver as clientes.
                    </p>
                  ) : (
                    <ClienteTrinksPicker
                      // Remonta ao trocar profissional/dia: zera busca e modo de digitacao.
                      key={`${profId}-${diaEscolhido}`}
                      clientes={clientes}
                      estado={estado}
                      selecionado={
                        origem === "digitado"
                          ? { nome: nomeTrinks, id: null, origem }
                          : nomeTrinks
                            ? { nome: nomeTrinks, id: clienteTrinksId, origem }
                            : null
                      }
                      onSelecionar={(v) => {
                        form.setValue("nomeTrinks", v?.nome ?? "", { shouldValidate: form.formState.isSubmitted });
                        form.setValue("clienteTrinksId", v?.id ?? null);
                        form.setValue("origem", v?.origem ?? "lista");
                        if (v && v.nome.trim().length >= 2) form.clearErrors("nomeTrinks");
                      }}
                    />
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nomeGoogle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-body text-sm font-medium text-gray-700">
                    Nome da cliente no Google
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Digite o nome como aparece no Google"
                      className="h-11 border-violet-200 focus:ring-violet-400"
                      autoComplete="off"
                      {...field}
                      disabled={mesmoNome}
                      value={nomeGoogleEfetivo(field.value, nomeTrinks, mesmoNome)}
                    />
                  </FormControl>
                  <FormField
                    control={form.control}
                    name="mesmoNome"
                    render={({ field: campo }) => (
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 font-body text-sm text-gray-700">
                        <Checkbox
                          checked={campo.value}
                          onCheckedChange={(v) => {
                            campo.onChange(v === true);
                            if (v === true) form.clearErrors("nomeGoogle");
                          }}
                          className="h-5 w-5 border-violet-400 data-[state=checked]:bg-violet-600"
                        />
                        Mesmo nome do Trinks
                      </label>
                    )}
                  />
                  <p className="text-xs text-gray-500 font-body">
                    Copie exatamente como aparece na avaliação do Google.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="font-body"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-body"
              >
                {submitting ? "Cadastrando..." : "Cadastrar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

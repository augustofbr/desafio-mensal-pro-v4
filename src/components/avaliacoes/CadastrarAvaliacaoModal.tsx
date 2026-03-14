import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import ProfessionalSelect from "@/components/avaliacoes/ProfessionalSelect";
import { Button } from "@/components/ui/button";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";

const formSchema = z.object({
  profissionalId: z.string().min(1, "Selecione um profissional"),
  nomeCliente: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
});

type FormValues = z.infer<typeof formSchema>;

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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      profissionalId: "",
      nomeCliente: "",
    },
  });

  const sortedProfessionals = [...activeProfessionals]
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

      const { error } = await supabase
        .from("avaliacoes_cadastradas" as any)
        .insert({
          profissional_id: profId,
          nome_profissional: prof?.nome_profissional ?? "",
          nome_cliente: values.nomeCliente.trim(),
          status: "pendente",
          data_hora_cadastro: new Date().toISOString(),
        } as any);

      if (error) throw error;

      toast({
        title: "Avaliação cadastrada!",
        description: `Avaliação de ${values.nomeCliente.trim()} registrada com sucesso.`,
      });

      form.reset();
      onClose();
    } catch (error: any) {
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
      form.reset();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
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
                    <ProfessionalSelect
                      professionals={sortedProfessionals}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nomeCliente"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-body text-sm font-medium text-gray-700">
                    Nome do Cliente
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Digite o nome do cliente"
                      className="border-violet-200 focus:ring-violet-400"
                      {...field}
                    />
                  </FormControl>
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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, Scissors, Sparkles, Heart, Palette } from "lucide-react";

const REGRAS = [
  {
    id: "cabelo",
    label: "Cabelo",
    premio: "R$300",
    icon: Scissors,
    colorScheme: {
      gradient: "gradient-cabelo",
      bgLight: "bg-blue-50/80",
      text: "text-blue-700",
      border: "border-blue-200",
      badge: "bg-blue-100 text-blue-700",
      bullet: "bg-blue-400",
    },
    regras: [
      "Cada cliente atendido no dia vale 1 ponto (mesmo cliente no mesmo dia conta só 1 vez)",
      "Cada tratamento capilar realizado vale 2 pontos",
      "Cada avaliação Google aprovada vale 3 pontos",
    ],
    meta: "Meta mínima: 60 clientes únicos no mês",
  },
  {
    id: "unhas",
    label: "Unhas",
    premio: "R$200",
    icon: Sparkles,
    colorScheme: {
      gradient: "gradient-unhas",
      bgLight: "bg-red-50/80",
      text: "text-red-700",
      border: "border-red-200",
      badge: "bg-red-100 text-red-700",
      bullet: "bg-red-400",
    },
    regras: [
      "Cada cliente atendido no dia vale 1 ponto (mesmo cliente no mesmo dia conta só 1 vez)",
      "Cada SPA dos Pés realizado vale 2 pontos",
      "Cada avaliação Google aprovada vale 3 pontos",
    ],
    meta: "Meta mínima: 50 clientes únicos no mês",
  },
  {
    id: "estetica",
    label: "Estética",
    premio: "R$200",
    icon: Heart,
    colorScheme: {
      gradient: "gradient-estetica",
      bgLight: "bg-violet-50/80",
      text: "text-violet-700",
      border: "border-violet-200",
      badge: "bg-violet-100 text-violet-700",
      bullet: "bg-violet-400",
    },
    regras: [
      "A pontuação é baseada no faturamento: quanto mais faturar, maior a pontuação",
      "Existe uma meta mínima de faturamento para se qualificar ao prêmio",
      "Avaliações Google aparecem no perfil, mas não somam pontos nesta categoria",
    ],
    meta: "Meta mínima: atingir a meta de faturamento do mês",
  },
  {
    id: "maquiagem",
    label: "Maquiagem",
    premio: "R$200",
    icon: Palette,
    colorScheme: {
      gradient: "gradient-make",
      bgLight: "bg-yellow-50/80",
      text: "text-yellow-700",
      border: "border-yellow-200",
      badge: "bg-yellow-100 text-yellow-700",
      bullet: "bg-yellow-400",
    },
    regras: [
      "Cada serviço de maquiagem realizado vale 1 ponto",
      "Todos os serviços contam — não há limite por cliente",
      "Avaliações Google aparecem no perfil, mas não somam pontos nesta categoria",
    ],
    meta: "Meta mínima: 25 serviços no mês",
  },
];

export default function RegrasDoDesafio() {
  return (
    <Card className="mb-6 border-0 shadow-md bg-gradient-to-br from-sky-50/60 via-white to-indigo-50/40">
      <CardHeader className="pb-3 px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow-sm">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="font-display text-lg">Regras do Desafio</CardTitle>
            <p className="text-xs text-gray-500 font-body">Como funciona a pontuação de cada categoria</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <Accordion type="multiple" className="space-y-2">
          {REGRAS.map((categoria) => {
            const Icon = categoria.icon;
            return (
              <AccordionItem
                key={categoria.id}
                value={categoria.id}
                className={`border rounded-xl ${categoria.colorScheme.border} ${categoria.colorScheme.bgLight} overflow-hidden`}
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg ${categoria.colorScheme.gradient} flex items-center justify-center shadow-sm`}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <span className={`font-display font-semibold text-sm ${categoria.colorScheme.text}`}>
                      {categoria.label}
                    </span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${categoria.colorScheme.badge}`}>
                      Prêmio {categoria.premio}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4">
                  <ul className="space-y-2 mb-3">
                    {categoria.regras.map((regra, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700 font-body">
                        <span className={`w-1.5 h-1.5 rounded-full ${categoria.colorScheme.bullet} mt-1.5 shrink-0`} />
                        {regra}
                      </li>
                    ))}
                  </ul>
                  <div className={`text-xs font-semibold ${categoria.colorScheme.text} bg-white/60 rounded-lg px-3 py-2 border ${categoria.colorScheme.border}`}>
                    {categoria.meta}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

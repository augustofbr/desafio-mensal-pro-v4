import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cake, ArrowLeft, Sparkles, Calendar, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MonthSelector from "@/components/aniversariantes/MonthSelector";
import BirthdayCard from "@/components/aniversariantes/BirthdayCard";
import type { BirthdayCardColorScheme } from "@/components/aniversariantes/BirthdayCard";
import { useAniversariosData } from "@/hooks/useAniversariosData";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const MONTH_COLOR_SCHEMES: BirthdayCardColorScheme[] = [
  { bgLight: "bg-rose-50/80", border: "border-rose-200", iconGradient: "from-rose-400 to-pink-500", text: "text-rose-700", badgeBg: "bg-rose-100 text-rose-700" },
  { bgLight: "bg-violet-50/80", border: "border-violet-200", iconGradient: "from-violet-400 to-purple-500", text: "text-violet-700", badgeBg: "bg-violet-100 text-violet-700" },
  { bgLight: "bg-emerald-50/80", border: "border-emerald-200", iconGradient: "from-emerald-400 to-teal-500", text: "text-emerald-700", badgeBg: "bg-emerald-100 text-emerald-700" },
  { bgLight: "bg-sky-50/80", border: "border-sky-200", iconGradient: "from-sky-400 to-blue-500", text: "text-sky-700", badgeBg: "bg-sky-100 text-sky-700" },
  { bgLight: "bg-amber-50/80", border: "border-amber-200", iconGradient: "from-amber-400 to-orange-500", text: "text-amber-700", badgeBg: "bg-amber-100 text-amber-700" },
  { bgLight: "bg-lime-50/80", border: "border-lime-200", iconGradient: "from-lime-400 to-green-500", text: "text-lime-700", badgeBg: "bg-lime-100 text-lime-700" },
  { bgLight: "bg-blue-50/80", border: "border-blue-200", iconGradient: "from-blue-400 to-indigo-500", text: "text-blue-700", badgeBg: "bg-blue-100 text-blue-700" },
  { bgLight: "bg-orange-50/80", border: "border-orange-200", iconGradient: "from-orange-400 to-red-500", text: "text-orange-700", badgeBg: "bg-orange-100 text-orange-700" },
  { bgLight: "bg-pink-50/80", border: "border-pink-200", iconGradient: "from-pink-400 to-rose-500", text: "text-pink-700", badgeBg: "bg-pink-100 text-pink-700" },
  { bgLight: "bg-yellow-50/80", border: "border-yellow-200", iconGradient: "from-yellow-400 to-amber-500", text: "text-yellow-700", badgeBg: "bg-yellow-100 text-yellow-700" },
  { bgLight: "bg-indigo-50/80", border: "border-indigo-200", iconGradient: "from-indigo-400 to-violet-500", text: "text-indigo-700", badgeBg: "bg-indigo-100 text-indigo-700" },
  { bgLight: "bg-red-50/80", border: "border-red-200", iconGradient: "from-red-400 to-rose-500", text: "text-red-700", badgeBg: "bg-red-100 text-red-700" },
];

const Aniversariantes = () => {
  const navigate = useNavigate();
  const currentMonthNumber = new Date().getMonth() + 1;
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthNumber);
  const { byMonth, loading, error } = useAniversariosData();

  const monthBirthdays = byMonth.get(selectedMonth) || [];
  const monthName = MONTH_NAMES[selectedMonth - 1];
  const colorScheme = MONTH_COLOR_SCHEMES[selectedMonth - 1];
  const isCurrentMonth = selectedMonth === currentMonthNumber;

  const birthdayCountByMonth = new Map<number, number>();
  for (let m = 1; m <= 12; m++) {
    birthdayCountByMonth.set(m, (byMonth.get(m) || []).length);
  }

  return (
    <div className="min-h-screen bg-gradient-warm">
      <div className="px-4 pt-6 pb-4">
        <div className="max-w-7xl mx-auto">

          {/* Header */}
          <div className="flex flex-col items-center mb-5 animate-fade-slide-up">
            <img
              src="/lovable-uploads/0cb6b226-2d51-4078-9b78-b6565c728721.png"
              alt="Studio X - Salão de Beleza & Estética"
              className="h-20 md:h-28 mb-3"
            />
            <h1 className="text-2xl md:text-4xl font-display font-bold text-gray-800 text-center leading-tight">
              Aniversariantes
            </h1>
            <p className="text-sm text-gray-500 font-body text-center mt-1.5 font-medium">
              Celebre com a equipe do Studio X!
            </p>
          </div>

          {/* Back button */}
          <div className="flex justify-start mt-1 mb-4 animate-fade-slide-up stagger-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="gap-2 text-gray-600 hover:text-gray-800 font-body"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Dashboard
            </Button>
          </div>

          {/* Main card */}
          <div className="animate-fade-slide-up stagger-3">
            <Card className="mb-6 border-0 shadow-md bg-gradient-to-br from-rose-50/80 via-white to-pink-50/50">
              <CardHeader className="pb-3 px-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center shadow-sm">
                    <Cake className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="font-display text-lg">
                      Aniversariantes do Studio X
                    </CardTitle>
                    <p className="text-xs text-gray-500 font-body">
                      Parabéns a todos!
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="px-4 pb-4">
                {/* Loading state */}
                {loading && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-20 rounded-2xl animate-shimmer"
                      />
                    ))}
                  </div>
                )}

                {/* Error state */}
                {error && !loading && (
                  <div className="text-center py-12">
                    <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
                    <p className="text-gray-500 font-body text-sm">{error}</p>
                  </div>
                )}

                {/* Content */}
                {!loading && !error && (
                  <>
                    {/* Month selector */}
                    <MonthSelector
                      selectedMonth={selectedMonth}
                      onSelectMonth={setSelectedMonth}
                      birthdayCountByMonth={birthdayCountByMonth}
                      currentMonth={currentMonthNumber}
                    />

                    {/* Month heading */}
                    <div className="flex items-center gap-2 mt-5 mb-3">
                      {isCurrentMonth ? (
                        <>
                          <Sparkles className="h-5 w-5 text-pink-500" />
                          <h2 className="font-display font-bold text-lg text-rose-600">
                            {monthName}
                            <span className="text-sm font-body font-medium text-rose-400 ml-2">
                              (Mês Atual)
                            </span>
                          </h2>
                        </>
                      ) : (
                        <>
                          <Calendar className="h-5 w-5 text-gray-400" />
                          <h2 className="font-display font-bold text-lg text-gray-700">
                            {monthName}
                          </h2>
                        </>
                      )}
                    </div>

                    {/* Birthday cards grid */}
                    {monthBirthdays.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {monthBirthdays.map((b, i) => (
                          <BirthdayCard
                            key={b.id}
                            apelido={b.apelido}
                            dia={b.dia}
                            mes={b.mes}
                            isCurrentMonth={isCurrentMonth}
                            colorScheme={colorScheme}
                            animationIndex={i + 1}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3">
                          <Cake className="h-8 w-8 text-gray-300" />
                        </div>
                        <p className="text-gray-500 font-body text-sm">
                          Nenhum aniversariante em {monthName}.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Aniversariantes;

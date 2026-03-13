import { Cake, Sparkles } from "lucide-react";

export interface BirthdayCardColorScheme {
  bgLight: string;
  border: string;
  iconGradient: string;
  text: string;
  badgeBg: string;
}

interface BirthdayCardProps {
  apelido: string;
  dia: number;
  mes: number;
  isCurrentMonth: boolean;
  colorScheme: BirthdayCardColorScheme;
  animationIndex: number;
}

const BirthdayCard = ({
  apelido,
  dia,
  mes,
  isCurrentMonth,
  colorScheme,
  animationIndex,
}: BirthdayCardProps) => {
  const formattedDate = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
  const staggerClass = `stagger-${Math.min(animationIndex, 8)}`;

  return (
    <div
      className={`
        relative rounded-2xl border p-4
        ${colorScheme.border} ${colorScheme.bgLight}
        ${isCurrentMonth ? "ring-2 ring-pink-300 shadow-md shadow-pink-100/50" : ""}
        animate-fade-slide-up ${staggerClass}
        transition-transform duration-150 ease-out
        hover:scale-[1.02] active:scale-[0.98]
      `}
    >
      {isCurrentMonth && (
        <Sparkles className="absolute top-2.5 right-2.5 h-4 w-4 text-pink-400 animate-pulse" />
      )}

      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorScheme.iconGradient} flex items-center justify-center shadow-sm flex-shrink-0`}
        >
          <Cake className="h-5 w-5 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className={`font-display font-semibold text-base ${colorScheme.text} truncate`}>
            {apelido}
          </p>
          <span
            className={`inline-block font-mono-num text-xs ${colorScheme.badgeBg} rounded-full px-2.5 py-0.5 mt-0.5 font-medium`}
          >
            {formattedDate}
          </span>
        </div>
      </div>
    </div>
  );
};

export default BirthdayCard;

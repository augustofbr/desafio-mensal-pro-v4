import { useRef, useEffect } from "react";

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

interface MonthSelectorProps {
  selectedMonth: number;
  onSelectMonth: (month: number) => void;
  birthdayCountByMonth: Map<number, number>;
  currentMonth: number;
}

const MonthSelector = ({
  selectedMonth,
  onSelectMonth,
  birthdayCountByMonth,
  currentMonth,
}: MonthSelectorProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const button = selectedRef.current;
      const scrollLeft = button.offsetLeft - container.offsetWidth / 2 + button.offsetWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: "smooth" });
    }
  }, [selectedMonth]);

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide"
    >
      <div className="flex gap-2 min-w-max">
        {MONTHS.map((label, index) => {
          const month = index + 1;
          const count = birthdayCountByMonth.get(month) || 0;
          const isSelected = month === selectedMonth;
          const isCurrent = month === currentMonth;

          return (
            <button
              key={month}
              ref={isSelected ? selectedRef : undefined}
              onClick={() => onSelectMonth(month)}
              className={`
                rounded-full px-4 py-2 text-sm font-body font-semibold
                whitespace-nowrap transition-all duration-200
                ${
                  isSelected
                    ? "bg-primary text-white shadow-md"
                    : isCurrent
                    ? "bg-white border-2 border-primary/40 text-primary"
                    : count > 0
                    ? "bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:shadow-sm"
                    : "bg-gray-50 border border-gray-100 text-gray-400"
                }
              `}
            >
              {label}
              {count > 0 && (
                <span
                  className={`ml-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                    isSelected
                      ? "bg-white/25 text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MonthSelector;

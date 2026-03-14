import React from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MonthProgressProps {
  workedDays: number | null | undefined;
  todayCount: number | null | undefined;
  remainingDays: number | null | undefined;
  totalDays: number | null | undefined;
  className?: string;
}

const MonthProgress: React.FC<MonthProgressProps> = ({
  workedDays,
  todayCount,
  remainingDays,
  totalDays,
  className
}) => {
  const worked = workedDays ?? 0;
  const today = todayCount ?? 0;
  const total = totalDays ?? 1;
  const progressPercent = total > 0 ? Math.round(((worked + today) / total) * 100) : 0;

  return (
    <div className={cn("rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden", className)}>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Calendar className="h-4 w-4 text-indigo-500" />
          </div>
          <h3 className="text-sm font-semibold font-body text-gray-700">Progresso do Mês</h3>
          <span className="ml-auto text-xs font-mono-num text-indigo-500 font-semibold">{progressPercent}%</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2.5 rounded-full bg-gray-100 mb-4 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-500 animate-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center p-2.5 rounded-xl bg-emerald-50">
            <p className="font-mono-num text-xl font-bold text-emerald-600">
              {workedDays ?? '...'}
            </p>
            <p className="text-[11px] text-emerald-700 font-medium font-body mt-0.5">Trabalhados</p>
          </div>
          <div className="text-center p-2.5 rounded-xl bg-indigo-50">
            <p className="font-mono-num text-xl font-bold text-indigo-600">
              {todayCount ?? '...'}
            </p>
            <p className="text-[11px] text-indigo-700 font-medium font-body mt-0.5">Hoje</p>
          </div>
          <div className="text-center p-2.5 rounded-xl bg-amber-50">
            <p className="font-mono-num text-xl font-bold text-amber-600">
              {remainingDays ?? '...'}
            </p>
            <p className="text-[11px] text-amber-700 font-medium font-body mt-0.5">Restantes</p>
          </div>
          <div className="text-center p-2.5 rounded-xl bg-gray-50">
            <p className="font-mono-num text-xl font-bold text-gray-600">
              {totalDays ?? '...'}
            </p>
            <p className="text-[11px] text-gray-600 font-medium font-body mt-0.5">Total</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthProgress;

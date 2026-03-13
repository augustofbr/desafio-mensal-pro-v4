
import { formatServiceDate } from "@/lib/utils";

interface LastUpdateInfoProps {
  lastUpdate: string | null;
  loading?: boolean;
}

export default function LastUpdateInfo({ lastUpdate, loading = false }: LastUpdateInfoProps) {
  return (
    <div className="flex justify-center items-center">
      {loading ? (
        <span className="text-sm font-medium text-gray-500">Carregando informações...</span>
      ) : lastUpdate ? (
        <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-full text-sm font-medium">
          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
          <span>Última atualização em: {formatServiceDate(lastUpdate)}</span>
        </div>
      ) : (
        <span className="text-sm font-medium text-gray-500">Nenhuma informação sobre atualização disponível</span>
      )}
    </div>
  );
}

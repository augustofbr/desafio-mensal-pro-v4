
import LastUpdateInfo from "@/components/LastUpdateInfo";

interface DashboardHeaderProps {
  lastUpdate: string | null;
  loading: boolean;
}

export default function DashboardHeader({ lastUpdate, loading }: DashboardHeaderProps) {
  return (
    <div className="flex justify-center mb-8">
      <LastUpdateInfo lastUpdate={lastUpdate} loading={loading} />
    </div>
  );
}

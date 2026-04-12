import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, LogOut, Settings, Factory, CalendarOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { RulesManager } from "@/components/admin/RulesManager";
import { ManufacturerManager } from "@/components/admin/ManufacturerManager";
import { HolidaysManager } from "@/components/admin/HolidaysManager";

export default function AdminPanel() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="gap-1 text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
            <div className="h-5 w-px bg-gray-200" />
            <h1 className="text-lg font-heading font-semibold text-gray-900">
              Painel Administrativo
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 font-body hidden sm:block">
              {user?.email}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="gap-1 text-gray-500"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="regras" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="regras" className="gap-2 font-body">
              <Settings className="h-4 w-4" />
              Regras
            </TabsTrigger>
            <TabsTrigger value="fabricantes" className="gap-2 font-body">
              <Factory className="h-4 w-4" />
              Fabricantes
            </TabsTrigger>
            <TabsTrigger value="feriados" className="gap-2 font-body">
              <CalendarOff className="h-4 w-4" />
              Feriados
            </TabsTrigger>
          </TabsList>

          <TabsContent value="regras">
            <RulesManager />
          </TabsContent>

          <TabsContent value="fabricantes">
            <ManufacturerManager />
          </TabsContent>

          <TabsContent value="feriados">
            <HolidaysManager />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

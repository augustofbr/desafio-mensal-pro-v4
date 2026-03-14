import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";

interface ProfessionalSelectProps {
  professionals: ProfissionalAtivo[];
  value: string;
  onValueChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export default function ProfessionalSelect({
  professionals,
  value,
  onValueChange,
  placeholder = "Selecione o profissional",
  className,
}: ProfessionalSelectProps) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selectedName = professionals.find(
    (p) => String(p.profissionalId) === value
  )?.nome_profissional;

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-violet-200 bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2",
            !selectedName && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{selectedName ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>

        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="font-display">
                Selecione o profissional
              </DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto max-h-[60vh] px-4 pb-6">
              {professionals.map((prof) => {
                const id = String(prof.profissionalId);
                const isSelected = id === value;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onValueChange(id);
                      setDrawerOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-3 text-sm font-body transition-colors",
                      isSelected
                        ? "bg-violet-100 text-violet-800"
                        : "hover:bg-gray-100 text-gray-700"
                    )}
                  >
                    <span>{prof.nome_profissional}</span>
                    {isSelected && (
                      <Check className="h-4 w-4 text-violet-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn("border-violet-200 focus:ring-violet-400", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {professionals.map((prof) => (
          <SelectItem
            key={prof.profissionalId}
            value={String(prof.profissionalId)}
          >
            {prof.nome_profissional}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

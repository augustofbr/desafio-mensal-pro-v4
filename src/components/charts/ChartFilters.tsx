
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronDown, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChartFiltersProps {
  data: any[];
  selectedProfessionals: string[];
  onToggleProfessional: (professional: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

export function ChartFilters({
  data,
  selectedProfessionals,
  onToggleProfessional,
  onSelectAll,
  onClearAll
}: ChartFiltersProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);

  const filterContent = (
    <>
      <div className="flex flex-wrap gap-2 mb-3">
        <Button
          size="sm"
          variant="outline"
          onClick={onSelectAll}
          className="text-xs"
        >
          Selecionar Todos
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onClearAll}
          className="text-xs"
        >
          Limpar Seleção
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {data.map((prof) => (
          <Button
            key={prof.professional}
            size="sm"
            variant={selectedProfessionals.includes(prof.professional) ? "default" : "outline"}
            onClick={() => onToggleProfessional(prof.professional)}
            className="text-xs h-7 px-2 sm:h-8 sm:px-3"
          >
            {prof.professional}
          </Button>
        ))}
      </div>
    </>
  );

  if (!isMobile) {
    return <div className="mb-4">{filterContent}</div>;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-3">
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full flex items-center justify-between h-9">
          <span className="flex items-center gap-2 text-xs">
            <Filter className="h-3.5 w-3.5" />
            Filtrar Profissionais ({selectedProfessionals.length}/{data.length})
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        {filterContent}
      </CollapsibleContent>
    </Collapsible>
  );
}

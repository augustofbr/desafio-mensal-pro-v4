
import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { LineChart } from "@/components/ui/line-chart";

interface ExpandableChartProps {
  chartData: any;
  title: string;
  children: React.ReactNode;
}

export function ExpandableChart({ chartData, title, children }: ExpandableChartProps) {
  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="relative">
        {children}
        <Button
          variant="outline"
          size="sm"
          className="absolute top-2 right-2 z-10 bg-background/80 backdrop-blur-sm shadow-sm h-8 px-2.5 text-xs"
          onClick={() => setIsExpanded(true)}
        >
          <Maximize2 className="h-3.5 w-3.5 mr-1.5" />
          Expandir
        </Button>
      </div>

      <Drawer open={isExpanded} onOpenChange={setIsExpanded}>
        <DrawerContent className="h-[92dvh] max-h-[92dvh]">
          <DrawerHeader className="py-3 px-4">
            <DrawerTitle className="text-base text-center">{title}</DrawerTitle>
            <DrawerDescription className="text-xs text-center">
              Toque e segure para ver detalhes de cada dia
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 px-2 pb-6 min-h-0">
            <div className="w-full h-full">
              <LineChart
                data={chartData}
                showEndLabels={false}
                showEnhancedTooltips={true}
                legendPosition="bottom"
              />
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

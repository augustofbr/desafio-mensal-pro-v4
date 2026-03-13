
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface EdgeFunctionProcessorProps {
  refreshData: () => void;
}

export function EdgeFunctionProcessor({ refreshData }: EdgeFunctionProcessorProps) {
  const { toast } = useToast();
  const hasProcessed = useRef(false);
  const isProcessing = useRef(false);

  useEffect(() => {
    // Only process once per session and avoid multiple concurrent calls
    if (hasProcessed.current || isProcessing.current) {
      return;
    }

    const callEdgeFunction = async () => {
      if (isProcessing.current) return;
      
      try {
        isProcessing.current = true;
        
        console.log("Calling daily-trinks-automation edge function...");
        const { data, error } = await supabase.functions.invoke('daily-trinks-automation');
        
        if (error) {
          console.error("Error calling edge function:", error);
          toast({
            title: "Erro",
            description: "Não foi possível processar os dados. Tente novamente mais tarde.",
            variant: "destructive"
          });
          return;
        }
        
        console.log("Edge function response:", data);
        toast({
          title: "Sucesso",
          description: "Dados processados com sucesso.",
        });
        
        // Mark as processed successfully
        hasProcessed.current = true;
        
        // Refresh the data after processing
        refreshData();
      } catch (err) {
        console.error("Error processing data:", err);
        toast({
          title: "Erro",
          description: "Ocorreu um erro ao processar os dados.",
          variant: "destructive"
        });
      } finally {
        isProcessing.current = false;
      }
    };
    
    // Call the edge function when the component mounts (only once)
    callEdgeFunction();
  }, []); // Empty dependency array to run only once

  // This component doesn't render anything, it's just for processing
  return null;
}

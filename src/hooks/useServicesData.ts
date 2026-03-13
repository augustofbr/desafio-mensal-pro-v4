
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { convertDateFormat } from "@/lib/utils";

export function useServicesData() {
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [lastServiceDate, setLastServiceDate] = useState<string | null>(null);
  const [allServicesData, setAllServicesData] = useState<any[]>([]);
  const { toast } = useToast();

  const fetchServicesData = useCallback(async () => {
    try {
      setLoading(true);
      console.log("Fetching services data...");

      // Fetch services directly to get latest timestamp
      const { data: servicesData, error: servicesError } = await supabase
        .from('trinks_services')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);

      if (servicesError) {
        console.error("Error fetching services timestamp:", servicesError);
        throw servicesError;
      }

      // Set the last update from the services data, if available
      if (servicesData && servicesData.length > 0) {
        setLastUpdate(servicesData[0].created_at);
        console.log("Last update timestamp from services:", servicesData[0].created_at);
      }

      // Fetch all services data 
      const { data: allServicesData, error: allServicesError } = await supabase
        .from('trinks_services')
        .select('*');

      if (allServicesError) {
        console.error("Error fetching all services:", allServicesError);
        throw allServicesError;
      }

      console.log("Raw services data fetched:", allServicesData?.length || 0, "records");
      
      if (allServicesData && allServicesData.length > 0) {
        // Get the most recent service date for the period subtitle
        const sortedByDate = allServicesData
          .filter(service => service.service_date)
          .sort((a, b) => {
            const dateA = convertDateFormat(a.service_date);
            const dateB = convertDateFormat(b.service_date);
            return dateB.localeCompare(dateA);
          });
        
        if (sortedByDate.length > 0) {
          setLastServiceDate(sortedByDate[0].service_date);
        }

        setAllServicesData(allServicesData);
      } else {
        console.log("No services data returned from Supabase");
        setAllServicesData([]);
      }
      
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível atualizar os rankings e gráficos.",
        variant: "destructive"
      });
      setAllServicesData([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return {
    loading,
    lastUpdate,
    lastServiceDate,
    allServicesData,
    fetchServicesData
  };
}

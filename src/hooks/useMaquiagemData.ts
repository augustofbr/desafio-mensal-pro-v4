import { useState, useEffect } from "react";
import { convertDateFormat } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { filterDataByDateRange } from "@/lib/dateUtils";

export function useMaquiagemData(allServicesData: any[], categoryProfessionals: string[], starsByProfessional: Map<string, number> = new Map()) {
  const [maquiagemData, setMaquiagemData] = useState<any[]>([]);
  const { getFilteredDateRange } = useDateFilter();

  const processMaquiagemData = (data: any[]) => {
    if (!Array.isArray(data)) {
      console.error("Invalid maquiagem data:", data);
      setMaquiagemData([]);
      return;
    }

    console.log("Processing maquiagem data:", data.length, "services");

    const professionalPoints = data.reduce((acc: any, service: any) => {
      const professional = service.professional;

      if (!professional) return acc;

      if (!acc[professional]) {
        acc[professional] = {
          professional,
          points: 0,
          services: [],
          totalServices: 0
        };
      }

      // Pontuação: 1 ponto por serviço realizado (sem deduplicação)
      acc[professional].points += 1;
      acc[professional].totalServices += 1;

      acc[professional].services.push({
        date: convertDateFormat(service.service_date),
        name: service.service_name || "Serviço de Maquiagem",
        points: 1,
        type: 'service',
        clientName: service.client_name
      });

      return acc;
    }, {});

    // Add professionals who only have stars (with 0 points)
    starsByProfessional.forEach((starCount, professional) => {
      if (!professionalPoints[professional]) {
        professionalPoints[professional] = {
          professional,
          points: 0,
          services: [],
          totalServices: 0
        };
      }
    });

    const cleanedData = Object.values(professionalPoints).map((prof: any) => {
      const starCount = starsByProfessional.get(prof.professional) || 0;
      return {
        professional: prof.professional,
        points: prof.points,
        services: prof.services,
        totalServices: prof.totalServices,
        starCount
      };
    });

    const sortedData = cleanedData.sort(
      (a: any, b: any) => b.points - a.points
    );

    console.log("Final processed maquiagem data:", sortedData);
    setMaquiagemData(sortedData);
  };

  useEffect(() => {
    if (allServicesData && allServicesData.length > 0 && categoryProfessionals.length > 0) {
      const dateRange = getFilteredDateRange();
      const filteredData = filterDataByDateRange(allServicesData, dateRange);

      // Filter services by professionals in this category
      const categoryServices = filteredData.filter(
        service => categoryProfessionals.includes(service.professional)
      );

      console.log("Maquiagem services found:", categoryServices.length, "from", categoryProfessionals.length, "professionals");

      processMaquiagemData(categoryServices);
    } else if (starsByProfessional.size > 0) {
      processMaquiagemData([]);
    } else {
      setMaquiagemData([]);
    }
  }, [allServicesData, getFilteredDateRange, categoryProfessionals, starsByProfessional]);

  return maquiagemData;
}

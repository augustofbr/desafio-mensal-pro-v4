
import { useState, useEffect } from "react";
import { convertDateFormat } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { filterDataByDateRange } from "@/lib/dateUtils";
import { STAR_POINTS_VALUE } from "./useStarsData";

export function useManicurePedicureData(allServicesData: any[], categoryProfessionals: string[], starsByProfessional: Map<string, number> = new Map()) {
  const [manicureData, setManicureData] = useState<any[]>([]);
  const { getFilteredDateRange } = useDateFilter();

  const processManicurePedicureData = (data: any[]) => {
    if (!Array.isArray(data)) {
      console.error("Invalid manicure data:", data);
      setManicureData([]);
      return;
    }

    console.log("Processing manicure data:", data.length, "services");

    // Group by professional and calculate points with new rules
    const professionalPoints = data.reduce((acc: any, service: any) => {
      const serviceName = service.service_name || '';
      const professional = service.professional;
      const serviceDate = service.service_date;
      const clientName = service.client_name;

      if (!professional) return acc;

      if (!acc[professional]) {
        acc[professional] = {
          professional,
          points: 0,
          services: [],
          clientDays: new Set(),
          spaServices: 0
        };
      }

      // Rule 1: "SPA dos Pés" = 2 points each
      const isSpaDosPes = serviceName === "SPA dos Pés";
      if (isSpaDosPes) {
        acc[professional].points += 2;
        acc[professional].spaServices += 1;

        acc[professional].services.push({
          date: convertDateFormat(service.service_date),
          name: service.service_name,
          points: 2,
          type: 'spa'
        });
      }

      // Rule 2: Each unique client per day = 1 point
      if (clientName && clientName.trim()) {
        const clientDayKey = `${clientName.trim()}-${serviceDate}`;

        if (!acc[professional].clientDays.has(clientDayKey)) {
          acc[professional].clientDays.add(clientDayKey);
          acc[professional].points += 1;

          acc[professional].services.push({
            date: convertDateFormat(service.service_date),
            name: `Cliente: ${clientName}`,
            points: 1,
            type: 'client',
            clientName: clientName
          });
        }
      }

      return acc;
    }, {});

    // Add star points for each professional
    starsByProfessional.forEach((starCount, professional) => {
      if (!professionalPoints[professional]) {
        professionalPoints[professional] = {
          professional,
          points: 0,
          services: [],
          clientDays: new Set(),
          spaServices: 0
        };
      }

      const starPoints = starCount * STAR_POINTS_VALUE;
      professionalPoints[professional].points += starPoints;

      professionalPoints[professional].services.push({
        date: '',
        name: `Estrelas Google: ${starCount} estrela${starCount > 1 ? 's' : ''} aprovada${starCount > 1 ? 's' : ''}`,
        points: starPoints,
        type: 'star'
      });
    });

    // Clean up the data structure for final output (remove Set objects)
    const cleanedData = Object.values(professionalPoints).map((prof: any) => {
      const starCount = starsByProfessional.get(prof.professional) || 0;
      return {
        professional: prof.professional,
        points: prof.points,
        services: prof.services,
        spaServices: prof.spaServices,
        uniqueClientDays: prof.clientDays.size,
        starCount,
        starPoints: starCount * STAR_POINTS_VALUE
      };
    });

    // Sort by points (descending)
    const sortedData = cleanedData.sort(
      (a: any, b: any) => b.points - a.points
    );

    console.log("Final processed manicure data:", sortedData);
    setManicureData(sortedData);
  };

  useEffect(() => {
    if (allServicesData && allServicesData.length > 0 && categoryProfessionals.length > 0) {
      const dateRange = getFilteredDateRange();
      const filteredData = filterDataByDateRange(allServicesData, dateRange);

      // Filter services by professionals in this category
      const categoryServices = filteredData.filter(
        service => categoryProfessionals.includes(service.professional)
      );

      console.log("Manicure services found:", categoryServices.length, "from", categoryProfessionals.length, "professionals");

      processManicurePedicureData(categoryServices);
    } else if (starsByProfessional.size > 0) {
      processManicurePedicureData([]);
    } else {
      setManicureData([]);
    }
  }, [allServicesData, getFilteredDateRange, categoryProfessionals, starsByProfessional]);

  return manicureData;
}

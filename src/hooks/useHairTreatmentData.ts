
import { useState, useEffect } from "react";
import { convertDateFormat } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { filterDataByDateRange } from "@/lib/dateUtils";
import { STAR_POINTS_VALUE } from "./useStarsData";

export function useHairTreatmentData(allServicesData: any[], categoryProfessionals: string[], starsByProfessional: Map<string, number> = new Map()) {
  const [hairData, setHairData] = useState<any[]>([]);
  const { getFilteredDateRange } = useDateFilter();

  const processHairTreatmentData = (treatmentData: any[], allData: any[]) => {
    if (!Array.isArray(treatmentData)) {
      console.error("Invalid hair treatment data:", treatmentData);
      setHairData([]);
      return;
    }

    console.log("Processing hair data:", treatmentData.length, "treatment services,", allData.length, "total services");

    // Step 1: Process treatment services to identify professionals and calculate treatment points
    const professionalPoints: any = {};

    treatmentData.forEach((service: any) => {
      const professional = service.professional;

      if (!professional) return;

      if (!professionalPoints[professional]) {
        professionalPoints[professional] = {
          professional,
          points: 0,
          services: [],
          clientDays: new Set(),
          treatmentServices: 0
        };
      }

      // Rule 1: Each treatment service = 2 points
      professionalPoints[professional].points += 2;
      professionalPoints[professional].treatmentServices += 1;

      professionalPoints[professional].services.push({
        date: convertDateFormat(service.service_date),
        name: service.service_name || "Unknown Service",
        points: 2,
        type: 'treatment'
      });
    });

    // Step 2: For each professional in the ranking, count unique clients from ALL their services
    Object.keys(professionalPoints).forEach(professional => {
      const allProfessionalServices = allData.filter(
        (service: any) => service.professional === professional
      );

      allProfessionalServices.forEach((service: any) => {
        const clientName = service.client_name;
        const serviceDate = service.service_date;

        if (clientName && clientName.trim()) {
          const clientDayKey = `${clientName.trim()}-${serviceDate}`;

          if (!professionalPoints[professional].clientDays.has(clientDayKey)) {
            professionalPoints[professional].clientDays.add(clientDayKey);
            professionalPoints[professional].points += 1;

            professionalPoints[professional].services.push({
              date: convertDateFormat(service.service_date),
              name: `Cliente: ${clientName}`,
              points: 1,
              type: 'client',
              clientName: clientName
            });
          }
        }
      });
    });

    // Step 3: Add star points for each professional
    starsByProfessional.forEach((starCount, professional) => {
      if (!professionalPoints[professional]) {
        // Professional has stars but no services - add them to the ranking
        professionalPoints[professional] = {
          professional,
          points: 0,
          services: [],
          clientDays: new Set(),
          treatmentServices: 0
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
        treatmentServices: prof.treatmentServices,
        uniqueClientDays: prof.clientDays.size,
        starCount,
        starPoints: starCount * STAR_POINTS_VALUE
      };
    });

    // Sort by points (descending)
    const sortedData = cleanedData.sort(
      (a: any, b: any) => b.points - a.points
    );

    console.log("Final processed hair data:", sortedData);
    setHairData(sortedData);
  };

  useEffect(() => {
    if (allServicesData && allServicesData.length > 0 && categoryProfessionals.length > 0) {
      const dateRange = getFilteredDateRange();
      const filteredData = filterDataByDateRange(allServicesData, dateRange);

      // Filter services by professionals in this category
      const categoryServices = filteredData.filter(
        service => categoryProfessionals.includes(service.professional)
      );

      // From those, identify treatment services for bonus points
      const hairTreatments = categoryServices.filter(
        service => service.category === "Tratamentos para Cabelo"
      );

      console.log("Hair treatments found:", hairTreatments.length, "from", categoryProfessionals.length, "professionals");
      processHairTreatmentData(hairTreatments, categoryServices);
    } else if (starsByProfessional.size > 0) {
      // No services but stars exist - process stars only
      processHairTreatmentData([], []);
    } else {
      setHairData([]);
    }
  }, [allServicesData, getFilteredDateRange, categoryProfessionals, starsByProfessional]);

  return hairData;
}

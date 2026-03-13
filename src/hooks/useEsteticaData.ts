import { useState, useEffect } from "react";
import { convertDateFormat } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { filterDataByDateRange } from "@/lib/dateUtils";

export const ESTETICA_REVENUE_MINIMUM = 5000;

export function useEsteticaData(allServicesData: any[], categoryProfessionals: string[], starsByProfessional: Map<string, number> = new Map()) {
  const [esteticaData, setEsteticaData] = useState<any[]>([]);
  const { getFilteredDateRange } = useDateFilter();

  const processEsteticaData = (data: any[]) => {
    if (!Array.isArray(data)) {
      console.error("Invalid estética data:", data);
      setEsteticaData([]);
      return;
    }

    console.log("Processing estética data:", data.length, "services");

    const professionalRevenue = data.reduce((acc: any, service: any) => {
      const professional = service.professional;
      const revenue = parseFloat(service.value) || 0;

      if (!professional) return acc;

      if (!acc[professional]) {
        acc[professional] = {
          professional,
          totalRevenue: 0,
          services: [],
          serviceCount: 0
        };
      }

      acc[professional].totalRevenue += revenue;
      acc[professional].serviceCount += 1;

      acc[professional].services.push({
        date: convertDateFormat(service.service_date),
        name: service.service_name,
        points: 1,
        type: 'revenue'
      });

      return acc;
    }, {});

    // Add professionals who only have stars (with 0 revenue)
    starsByProfessional.forEach((starCount, professional) => {
      if (!professionalRevenue[professional]) {
        professionalRevenue[professional] = {
          professional,
          totalRevenue: 0,
          services: [],
          serviceCount: 0
        };
      }
    });

    const cleanedData = Object.values(professionalRevenue).map((prof: any) => {
      const revenuePercentage = Math.round(((prof.totalRevenue / ESTETICA_REVENUE_MINIMUM) * 100) * 10) / 10;
      const starCount = starsByProfessional.get(prof.professional) || 0;

      return {
        professional: prof.professional,
        totalRevenue: prof.totalRevenue,
        revenuePercentage,
        points: revenuePercentage,
        services: prof.services,
        serviceCount: prof.serviceCount,
        starCount
      };
    });

    const sortedData = cleanedData.sort(
      (a: any, b: any) => b.revenuePercentage - a.revenuePercentage
    );

    console.log("Final processed estética data:", sortedData);
    setEsteticaData(sortedData);
  };

  useEffect(() => {
    if (allServicesData && allServicesData.length > 0 && categoryProfessionals.length > 0) {
      const dateRange = getFilteredDateRange();
      const filteredData = filterDataByDateRange(allServicesData, dateRange);

      // Filter services by professionals in this category
      const categoryServices = filteredData.filter(
        service => categoryProfessionals.includes(service.professional)
      );

      console.log("Estética services found:", categoryServices.length, "from", categoryProfessionals.length, "professionals");

      processEsteticaData(categoryServices);
    } else if (starsByProfessional.size > 0) {
      processEsteticaData([]);
    } else {
      setEsteticaData([]);
    }
  }, [allServicesData, getFilteredDateRange, categoryProfessionals, starsByProfessional]);

  return esteticaData;
}

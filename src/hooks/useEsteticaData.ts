import { useState, useEffect } from "react";
import { convertDateFormat } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { filterDataByDateRange } from "@/lib/dateUtils";
import { CategoryRules } from "@/lib/rulesConfig";
import { computePointsRanking, ServiceRecord } from "@/lib/scoring";

export function useEsteticaData(allServicesData: any[], categoryProfessionals: string[], starsByProfessional: Map<string, number> = new Map(), rules: CategoryRules) {
  const [esteticaData, setEsteticaData] = useState<any[]>([]);
  const { getFilteredDateRange } = useDateFilter();

  const processEsteticaData = (data: any[], rules: CategoryRules) => {
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
        type: 'revenue',
        value: revenue
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
      const starCount = starsByProfessional.get(prof.professional) || 0;
      const revenuePercentage = Math.round(((prof.totalRevenue / rules.qualificationGoals.minRevenue!) * 100) * 10) / 10;

      if (rules.scoringModel === 'revenue-points') {
        const revenuePoints = Math.floor(prof.totalRevenue / rules.revenuePointConversion!);
        const starPoints = starCount * rules.starPointValue;
        const totalPoints = revenuePoints + starPoints;

        return {
          professional: prof.professional,
          totalRevenue: prof.totalRevenue,
          revenuePercentage,
          revenuePoints,
          starPoints,
          points: totalPoints,
          services: prof.services,
          serviceCount: prof.serviceCount,
          starCount
        };
      }

      // V1: revenue-percentage mode
      return {
        professional: prof.professional,
        totalRevenue: prof.totalRevenue,
        revenuePercentage,
        revenuePoints: 0,
        starPoints: 0,
        points: revenuePercentage,
        services: prof.services,
        serviceCount: prof.serviceCount,
        starCount
      };
    });

    const sortedData = cleanedData.sort((a: any, b: any) => {
      if (rules.scoringModel === 'revenue-points') {
        return b.points - a.points;
      }
      return b.revenuePercentage - a.revenuePercentage;
    });

    console.log("Final processed estética data:", sortedData);
    setEsteticaData(sortedData);
  };

  const processPointsData = (data: ServiceRecord[], rules: CategoryRules) => {
    const ranking = computePointsRanking({
      categoryServices: data,
      categoryProfessionals,
      starsByProfessional,
      rules,
      categoryKey: "estetica",
      specialServiceType: "special",
    });

    setEsteticaData(
      ranking.map((entry) => ({
        ...entry,
        services: entry.services.map((service) => ({
          ...service,
          date: service.date ? convertDateFormat(service.date) : "",
        })),
        // Campos de faturamento zerados: a UI legada ainda os le em alguns pontos
        totalRevenue: 0,
        revenuePercentage: 0,
        revenuePoints: 0,
      }))
    );
  };

  useEffect(() => {
    const dateRange = getFilteredDateRange();
    const filteredData = filterDataByDateRange(allServicesData || [], dateRange);
    const categoryServices = filteredData.filter(
      (service: any) => categoryProfessionals.includes(service.professional)
    );

    if (rules.scoringModel === 'points') {
      if (categoryServices.length === 0 && starsByProfessional.size === 0 && categoryProfessionals.length === 0) {
        setEsteticaData([]);
        return;
      }
      processPointsData(categoryServices, rules);
      return;
    }

    if (allServicesData && allServicesData.length > 0 && categoryProfessionals.length > 0) {
      console.log("Estética services found:", categoryServices.length, "from", categoryProfessionals.length, "professionals");
      processEsteticaData(categoryServices, rules);
    } else if (starsByProfessional.size > 0) {
      processEsteticaData([], rules);
    } else {
      setEsteticaData([]);
    }
  }, [allServicesData, getFilteredDateRange, categoryProfessionals, starsByProfessional, rules]);

  return esteticaData;
}

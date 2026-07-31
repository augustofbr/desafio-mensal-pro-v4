import { useState, useEffect } from "react";
import { convertDateFormat } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { filterDataByDateRange } from "@/lib/dateUtils";
import { CategoryRules } from "@/lib/rulesConfig";
import { computePointsRanking, normalizeProfessionalId, RankedProfessional, ServiceRecord } from "@/lib/scoring";

interface EsteticaServiceEntry {
  date: string;
  name: string;
  points: number;
  type: string;
  value: number;
}

/** Acumulador do modelo de faturamento (pre-V4), agrupado por profissionalId. */
interface EsteticaRevenueAccumulator {
  professionalId: string;
  professional: string;
  totalRevenue: number;
  services: EsteticaServiceEntry[];
  serviceCount: number;
}

export function useEsteticaData(allServicesData: any[], categoryProfessionals: RankedProfessional[], starsByProfessional: Map<string, number> = new Map(), rules: CategoryRules) {
  const [esteticaData, setEsteticaData] = useState<any[]>([]);
  const { getFilteredDateRange } = useDateFilter();

  const processEsteticaData = (data: any[], rules: CategoryRules) => {
    if (!Array.isArray(data)) {
      console.error("Invalid estética data:", data);
      setEsteticaData([]);
      return;
    }

    console.log("Processing estética data:", data.length, "services");

    // Nome de exibicao por id — o agrupamento e sempre por profissionalId.
    const nameById = new Map(categoryProfessionals.map((p) => [p.id, p.name]));

    // Map (e nao objeto) para preservar a ordem de insercao: chaves de id sao
    // numericas e um objeto as reordenaria, mudando o desempate do ranking.
    const professionalRevenue = data.reduce((acc: Map<string, EsteticaRevenueAccumulator>, service: any) => {
      const professionalId = normalizeProfessionalId(service.profissionalid);
      const revenue = parseFloat(service.value) || 0;

      if (!professionalId) return acc;

      let prof = acc.get(professionalId);
      if (!prof) {
        prof = {
          professionalId,
          professional: nameById.get(professionalId) || service.professional || professionalId,
          totalRevenue: 0,
          services: [],
          serviceCount: 0
        };
        acc.set(professionalId, prof);
      }

      prof.totalRevenue += revenue;
      prof.serviceCount += 1;

      prof.services.push({
        date: convertDateFormat(service.service_date),
        name: service.service_name,
        points: 1,
        type: 'revenue',
        value: revenue
      });

      return acc;
    }, new Map<string, EsteticaRevenueAccumulator>());

    // Add professionals who only have stars (with 0 revenue)
    starsByProfessional.forEach((starCount, professionalId) => {
      if (!professionalRevenue.has(professionalId)) {
        professionalRevenue.set(professionalId, {
          professionalId,
          professional: nameById.get(professionalId) || professionalId,
          totalRevenue: 0,
          services: [],
          serviceCount: 0
        });
      }
    });

    const cleanedData = Array.from(professionalRevenue.values()).map((prof: any) => {
      const starCount = starsByProfessional.get(prof.professionalId) || 0;
      const revenuePercentage = Math.round(((prof.totalRevenue / rules.qualificationGoals.minRevenue!) * 100) * 10) / 10;

      if (rules.scoringModel === 'revenue-points') {
        const revenuePoints = Math.floor(prof.totalRevenue / rules.revenuePointConversion!);
        const starPoints = starCount * rules.starPointValue;
        const totalPoints = revenuePoints + starPoints;

        return {
          professionalId: prof.professionalId,
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
        professionalId: prof.professionalId,
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
    const categoryIds = new Set(categoryProfessionals.map((p) => p.id));
    const categoryServices = filteredData.filter((service: any) => {
      const id = normalizeProfessionalId(service.profissionalid);
      return id != null && categoryIds.has(id);
    });

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

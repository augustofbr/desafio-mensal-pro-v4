import { useState, useEffect } from "react";
import { convertDateFormat } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { filterDataByDateRange } from "@/lib/dateUtils";
import { CategoryRules } from "@/lib/rulesConfig";
import { normalizeProfessionalId, RankedProfessional } from "@/lib/scoring";

interface MaquiagemServiceEntry {
  date: string;
  name: string;
  points: number;
  type: string;
  clientName?: string | null;
  value?: number;
}

/** Acumuladores agrupados por profissionalId. */
interface MaquiagemRevenueAccumulator {
  professionalId: string;
  professional: string;
  totalRevenue: number;
  totalServices: number;
  services: MaquiagemServiceEntry[];
}

interface MaquiagemPointsAccumulator {
  professionalId: string;
  professional: string;
  points: number;
  totalServices: number;
  services: MaquiagemServiceEntry[];
}

export function useMaquiagemData(allServicesData: any[], categoryProfessionals: RankedProfessional[], starsByProfessional: Map<string, number> = new Map(), rules: CategoryRules) {
  const [maquiagemData, setMaquiagemData] = useState<any[]>([]);
  const { getFilteredDateRange } = useDateFilter();

  const processMaquiagemData = (data: any[], rules: CategoryRules) => {
    if (!Array.isArray(data)) {
      console.error("Invalid maquiagem data:", data);
      setMaquiagemData([]);
      return;
    }

    console.log("Processing maquiagem data:", data.length, "services");

    // Nome de exibicao por id — o agrupamento e sempre por profissionalId.
    const nameById = new Map(categoryProfessionals.map((p) => [p.id, p.name]));

    if (rules.scoringModel === 'revenue-points') {
      // V2: Revenue-based points scoring
      // Map (e nao objeto) para preservar a ordem de insercao: chaves de id sao
      // numericas e um objeto as reordenaria, mudando o desempate do ranking.
      const professionalData = data.reduce((acc: Map<string, MaquiagemRevenueAccumulator>, service: any) => {
        const professionalId = normalizeProfessionalId(service.profissionalid);

        if (!professionalId) return acc;

        let prof = acc.get(professionalId);
        if (!prof) {
          prof = {
            professionalId,
            professional: nameById.get(professionalId) || service.professional || professionalId,
            totalRevenue: 0,
            totalServices: 0,
            services: [],
          };
          acc.set(professionalId, prof);
        }

        const serviceValue = parseFloat(service.value || '0');
        prof.totalRevenue += serviceValue;
        prof.totalServices += 1;

        prof.services.push({
          date: convertDateFormat(service.service_date),
          name: service.service_name || "Serviço de Maquiagem",
          points: 0,
          type: 'service',
          clientName: service.client_name,
          value: serviceValue
        });

        return acc;
      }, new Map<string, MaquiagemRevenueAccumulator>());

      // Add professionals who only have stars (with 0 revenue)
      starsByProfessional.forEach((starCount, professionalId) => {
        if (!professionalData.has(professionalId)) {
          professionalData.set(professionalId, {
            professionalId,
            professional: nameById.get(professionalId) || professionalId,
            totalRevenue: 0,
            totalServices: 0,
            services: [],
          });
        }
      });

      const cleanedData = Array.from(professionalData.values()).map((prof: any) => {
        const starCount = starsByProfessional.get(prof.professionalId) || 0;
        const revenuePoints = Math.floor(prof.totalRevenue / rules.revenuePointConversion!);
        const starPoints = starCount * rules.starPointValue;
        const totalPoints = revenuePoints + starPoints;
        const minRevenue = rules.qualificationGoals.minRevenue!;
        const revenuePercentage = Math.round(((prof.totalRevenue / minRevenue) * 100) * 10) / 10;

        return {
          professionalId: prof.professionalId,
          professional: prof.professional,
          points: totalPoints,
          services: prof.services,
          totalServices: prof.totalServices,
          starCount,
          revenuePoints,
          starPoints,
          totalRevenue: prof.totalRevenue,
          revenuePercentage,
        };
      });

      const sortedData = cleanedData.sort(
        (a: any, b: any) => b.points - a.points
      );

      console.log("Final processed maquiagem data (revenue-points):", sortedData);
      setMaquiagemData(sortedData);
    } else {
      // V1: Points-based scoring (1 point per service, no deduplication)
      const professionalPoints = data.reduce((acc: Map<string, MaquiagemPointsAccumulator>, service: any) => {
        const professionalId = normalizeProfessionalId(service.profissionalid);

        if (!professionalId) return acc;

        let prof = acc.get(professionalId);
        if (!prof) {
          prof = {
            professionalId,
            professional: nameById.get(professionalId) || service.professional || professionalId,
            points: 0,
            services: [],
            totalServices: 0
          };
          acc.set(professionalId, prof);
        }

        // Pontuação: 1 ponto por serviço realizado (sem deduplicação)
        prof.points += 1;
        prof.totalServices += 1;

        prof.services.push({
          date: convertDateFormat(service.service_date),
          name: service.service_name || "Serviço de Maquiagem",
          points: 1,
          type: 'service',
          clientName: service.client_name
        });

        return acc;
      }, new Map<string, MaquiagemPointsAccumulator>());

      // Add professionals who only have stars (with 0 points)
      starsByProfessional.forEach((starCount, professionalId) => {
        if (!professionalPoints.has(professionalId)) {
          professionalPoints.set(professionalId, {
            professionalId,
            professional: nameById.get(professionalId) || professionalId,
            points: 0,
            services: [],
            totalServices: 0
          });
        }
      });

      const cleanedData = Array.from(professionalPoints.values()).map((prof: any) => {
        const starCount = starsByProfessional.get(prof.professionalId) || 0;
        return {
          professionalId: prof.professionalId,
          professional: prof.professional,
          points: prof.points,
          services: prof.services,
          totalServices: prof.totalServices,
          starCount,
          revenuePoints: 0,
          starPoints: 0,
          totalRevenue: 0,
          revenuePercentage: 0,
        };
      });

      const sortedData = cleanedData.sort(
        (a: any, b: any) => b.points - a.points
      );

      console.log("Final processed maquiagem data:", sortedData);
      setMaquiagemData(sortedData);
    }
  };

  useEffect(() => {
    if (allServicesData && allServicesData.length > 0 && categoryProfessionals.length > 0) {
      const dateRange = getFilteredDateRange();
      const filteredData = filterDataByDateRange(allServicesData, dateRange);

      // Filter services by professionals in this category
      const categoryIds = new Set(categoryProfessionals.map((p) => p.id));
      const categoryServices = filteredData.filter(service => {
        const id = normalizeProfessionalId(service.profissionalid);
        return id != null && categoryIds.has(id);
      });

      console.log("Maquiagem services found:", categoryServices.length, "from", categoryProfessionals.length, "professionals");

      processMaquiagemData(categoryServices, rules);
    } else if (starsByProfessional.size > 0) {
      processMaquiagemData([], rules);
    } else {
      setMaquiagemData([]);
    }
  }, [allServicesData, getFilteredDateRange, categoryProfessionals, starsByProfessional, rules]);

  return maquiagemData;
}

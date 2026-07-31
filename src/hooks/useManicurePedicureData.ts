import { useState, useEffect } from "react";
import { convertDateFormat } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { filterDataByDateRange } from "@/lib/dateUtils";
import { CategoryRules } from "@/lib/rulesConfig";
import { computePointsRanking, normalizeProfessionalId, RankedProfessional, ServiceRecord } from "@/lib/scoring";

export function useManicurePedicureData(
  allServicesData: any[],
  categoryProfessionals: RankedProfessional[],
  starsByProfessional: Map<string, number> = new Map(),
  rules: CategoryRules
) {
  const [manicureData, setManicureData] = useState<any[]>([]);
  const { getFilteredDateRange } = useDateFilter();

  useEffect(() => {
    const dateRange = getFilteredDateRange();
    const filteredData = filterDataByDateRange(allServicesData || [], dateRange);
    const categoryIds = new Set(categoryProfessionals.map((p) => p.id));
    const categoryServices: ServiceRecord[] = filteredData.filter((service: ServiceRecord) => {
      const id = normalizeProfessionalId(service.profissionalid);
      return id != null && categoryIds.has(id);
    });

    if (categoryServices.length === 0 && starsByProfessional.size === 0 && categoryProfessionals.length === 0) {
      setManicureData([]);
      return;
    }

    const ranking = computePointsRanking({
      categoryServices,
      categoryProfessionals,
      starsByProfessional,
      rules,
      categoryKey: "unhas",
      specialServiceType: "spa",
    });

    setManicureData(
      ranking.map((entry) => ({
        ...entry,
        services: entry.services.map((service) => ({
          ...service,
          date: service.date ? convertDateFormat(service.date) : "",
        })),
        spaServices: entry.specialServices,
      }))
    );
  }, [allServicesData, getFilteredDateRange, categoryProfessionals, starsByProfessional, rules]);

  return manicureData;
}

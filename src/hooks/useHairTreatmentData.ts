import { useState, useEffect } from "react";
import { convertDateFormat } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { filterDataByDateRange } from "@/lib/dateUtils";
import { CategoryRules } from "@/lib/rulesConfig";
import { computePointsRanking, matchesSpecialService, ServiceRecord } from "@/lib/scoring";
import { ManufacturerData } from "@/hooks/useManufacturerData";
import { ProfissionalAtivo } from "@/types/profissionaisAtivos";

export interface InvalidTreatment {
  professional: string;
  serviceName: string;
  fabricante: string;
}

export function useHairTreatmentData(
  allServicesData: any[],
  categoryProfessionals: string[],
  starsByProfessional: Map<string, number> = new Map(),
  rules: CategoryRules,
  manufacturerData: ManufacturerData | null,
  profLookup: Map<string, ProfissionalAtivo>
) {
  const [hairData, setHairData] = useState<any[]>([]);
  const [invalidTreatments, setInvalidTreatments] = useState<InvalidTreatment[]>([]);
  const { getFilteredDateRange } = useDateFilter();

  useEffect(() => {
    const dateRange = getFilteredDateRange();
    const filteredData = filterDataByDateRange(allServicesData || [], dateRange);
    const categoryServices: ServiceRecord[] = filteredData.filter((service: ServiceRecord) =>
      categoryProfessionals.includes(service.professional as string)
    );

    if (categoryServices.length === 0 && starsByProfessional.size === 0 && categoryProfessionals.length === 0) {
      setHairData([]);
      setInvalidTreatments([]);
      return;
    }

    const applyManufacturerRule = rules.manufacturerConstraints && !!manufacturerData;

    const isSpecialServiceValid = (service: ServiceRecord): boolean => {
      if (!applyManufacturerRule) return true;
      const profissionalId = profLookup.get(service.professional as string)?.profissionalId;
      if (profissionalId == null) return false;
      return manufacturerData!.isTreatmentAllowed(service.service_name || "", profissionalId);
    };

    // Lista detalhada de tratamentos reprovados pela regra de fabricante
    const currentInvalidTreatments: InvalidTreatment[] = [];
    if (applyManufacturerRule) {
      for (const service of categoryServices) {
        if (!matchesSpecialService(service, rules, "cabelo")) continue;
        if (isSpecialServiceValid(service)) continue;
        const serviceName = service.service_name || "Unknown Service";
        currentInvalidTreatments.push({
          professional: service.professional as string,
          serviceName,
          fabricante: manufacturerData!.getTreatmentManufacturers(serviceName)[0] || "Desconhecido",
        });
      }
    }

    const ranking = computePointsRanking({
      categoryServices,
      categoryProfessionals,
      starsByProfessional,
      rules,
      categoryKey: "cabelo",
      specialServiceType: "treatment",
      isSpecialServiceValid,
    });

    setHairData(
      ranking.map((entry) => ({
        ...entry,
        services: entry.services.map((service) => ({
          ...service,
          date: service.date ? convertDateFormat(service.date) : "",
        })),
        treatmentServices: entry.specialServices,
        invalidTreatmentCount: entry.invalidSpecialServices,
      }))
    );
    setInvalidTreatments(currentInvalidTreatments);
  }, [
    allServicesData,
    getFilteredDateRange,
    categoryProfessionals,
    starsByProfessional,
    rules,
    manufacturerData,
    profLookup,
  ]);

  return { hairData, invalidTreatments };
}

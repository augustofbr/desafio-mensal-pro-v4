import { useState, useEffect } from "react";
import { convertDateFormat } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { filterDataByDateRange } from "@/lib/dateUtils";
import { CategoryRules } from "@/lib/rulesConfig";
import {
  computePointsRanking,
  matchesSpecialService,
  normalizeProfessionalId,
  RankedProfessional,
  ServiceRecord,
} from "@/lib/scoring";
import { ManufacturerData } from "@/hooks/useManufacturerData";
import { ProfissionalAtivo } from "@/types/profissionaisAtivos";

export interface InvalidTreatment {
  professional: string;
  serviceName: string;
  fabricante: string;
}

export function useHairTreatmentData(
  allServicesData: any[],
  categoryProfessionals: RankedProfessional[],
  starsByProfessional: Map<string, number> = new Map(),
  rules: CategoryRules,
  manufacturerData: ManufacturerData | null,
  profById: Map<string, ProfissionalAtivo>
) {
  const [hairData, setHairData] = useState<any[]>([]);
  const [invalidTreatments, setInvalidTreatments] = useState<InvalidTreatment[]>([]);
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
      setHairData([]);
      setInvalidTreatments([]);
      return;
    }

    const applyManufacturerRule = rules.manufacturerConstraints && !!manufacturerData;

    const resolveProf = (service: ServiceRecord): ProfissionalAtivo | undefined => {
      const id = normalizeProfessionalId(service.profissionalid);
      return id ? profById.get(id) : undefined;
    };

    const isSpecialServiceValid = (service: ServiceRecord): boolean => {
      if (!applyManufacturerRule) return true;
      const profissionalId = resolveProf(service)?.profissionalId;
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
          // Exibicao: nome canonico do cadastro, com o da linha como fallback.
          professional: resolveProf(service)?.nome_profissional || (service.professional as string) || "",
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
    profById,
  ]);

  return { hairData, invalidTreatments };
}

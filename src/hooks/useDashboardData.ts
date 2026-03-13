
import { useEffect } from "react";
import { useServicesData } from "./useServicesData";
import { useActiveProfessionals } from "./useActiveProfessionals";
import { useHairTreatmentData } from "./useHairTreatmentData";
import { useManicurePedicureData } from "./useManicurePedicureData";
import { useEsteticaData } from "./useEsteticaData";
import { useMaquiagemData } from "./useMaquiagemData";
import { useProfessionalDetails } from "./useProfessionalDetails";
import { useStarsData } from "./useStarsData";
import { getRulesForDate } from "@/lib/rulesConfig";
import { useManufacturerData } from "./useManufacturerData";
import { useDateFilter } from "@/contexts/DateFilterContext";

export function useDashboardData() {
  const { getFilteredDateRange } = useDateFilter();
  const dateRange = getFilteredDateRange();
  const rules = getRulesForDate(dateRange.startDate);

  const {
    loading: servicesLoading,
    lastUpdate,
    lastServiceDate,
    allServicesData,
    fetchServicesData
  } = useServicesData();

  const {
    activeProfessionals,
    getProfessionalsByCategory,
    profLookup,
    loading: profsLoading,
    fetchActiveProfessionals
  } = useActiveProfessionals();

  const { starsData, loading: starsLoading } = useStarsData(activeProfessionals);
  const manufacturerData = useManufacturerData(rules.cabelo.manufacturerConstraints);

  const cabeloProfessionals = getProfessionalsByCategory("Cabelo");
  const unhasProfessionals = getProfessionalsByCategory("Unhas");
  const esteticaProfessionals = getProfessionalsByCategory("Estetica");
  const maquiagemProfessionals = getProfessionalsByCategory("Maquiagem");

  const { hairData, invalidTreatments } = useHairTreatmentData(
    allServicesData, cabeloProfessionals, starsData.cabelo,
    rules.cabelo, manufacturerData, profLookup
  );
  const manicureData = useManicurePedicureData(allServicesData, unhasProfessionals, starsData.unhas, rules.unhas);
  const esteticaData = useEsteticaData(allServicesData, esteticaProfessionals, starsData.estetica, rules.estetica);
  const maquiagemData = useMaquiagemData(allServicesData, maquiagemProfessionals, starsData.maquiagem, rules.maquiagem);

  const {
    selectedProfessional,
    selectedCategory,
    professionalDetails,
    loading: detailsLoading,
    selectProfessional
  } = useProfessionalDetails(rules, manufacturerData, profLookup, starsData);

  // Fetch data on initial load
  useEffect(() => {
    fetchServicesData();
    fetchActiveProfessionals();
  }, [fetchServicesData, fetchActiveProfessionals]);

  // Combined loading state
  const loading = servicesLoading || profsLoading || detailsLoading || starsLoading ||
    (rules.cabelo.manufacturerConstraints && manufacturerData.isLoading);

  return {
    loading,
    lastUpdate,
    lastServiceDate,
    hairData,
    manicureData,
    esteticaData,
    maquiagemData,
    invalidTreatments,
    rules,
    refreshData: fetchServicesData,
    selectedProfessional,
    professionalDetails,
    selectProfessional
  };
}

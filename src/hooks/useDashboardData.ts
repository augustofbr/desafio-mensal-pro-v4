
import { useEffect } from "react";
import { useServicesData } from "./useServicesData";
import { useActiveProfessionals } from "./useActiveProfessionals";
import { useHairTreatmentData } from "./useHairTreatmentData";
import { useManicurePedicureData } from "./useManicurePedicureData";
import { useEsteticaData } from "./useEsteticaData";
import { useMaquiagemData } from "./useMaquiagemData";
import { useProfessionalDetails } from "./useProfessionalDetails";
import { useStarsData } from "./useStarsData";

export function useDashboardData() {
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
    loading: profsLoading,
    fetchActiveProfessionals
  } = useActiveProfessionals();

  const { starsData, loading: starsLoading } = useStarsData(activeProfessionals);

  const cabeloProfessionals = getProfessionalsByCategory("Cabelo");
  const unhasProfessionals = getProfessionalsByCategory("Unhas");
  const esteticaProfessionals = getProfessionalsByCategory("Estetica");
  const maquiagemProfessionals = getProfessionalsByCategory("Maquiagem");

  const hairData = useHairTreatmentData(allServicesData, cabeloProfessionals, starsData.cabelo);
  const manicureData = useManicurePedicureData(allServicesData, unhasProfessionals, starsData.unhas);
  const esteticaData = useEsteticaData(allServicesData, esteticaProfessionals, starsData.estetica);
  const maquiagemData = useMaquiagemData(allServicesData, maquiagemProfessionals, starsData.maquiagem);

  const {
    selectedProfessional,
    selectedCategory,
    professionalDetails,
    loading: detailsLoading,
    selectProfessional
  } = useProfessionalDetails();

  // Fetch data on initial load
  useEffect(() => {
    fetchServicesData();
    fetchActiveProfessionals();
  }, [fetchServicesData, fetchActiveProfessionals]);

  // Combined loading state
  const loading = servicesLoading || profsLoading || detailsLoading || starsLoading;

  return {
    loading,
    lastUpdate,
    lastServiceDate,
    hairData,
    manicureData,
    esteticaData,
    maquiagemData,
    refreshData: fetchServicesData,
    selectedProfessional,
    professionalDetails,
    selectProfessional
  };
}

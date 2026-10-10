
import { useEffect } from "react";
import { useServicesData } from "./useServicesData";
import { useActiveProfessionals } from "./useActiveProfessionals";
import { useHairTreatmentData } from "./useHairTreatmentData";
import { useManicurePedicureData } from "./useManicurePedicureData";
import { useEsteticaData } from "./useEsteticaData";
import { useMaquiagemData } from "./useMaquiagemData";
import { useProfessionalDetails } from "./useProfessionalDetails";
import { useStarsData } from "./useStarsData";
import { getRulesForDateFromVersions } from "@/lib/rulesConfig";
import { useManufacturerData } from "./useManufacturerData";
import { estadoMarcas, mesDaData } from "@/lib/marcasPorMes";
import { useRulesData } from "./useRulesData";
import { useDateFilter } from "@/contexts/DateFilterContext";

// Referencia estavel para o ranking de Cabelo suprimido (ver `cabeloIndisponivel`).
const SEM_RANKING: never[] = [];

export function useDashboardData() {
  const { getFilteredDateRange } = useDateFilter();
  const dateRange = getFilteredDateRange();
  const { allVersions } = useRulesData();
  const rules = getRulesForDateFromVersions(dateRange.startDate, allVersions);

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
    profById,
    loading: profsLoading,
    fetchActiveProfessionals
  } = useActiveProfessionals();

  const { starsData, loading: starsLoading, error: starsError } = useStarsData(activeProfessionals);
  // Marcas autorizadas sao versionadas por mes: mesmo mes de referencia das regras.
  const manufacturerData = useManufacturerData(
    rules.cabelo.manufacturerConstraints,
    mesDaData(dateRange.startDate)
  );

  const cabeloProfessionals = getProfessionalsByCategory("Cabelo");
  const unhasProfessionals = getProfessionalsByCategory("Unhas");
  const esteticaProfessionals = getProfessionalsByCategory("Estetica");
  const maquiagemProfessionals = getProfessionalsByCategory("Maquiagem");

  const { hairData, invalidTreatments } = useHairTreatmentData(
    allServicesData, cabeloProfessionals, starsData.cabelo,
    rules.cabelo, manufacturerData, profById
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
  } = useProfessionalDetails(rules, manufacturerData, profById, starsData);

  // Fetch data on initial load
  useEffect(() => {
    fetchServicesData();
    fetchActiveProfessionals();
  }, [fetchServicesData, fetchActiveProfessionals]);

  // Com a regra de marca ligada e a leitura das marcas falhando, todo tratamento
  // seria reprovado: o ranking de Cabelo sairia com numeros falsos em silencio.
  // Nesse caso ele e suprimido e a pagina mostra o aviso `cabeloIndisponivel`.
  const marcas = estadoMarcas(
    rules.cabelo.manufacturerConstraints,
    manufacturerData.isLoading,
    manufacturerData.isError
  );
  const cabeloIndisponivel = marcas === "erro"
    ? "Não foi possível carregar as marcas autorizadas. O ranking de Cabelo deste período está indisponível; recarregue a página em instantes."
    : null;

  // Combined loading state
  const loading = servicesLoading || profsLoading || detailsLoading || starsLoading ||
    marcas === "carregando";

  return {
    loading,
    lastUpdate,
    lastServiceDate,
    hairData: cabeloIndisponivel ? SEM_RANKING : hairData,
    cabeloIndisponivel,
    manicureData,
    esteticaData,
    maquiagemData,
    invalidTreatments: cabeloIndisponivel ? SEM_RANKING : invalidTreatments,
    rules,
    // Estrelas aprovadas do periodo por profissional (mesmo dado do scoring);
    // o Bonus Estrelas as le sem uma segunda consulta.
    starsData,
    starsError,
    refreshData: fetchServicesData,
    selectedProfessional,
    professionalDetails: cabeloIndisponivel && selectedCategory === "Cabelo" ? null : professionalDetails,
    selectProfessional,
    activeProfessionals
  };
}

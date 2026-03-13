
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { convertDateFormat } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { filterDataByDateRange } from "@/lib/dateUtils";
import { RulesVersion, getCategoryRules } from "@/lib/rulesConfig";
import { ManufacturerData } from "@/hooks/useManufacturerData";
import { ProfissionalAtivo } from "@/types/profissionaisAtivos";

interface StarsByCategory {
  cabelo: Map<string, number>;
  unhas: Map<string, number>;
  estetica: Map<string, number>;
  maquiagem: Map<string, number>;
}

export function useProfessionalDetails(
  rules: RulesVersion,
  manufacturerData: ManufacturerData | null,
  profLookup: Map<string, ProfissionalAtivo>,
  starsData: StarsByCategory
) {
  const [selectedProfessional, setSelectedProfessional] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [professionalDetails, setProfessionalDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { getFilteredDateRange } = useDateFilter();

  const fetchProfessionalDetails = useCallback(async (professional: string, category: string | null) => {
    if (!professional) {
      setProfessionalDetails(null);
      return;
    }

    try {
      setLoading(true);

      const { data: servicesData, error: servicesError } = await supabase
        .from('trinks_services')
        .select('*')
        .eq('professional', professional);

      if (servicesError) {
        console.error("Error fetching professional services:", servicesError);
        throw servicesError;
      }

      if (servicesData && servicesData.length > 0) {
        const dateRange = getFilteredDateRange();
        let filteredData = filterDataByDateRange(servicesData, dateRange);
        const allProfessionalServices = [...filteredData];

        if (category) {
          if (category === "Cabelo") {
            filteredData = filteredData.filter(service => service.category === "Tratamentos para Cabelo");
          } else if (category === "Unhas") {
            filteredData = filteredData.filter(service => service.category === "Manicure e Pedicure");
          }
        }

        const categoryRules = category ? getCategoryRules(rules, category) : null;
        const starCategoryKey = (category?.toLowerCase() || '') as keyof StarsByCategory;
        const starCount = starsData[starCategoryKey]?.get(professional) || 0;
        const profissionalId = profLookup.get(professional)?.profissionalId;

        let rawServices: any[] = [];
        let serviceSummary: any = {};
        let totalPoints = 0;
        let summaryData: any = {};
        let invalidTreatmentsList: any[] = [];

        if (category === "Cabelo" && categoryRules) {
          const treatmentPointValue = categoryRules.specialServicePointValue;
          const professionalData = { clientDays: new Set<string>(), treatmentServices: 0, invalidTreatmentCount: 0, points: 0 };

          filteredData.forEach(service => {
            const serviceName = service.service_name || "Unknown Service";
            let isValid = true;

            if (categoryRules.manufacturerConstraints && manufacturerData && profissionalId) {
              isValid = manufacturerData.isTreatmentAllowed(serviceName, profissionalId);
            }

            if (isValid) {
              rawServices.push({
                date: convertDateFormat(service.service_date),
                name: serviceName,
                points: treatmentPointValue,
                type: 'treatment'
              });
              if (!serviceSummary[serviceName]) {
                serviceSummary[serviceName] = { name: serviceName, count: 0, points: 0, pointsPerService: treatmentPointValue };
              }
              serviceSummary[serviceName].count++;
              serviceSummary[serviceName].points += treatmentPointValue;
              professionalData.points += treatmentPointValue;
              professionalData.treatmentServices++;
            } else {
              professionalData.invalidTreatmentCount++;
              const fabricantes = manufacturerData?.getTreatmentManufacturers(serviceName) || [];
              invalidTreatmentsList.push({
                serviceName,
                fabricante: fabricantes[0] || 'Desconhecido',
                date: convertDateFormat(service.service_date)
              });
            }
          });

          allProfessionalServices.forEach(service => {
            const clientName = service.client_name;
            const serviceDate = service.service_date;
            if (clientName && clientName.trim()) {
              const clientDayKey = `${clientName.trim()}-${serviceDate}`;
              if (!professionalData.clientDays.has(clientDayKey)) {
                professionalData.clientDays.add(clientDayKey);
                rawServices.push({
                  date: convertDateFormat(service.service_date),
                  name: `Cliente: ${clientName}`,
                  points: 1,
                  type: 'client',
                  clientName
                });
                const clientServiceName = `Cliente: ${clientName}`;
                if (!serviceSummary[clientServiceName]) {
                  serviceSummary[clientServiceName] = { name: clientServiceName, count: 0, points: 0, pointsPerService: 1 };
                }
                serviceSummary[clientServiceName].count++;
                serviceSummary[clientServiceName].points += 1;
                professionalData.points += 1;
              }
            }
          });

          const starPoints = categoryRules.starsCountInScore ? starCount * categoryRules.starPointValue : 0;
          totalPoints = professionalData.points + starPoints;

          const treatmentSummaryServices = Object.values(serviceSummary).filter((s: any) => !s.name.startsWith("Cliente:"));
          const clientServices = Object.values(serviceSummary).filter((s: any) => s.name.startsWith("Cliente:"));

          summaryData = {
            treatmentCount: professionalData.treatmentServices,
            treatmentPoints: treatmentSummaryServices.reduce((sum: number, s: any) => sum + s.points, 0),
            hairUniqueClients: professionalData.clientDays.size,
            hairClientPoints: clientServices.reduce((sum: number, s: any) => sum + s.points, 0),
            invalidTreatmentCount: professionalData.invalidTreatmentCount,
            invalidTreatments: invalidTreatmentsList,
            starCount,
            starPoints
          };

        } else if (category === "Unhas" && categoryRules) {
          const spaPointValue = categoryRules.specialServicePointValue;
          const professionalData = { clientDays: new Set<string>(), spaServices: 0, points: 0 };

          filteredData.forEach(service => {
            const serviceName = service.service_name || '';
            if (serviceName === "SPA dos Pés") {
              rawServices.push({
                date: convertDateFormat(service.service_date),
                name: serviceName,
                points: spaPointValue,
                type: 'spa'
              });
              if (!serviceSummary[serviceName]) {
                serviceSummary[serviceName] = { name: serviceName, count: 0, points: 0, pointsPerService: spaPointValue };
              }
              serviceSummary[serviceName].count++;
              serviceSummary[serviceName].points += spaPointValue;
              professionalData.points += spaPointValue;
              professionalData.spaServices++;
            }
          });

          allProfessionalServices.forEach(service => {
            const clientName = service.client_name;
            const serviceDate = service.service_date;
            if (clientName && clientName.trim()) {
              const clientDayKey = `${clientName.trim()}-${serviceDate}`;
              if (!professionalData.clientDays.has(clientDayKey)) {
                professionalData.clientDays.add(clientDayKey);
                rawServices.push({
                  date: convertDateFormat(service.service_date),
                  name: `Cliente: ${clientName}`,
                  points: 1,
                  type: 'client',
                  clientName
                });
                const clientServiceName = `Cliente: ${clientName}`;
                if (!serviceSummary[clientServiceName]) {
                  serviceSummary[clientServiceName] = { name: clientServiceName, count: 0, points: 0, pointsPerService: 1 };
                }
                serviceSummary[clientServiceName].count++;
                serviceSummary[clientServiceName].points += 1;
                professionalData.points += 1;
              }
            }
          });

          const starPoints = categoryRules.starsCountInScore ? starCount * categoryRules.starPointValue : 0;
          totalPoints = professionalData.points + starPoints;

          const spaServicesSummary = Object.values(serviceSummary).find((s: any) => s.name === "SPA dos Pés") as any;
          const clientServices = Object.values(serviceSummary).filter((s: any) => s.name.startsWith("Cliente:"));

          summaryData = {
            spaCount: professionalData.spaServices,
            spaPoints: spaServicesSummary?.points || 0,
            manicureUniqueClients: professionalData.clientDays.size,
            manicureClientPoints: clientServices.reduce((sum: number, s: any) => sum + s.points, 0),
            starCount,
            starPoints
          };

        } else if (category === "Estetica" && categoryRules) {
          let totalRevenue = 0;

          filteredData.forEach(service => {
            const serviceName = service.service_name || "Serviço de Estética";
            const revenue = parseFloat(service.value) || 0;

            if (!serviceSummary[serviceName]) {
              serviceSummary[serviceName] = { name: serviceName, count: 0, points: 0, pointsPerService: 1 };
            }
            serviceSummary[serviceName].count++;
            serviceSummary[serviceName].points += 1;
            totalRevenue += revenue;

            rawServices.push({
              date: convertDateFormat(service.service_date),
              name: serviceName,
              points: categoryRules.scoringModel === 'revenue-points' ? 0 : 1,
              type: 'revenue'
            });
          });

          const minRevenue = categoryRules.qualificationGoals.minRevenue || 5000;
          const revenuePercentage = Math.round(((totalRevenue / minRevenue) * 100) * 10) / 10;

          if (categoryRules.scoringModel === 'revenue-points') {
            const revenuePoints = Math.floor(totalRevenue / categoryRules.revenuePointConversion!);
            const starPoints = starCount * categoryRules.starPointValue;
            totalPoints = revenuePoints + starPoints;
            summaryData = {
              esteticaServiceCount: filteredData.length,
              esteticaRevenuePercentage: revenuePercentage,
              revenuePoints,
              starPoints,
              starCount,
              totalPoints
            };
          } else {
            totalPoints = revenuePercentage;
            summaryData = {
              esteticaServiceCount: filteredData.length,
              esteticaRevenuePercentage: revenuePercentage,
              revenuePoints: 0,
              starPoints: 0,
              starCount,
              totalPoints
            };
          }

        } else if (category === "Maquiagem" && categoryRules) {
          if (categoryRules.scoringModel === 'revenue-points') {
            let totalRevenue = 0;

            filteredData.forEach(service => {
              const serviceName = service.service_name || "Serviço de Maquiagem";
              const revenue = parseFloat(service.value) || 0;

              if (!serviceSummary[serviceName]) {
                serviceSummary[serviceName] = { name: serviceName, count: 0, points: 0, pointsPerService: 1 };
              }
              serviceSummary[serviceName].count++;
              serviceSummary[serviceName].points += 1;
              totalRevenue += revenue;

              rawServices.push({
                date: convertDateFormat(service.service_date),
                name: serviceName,
                points: 0,
                type: 'revenue'
              });
            });

            const minRevenue = categoryRules.qualificationGoals.minRevenue || 3500;
            const revenuePercentage = Math.round(((totalRevenue / minRevenue) * 100) * 10) / 10;
            const revenuePoints = Math.floor(totalRevenue / categoryRules.revenuePointConversion!);
            const starPoints = starCount * categoryRules.starPointValue;
            totalPoints = revenuePoints + starPoints;

            summaryData = {
              maquiagemTotalServices: filteredData.length,
              maquiagemTotalPoints: totalPoints,
              revenuePoints,
              starPoints,
              starCount,
              revenuePercentage
            };
          } else {
            filteredData.forEach(service => {
              const serviceName = service.service_name || "Serviço de Maquiagem";
              if (!serviceSummary[serviceName]) {
                serviceSummary[serviceName] = { name: serviceName, count: 0, points: 0, pointsPerService: 1 };
              }
              serviceSummary[serviceName].count++;
              serviceSummary[serviceName].points += 1;

              rawServices.push({
                date: convertDateFormat(service.service_date),
                name: serviceName,
                points: 1,
                type: 'service',
                clientName: service.client_name
              });
            });

            totalPoints = filteredData.length;
            summaryData = {
              maquiagemTotalServices: filteredData.length,
              maquiagemTotalPoints: totalPoints,
              revenuePoints: 0,
              starPoints: 0,
              starCount,
              revenuePercentage: 0
            };
          }
        } else {
          rawServices = filteredData.map(service => ({
            date: convertDateFormat(service.service_date),
            name: service.service_name || "Unknown Service",
            points: 1
          }));

          serviceSummary = filteredData.reduce((acc: any, service: any) => {
            const serviceName = service.service_name || "Unknown Service";
            if (!acc[serviceName]) {
              acc[serviceName] = { name: serviceName, count: 0, points: 0, pointsPerService: 1, services: [] };
            }
            acc[serviceName].count++;
            acc[serviceName].points += acc[serviceName].pointsPerService;
            return acc;
          }, {});

          totalPoints = Object.values(serviceSummary).reduce((sum: number, service: any) => sum + service.points, 0);
        }

        const servicesArray = Object.values(serviceSummary)
          .filter((service: any) => service.pointsPerService > 0)
          .sort((a: any, b: any) => b.count - a.count);

        const details = {
          professional,
          services: servicesArray,
          rawServices,
          totalServices: servicesArray.reduce((sum: number, service: any) => sum + service.count, 0),
          totalPoints,
          category,
          summary: summaryData,
          scoringModel: categoryRules?.scoringModel || 'points'
        };

        setProfessionalDetails(details);
      } else {
        setProfessionalDetails({
          professional,
          services: [],
          rawServices: [],
          totalServices: 0,
          totalPoints: 0,
          category,
          summary: {},
          scoringModel: 'points'
        });
      }
    } catch (error: any) {
      console.error("Error fetching professional details:", error);
      toast({
        title: "Erro ao carregar detalhes",
        description: "Não foi possível recuperar informações do profissional.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast, getFilteredDateRange, rules, manufacturerData, profLookup, starsData]);

  const selectProfessional = useCallback((professional: string | null, category: string | null) => {
    setSelectedProfessional(professional);
    setSelectedCategory(category);
    if (professional) {
      fetchProfessionalDetails(professional, category);
    } else {
      setProfessionalDetails(null);
    }
  }, [fetchProfessionalDetails]);

  return {
    selectedProfessional,
    selectedCategory,
    professionalDetails,
    loading,
    selectProfessional
  };
}


import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { convertDateFormat } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { filterDataByDateRange } from "@/lib/dateUtils";
import { ESTETICA_REVENUE_MINIMUM } from "@/hooks/useEsteticaData";

export function useProfessionalDetails() {
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

      // Fetch all services data for this professional
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

        // Save all date-filtered services (before category filter) for unique client counting
        const allProfessionalServices = [...filteredData];

        if (category) {
          if (category === "Cabelo") {
            filteredData = filteredData.filter(service => service.category === "Tratamentos para Cabelo");
          } else if (category === "Unhas") {
            filteredData = filteredData.filter(service => service.category === "Manicure e Pedicure");
          }
          // Estética e Maquiagem: consideram TODOS os serviços do profissional
        }

        console.log(`Filtered services for ${professional} in category ${category}:`, filteredData.length);

        let rawServices: any[] = [];

        if (category === "Cabelo") {
          const professionalData = {
            clientDays: new Set(),
            services: [] as any[]
          };

          filteredData.forEach(service => {
            rawServices.push({
              date: convertDateFormat(service.service_date),
              name: service.service_name || "Unknown Service",
              points: 2,
              type: 'treatment'
            });
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
                  clientName: clientName
                });
              }
            }
          });
        } else if (category === "Unhas") {
          const professionalData = {
            clientDays: new Set(),
            services: [] as any[]
          };

          filteredData.forEach(service => {
            const serviceName = service.service_name || '';

            if (serviceName === "SPA dos Pés") {
              rawServices.push({
                date: convertDateFormat(service.service_date),
                name: service.service_name,
                points: 2,
                type: 'spa'
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
                  clientName: clientName
                });
              }
            }
          });
        } else if (category === "Estetica") {
          filteredData.forEach(service => {
            rawServices.push({
              date: convertDateFormat(service.service_date),
              name: service.service_name || "Serviço de Estética",
              points: 1,
              type: 'revenue'
            });
          });
        } else if (category === "Maquiagem") {
          filteredData.forEach(service => {
            rawServices.push({
              date: convertDateFormat(service.service_date),
              name: service.service_name || "Serviço de Maquiagem",
              points: 1,
              type: 'service',
              clientName: service.client_name
            });
          });
        } else {
          rawServices = filteredData.map(service => ({
            date: convertDateFormat(service.service_date),
            name: service.service_name || "Unknown Service",
            points: 1
          }));
        }

        // Group services by name
        let serviceSummary: any = {};
        let totalPoints = 0;

        if (category === "Cabelo") {
          const professionalData = {
            clientDays: new Set(),
            treatmentServices: 0,
            points: 0
          };

          filteredData.forEach(service => {
            const serviceName = service.service_name || "Unknown Service";

            if (!serviceSummary[serviceName]) {
              serviceSummary[serviceName] = {
                name: serviceName,
                count: 0,
                points: 0,
                pointsPerService: 2
              };
            }
            serviceSummary[serviceName].count++;
            serviceSummary[serviceName].points += 2;
            professionalData.points += 2;
            professionalData.treatmentServices++;
          });

          allProfessionalServices.forEach(service => {
            const clientName = service.client_name;
            const serviceDate = service.service_date;

            if (clientName && clientName.trim()) {
              const clientDayKey = `${clientName.trim()}-${serviceDate}`;

              if (!professionalData.clientDays.has(clientDayKey)) {
                professionalData.clientDays.add(clientDayKey);

                const clientServiceName = `Cliente: ${clientName}`;
                if (!serviceSummary[clientServiceName]) {
                  serviceSummary[clientServiceName] = {
                    name: clientServiceName,
                    count: 0,
                    points: 0,
                    pointsPerService: 1
                  };
                }
                serviceSummary[clientServiceName].count++;
                serviceSummary[clientServiceName].points += 1;
                professionalData.points += 1;
              }
            }
          });

          totalPoints = professionalData.points;
        } else if (category === "Unhas") {
          const professionalData = {
            clientDays: new Set(),
            spaServices: 0,
            points: 0
          };

          filteredData.forEach(service => {
            const serviceName = service.service_name || '';

            if (serviceName === "SPA dos Pés") {
              if (!serviceSummary[serviceName]) {
                serviceSummary[serviceName] = {
                  name: serviceName,
                  count: 0,
                  points: 0,
                  pointsPerService: 2
                };
              }
              serviceSummary[serviceName].count++;
              serviceSummary[serviceName].points += 2;
              professionalData.points += 2;
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

                const clientServiceName = `Cliente: ${clientName}`;
                if (!serviceSummary[clientServiceName]) {
                  serviceSummary[clientServiceName] = {
                    name: clientServiceName,
                    count: 0,
                    points: 0,
                    pointsPerService: 1
                  };
                }
                serviceSummary[clientServiceName].count++;
                serviceSummary[clientServiceName].points += 1;
                professionalData.points += 1;
              }
            }
          });

          totalPoints = professionalData.points;
        } else if (category === "Estetica") {
          let totalRevenue = 0;

          filteredData.forEach(service => {
            const serviceName = service.service_name || "Serviço de Estética";
            const revenue = parseFloat(service.value) || 0;

            if (!serviceSummary[serviceName]) {
              serviceSummary[serviceName] = {
                name: serviceName,
                count: 0,
                points: 0,
                pointsPerService: 1
              };
            }
            serviceSummary[serviceName].count++;
            serviceSummary[serviceName].points += 1;
            totalRevenue += revenue;
          });

          const revenuePercentage = Math.round(((totalRevenue / ESTETICA_REVENUE_MINIMUM) * 100) * 10) / 10;
          totalPoints = revenuePercentage;
        } else if (category === "Maquiagem") {
          filteredData.forEach(service => {
            const serviceName = service.service_name || "Serviço de Maquiagem";

            if (!serviceSummary[serviceName]) {
              serviceSummary[serviceName] = {
                name: serviceName,
                count: 0,
                points: 0,
                pointsPerService: 1
              };
            }
            serviceSummary[serviceName].count++;
            serviceSummary[serviceName].points += 1;
          });

          totalPoints = filteredData.length;
        } else {
          serviceSummary = filteredData.reduce((acc: any, service: any) => {
            const serviceName = service.service_name || "Unknown Service";

            if (!acc[serviceName]) {
              acc[serviceName] = {
                name: serviceName,
                count: 0,
                points: 0,
                pointsPerService: 1,
                services: []
              };
            }

            acc[serviceName].count++;
            acc[serviceName].points += acc[serviceName].pointsPerService;

            return acc;
          }, {});

          totalPoints = Object.values(serviceSummary).reduce((sum: number, service: any) => sum + service.points, 0);
        }

        // Convert to array and sort by count
        const servicesArray = Object.values(serviceSummary)
          .filter((service: any) => service.pointsPerService > 0)
          .sort((a: any, b: any) => b.count - a.count);

        // Calculate category-specific summary data
        let summaryData = {};

        if (category === "Cabelo") {
          const treatmentServices = servicesArray.filter((s: any) => !s.name.startsWith("Cliente:"));
          const clientServices = servicesArray.filter((s: any) => s.name.startsWith("Cliente:"));

          summaryData = {
            treatmentCount: treatmentServices.reduce((sum: number, s: any) => sum + s.count, 0),
            treatmentPoints: treatmentServices.reduce((sum: number, s: any) => sum + s.points, 0),
            hairUniqueClients: clientServices.length,
            hairClientPoints: clientServices.reduce((sum: number, s: any) => sum + s.points, 0)
          };
        } else if (category === "Unhas") {
          const spaServices = servicesArray.find((s: any) => s.name === "SPA dos Pés");
          const clientServices = servicesArray.filter((s: any) => s.name.startsWith("Cliente:"));

          summaryData = {
            spaCount: spaServices?.count || 0,
            spaPoints: spaServices?.points || 0,
            manicureUniqueClients: clientServices.length,
            manicureClientPoints: clientServices.reduce((sum: number, s: any) => sum + s.points, 0)
          };
        } else if (category === "Estetica") {
          const esteticaServiceCount = servicesArray.reduce((sum: number, s: any) => sum + s.count, 0);
          const esteticaRevenuePercentage = totalPoints; // Already calculated as percentage

          summaryData = {
            esteticaServiceCount,
            esteticaRevenuePercentage
          };
        } else if (category === "Maquiagem") {
          summaryData = {
            maquiagemTotalServices: servicesArray.reduce((sum: number, s: any) => sum + s.count, 0),
            maquiagemTotalPoints: totalPoints
          };
        }

        const details = {
          professional,
          services: servicesArray,
          rawServices: rawServices,
          totalServices: servicesArray.reduce((sum: number, service: any) => sum + service.count, 0),
          totalPoints: totalPoints,
          category: category,
          summary: summaryData
        };

        console.log("Professional details:", details);
        setProfessionalDetails(details);
      } else {
        setProfessionalDetails({
          professional,
          services: [],
          rawServices: [],
          totalServices: 0,
          totalPoints: 0,
          category: category,
          summary: {}
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
  }, [toast, getFilteredDateRange]);

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

export interface CategoryRules {
  scoringModel: 'points' | 'revenue-percentage' | 'revenue-points';
  clientPointValue: number;
  specialServicePointValue: number;
  specialServiceLabel: string;
  starPointValue: number;
  starsCountInScore: boolean;
  revenuePointConversion?: number;
  qualificationGoals: {
    minUniqueClients?: number;
    minSpecialServices?: number;
    minRevenue?: number;
    minServices?: number;
  };
  symbolicGoals: {
    stars?: number;
  };
  manufacturerConstraints: boolean;
  prize: string;
}

export interface RulesVersion {
  id: string;
  validFrom: string;
  cabelo: CategoryRules;
  unhas: CategoryRules;
  estetica: CategoryRules;
  maquiagem: CategoryRules;
}

const RULES_V1: RulesVersion = {
  id: 'v1',
  validFrom: '2000-01',
  cabelo: {
    scoringModel: 'points',
    clientPointValue: 1,
    specialServicePointValue: 2,
    specialServiceLabel: 'Tratamentos',
    starPointValue: 3,
    starsCountInScore: true,
    qualificationGoals: { minUniqueClients: 60 },
    symbolicGoals: {},
    manufacturerConstraints: false,
    prize: 'R$300',
  },
  unhas: {
    scoringModel: 'points',
    clientPointValue: 1,
    specialServicePointValue: 2,
    specialServiceLabel: 'SPA dos Pés',
    starPointValue: 3,
    starsCountInScore: true,
    qualificationGoals: { minUniqueClients: 50 },
    symbolicGoals: {},
    manufacturerConstraints: false,
    prize: 'R$200',
  },
  estetica: {
    scoringModel: 'revenue-percentage',
    clientPointValue: 0,
    specialServicePointValue: 0,
    specialServiceLabel: 'Serviços',
    starPointValue: 3,
    starsCountInScore: false,
    revenuePointConversion: undefined,
    qualificationGoals: { minRevenue: 5000 },
    symbolicGoals: {},
    manufacturerConstraints: false,
    prize: 'R$200',
  },
  maquiagem: {
    scoringModel: 'points',
    clientPointValue: 0,
    specialServicePointValue: 1,
    specialServiceLabel: 'Serviços',
    starPointValue: 3,
    starsCountInScore: false,
    qualificationGoals: { minServices: 25 },
    symbolicGoals: {},
    manufacturerConstraints: false,
    prize: 'R$200',
  },
};

const RULES_V2: RulesVersion = {
  id: 'v2',
  validFrom: '2026-03',
  cabelo: {
    scoringModel: 'points',
    clientPointValue: 1,
    specialServicePointValue: 3,
    specialServiceLabel: 'Tratamentos',
    starPointValue: 3,
    starsCountInScore: true,
    qualificationGoals: { minUniqueClients: 50, minSpecialServices: 40 },
    symbolicGoals: { stars: 30 },
    manufacturerConstraints: true,
    prize: 'SPA Especial + Voucher surpresa',
  },
  unhas: {
    scoringModel: 'points',
    clientPointValue: 1,
    specialServicePointValue: 3,
    specialServiceLabel: 'SPA dos Pés',
    starPointValue: 3,
    starsCountInScore: true,
    qualificationGoals: { minUniqueClients: 70, minSpecialServices: 10 },
    symbolicGoals: { stars: 30 },
    manufacturerConstraints: false,
    prize: 'SPA Especial + Voucher surpresa',
  },
  estetica: {
    scoringModel: 'revenue-points',
    clientPointValue: 0,
    specialServicePointValue: 0,
    specialServiceLabel: 'Serviços',
    starPointValue: 3,
    starsCountInScore: true,
    revenuePointConversion: 100,
    qualificationGoals: { minRevenue: 10000 },
    symbolicGoals: { stars: 30 },
    manufacturerConstraints: false,
    prize: 'SPA Especial + Voucher surpresa',
  },
  maquiagem: {
    scoringModel: 'revenue-points',
    clientPointValue: 0,
    specialServicePointValue: 0,
    specialServiceLabel: 'Serviços',
    starPointValue: 3,
    starsCountInScore: true,
    revenuePointConversion: 100,
    qualificationGoals: { minRevenue: 3500 },
    symbolicGoals: { stars: 15 },
    manufacturerConstraints: false,
    prize: 'SPA Especial + Voucher surpresa',
  },
};

const RULES_VERSIONS: RulesVersion[] = [RULES_V1, RULES_V2];

export function getRulesForDate(startDate: string): RulesVersion {
  const yearMonth = startDate.substring(0, 7);
  let selectedVersion = RULES_VERSIONS[0];
  for (const version of RULES_VERSIONS) {
    if (yearMonth >= version.validFrom) {
      selectedVersion = version;
    }
  }
  return selectedVersion;
}

export function getCategoryRules(
  rules: RulesVersion,
  category: string
): CategoryRules {
  const key = category.toLowerCase() as keyof Omit<RulesVersion, 'id' | 'validFrom'>;
  return rules[key] as CategoryRules;
}

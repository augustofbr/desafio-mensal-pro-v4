/**
 * Categorias baseadas na tabela profissionais_ativos
 * Os valores correspondem à coluna 'categoria' da tabela 'profissionais_ativos'
 */
export const PROF_CATEGORIES = {
  CABELO: "Cabelo",
  UNHAS: "Unhas",
  ESTETICA: "Estetica",
  MAQUIAGEM: "Maquiagem",
} as const;

/**
 * Nomes de exibição para as categorias de profissionais_ativos
 */
export const PROF_CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  "Cabelo": "Cabelo",
  "Unhas": "Unhas",
  "Estetica": "Estética",
  "Maquiagem": "Make",
};

/**
 * Categorias habilitadas no dashboard
 */
export const ENABLED_PROF_CATEGORIES: Record<string, boolean> = {
  [PROF_CATEGORIES.CABELO]: true,
  [PROF_CATEGORIES.UNHAS]: true,
  [PROF_CATEGORIES.ESTETICA]: true,
  [PROF_CATEGORIES.MAQUIAGEM]: true,
};

/**
 * Mapeamento de labels específicos para componentes
 */
export const SERVICE_TYPE_DISPLAY_NAMES = {
  "Outros serviços": "Tratamentos",
  "Outros Serviços": "Tratamentos"
} as const;

/**
 * Retorna o nome de exibição para uma categoria
 */
export function getCategoryDisplayName(category: string): string {
  return PROF_CATEGORY_DISPLAY_NAMES[category] || category;
}

/**
 * Retorna o nome de exibição para tipos de serviço
 */
export function getServiceTypeDisplayName(serviceType: string): string {
  return SERVICE_TYPE_DISPLAY_NAMES[serviceType as keyof typeof SERVICE_TYPE_DISPLAY_NAMES] || serviceType;
}

/**
 * Verifica se uma categoria está habilitada
 */
export function isCategoryEnabled(category: string): boolean {
  return ENABLED_PROF_CATEGORIES[category] ?? true;
}

/* Format de data.json : même découpage que data.js du prototype, en objets nommés. */

export interface Perk {
  level: number;
  value: number;
  name: string;
}

export interface Perks {
  farming: { double: Perk[]; faster: Perk[]; water: Perk[] };
  cooking: { refund: Perk[]; double: Perk[] };
}

export interface Crop {
  slug: string;
  seed: string;
  name: string;
  seedName: string;
  /** Temps de pousse de base (min) */
  grow: number;
  /** Durée d'un arrosage de base (min) */
  water: number;
  /** Prix de la graine ; null pour les arbres (non relevé sur le Codex) */
  seedPrice: number | null;
  sell: number;
}

export type ExtraType = 'gather' | 'shop' | 'craft';
export type IngredientType = 'crop' | 'tree' | ExtraType;

export interface Extra {
  name: string;
  type: ExtraType;
  where: string;
  /** Prix de vente */
  sale: number;
  /** Ce que ça coûte vraiment (null = inconnu) */
  cash: number | null;
  /** Valeur « prix normal » du Codex */
  real: number;
}

export interface RecipeIngredient {
  slug: string;
  qty: number;
}

export interface Recipe {
  slug: string;
  name: string;
  sell: number;
  station: number;
  energy: number;
  /** Prix de la recette chez Kun (null = pas vendue) */
  recipePrice: number | null;
  ingredients: RecipeIngredient[];
}

export interface LoftiaData {
  schemaVersion: number;
  source: string;
  extracted: string;
  perks: Perks;
  crops: Crop[];
  extras: Record<string, Extra>;
  recipes: Recipe[];
}

/** Parcelles d'un même type (une graine par parcelle) */
export interface SlotGroup {
  n: number;
  /** Hydrofarm : arrosée par la Nutrient Solution (rien à arroser), Rapid Growth ne s'y applique pas */
  hydro?: boolean;
  /** Garden bed équipé d'un Drip Irrigator : l'arrosage tient 1,5 fois sa durée de base */
  drip?: boolean;
}

/** Nutrient Solution : ce qui arrose les Hydrofarms (un flacon = `charges` arrosages) */
export interface NutrientSolution {
  /** Prix d'un flacon (Dew) */
  cost: number;
  /** Charges par flacon : une charge par arrosage d'une plante */
  charges: number;
}

export interface CalcOptions {
  cookLvl: number;
  farmLvl: number;
  /** Parcelles du jardin, ou un nombre de parcelles de garden bed (0 = illimitées) */
  plots: number | readonly SlotGroup[];
  treesReady: boolean;
  /** Prix de la Nutrient Solution consommée en Hydrofarm (absent = non comptée) */
  nutrient?: NutrientSolution;
}

/** Réglages qui jouent sur l'arrosage d'une culture */
export interface WaterOptions {
  farmLvl: number;
  /** Planté dans un garden bed équipé d'un Drip Irrigator */
  drip?: boolean;
}

/** Plan de cuisine : slug de recette → nombre de plats */
export type PlanQuantities = Record<string, number>;

export interface Ingredient {
  slug: string;
  name: string;
  type: IngredientType;
  sale: number;
  cash: number | null;
  real: number;
  /** Pousse de base (min), 0 hors culture */
  grow: number;
  where?: string;
  seed?: string;
  seedName?: string;
}

export interface ComputedIngredient extends Ingredient {
  q: number;
  /** Prix unitaire retenu : ce que ça coûte (valeur de revente si inconnu) */
  unit: number;
  /** Temps de pousse effectif (min) */
  t: number;
  /** Ingrédient le plus long à pousser de la recette */
  crit: boolean;
  /** Coût inconnu, valeur de revente utilisée */
  approx: boolean;
}

export interface ComputedRecipe {
  slug: string;
  name: string;
  baseSell: number;
  station: number;
  energy: number;
  recipePrice: number | null;
  ings: ComputedIngredient[];
  value: number;
  /** Ingrédients (Ingredient Saver inclus) + Nutrient Solution */
  cost: number;
  /** Nutrient Solution des graines plantées en Hydrofarm, au prix de la charge (Dew), comprise dans `cost` */
  nutrient: number;
  profit: number;
  approx: boolean;
  time: number;
  dph: number | null;
  dpe: number;
  hasCrop: boolean;
  hasTree: boolean;
  hasGather: boolean;
  hasShop: boolean;
  hasCraft: boolean;
  /** Totaux pour n plats */
  tot: RecipeTotals;
}

export interface RecipeTotals {
  n: number;
  cost: number;
  /** Nutrient Solution pour les n plats, au prix de la charge (Dew), comprise dans `cost` */
  nutrient: number;
  value: number;
  profit: number;
  energy: number;
  time: number;
  dph: number | null;
}

export interface PlanIngredient extends ComputedIngredient {
  /** Quantité totale pour le plan */
  qty: number;
  /** Noms des recettes qui l'utilisent */
  recipes: string[];
}

export interface ComputedPlan {
  entries: ComputedRecipe[];
  ings: PlanIngredient[];
  /** Nombre total de plats */
  count: number;
  /** Coût moyen (Ingredient Saver et Nutrient Solution inclus) */
  cost: number;
  /** Nutrient Solution à acheter en flacons entiers (bottles × prix du flacon, Dew), comprise dans `cost` */
  nutrient: number;
  /** Charges de Nutrient Solution (une par arrosage d'une plante en Hydrofarm) */
  charges: number;
  /** Flacons de Nutrient Solution à acheter pour ces charges (arrondi au-dessus) */
  bottles: number;
  /** Charges qui resteront dans le dernier flacon */
  leftover: number;
  /** Coût brut des ingrédients */
  raw: number;
  /** Économie moyenne d'Ingredient Saver */
  saver: number;
  value: number;
  profit: number;
  energy: number;
  approx: boolean;
  time: number;
  dph: number | null;
  seedCost: number;
  shopCost: number;
  /** Graines à planter */
  seeds: number;
  refund: number;
}

export interface ComputedCrop {
  slug: string;
  seed: string;
  name: string;
  seedName: string;
  tree: boolean;
  grow: number;
  water: number;
  cost: number | null;
  value: number;
  profit: number | null;
  dph: number | null;
}

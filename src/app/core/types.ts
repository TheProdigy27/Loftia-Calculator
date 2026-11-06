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

export type PriceMode = 'cash' | 'regular';

export interface CalcOptions {
  cookLvl: number;
  farmLvl: number;
  mode: PriceMode;
  /** Nombre de parcelles ; 0 = illimitées */
  plots: number;
  treesReady: boolean;
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
  /** Prix unitaire retenu selon le mode */
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
  cost: number;
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
  /** Coût moyen (Ingredient Saver inclus) */
  cost: number;
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

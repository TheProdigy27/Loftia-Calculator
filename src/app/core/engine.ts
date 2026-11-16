/*
 * Moteur de calcul : coût, valeur, profit, temps de pousse, Dew/h, plan × n — mêmes règles que loftiacodex.com.
 * Port fidèle de reference/prototype/engine.js : librairie pure, sans dépendance ni accès disque/réseau.
 * Toute différence de chiffres avec le prototype fait échouer engine.spec.ts.
 */
import type {
  CalcOptions,
  ComputedCrop,
  ComputedIngredient,
  ComputedPlan,
  ComputedRecipe,
  Crop,
  Ingredient,
  LoftiaData,
  Perk,
  PlanIngredient,
  PlanQuantities,
  Recipe,
  SlotGroup,
  WaterOptions,
} from './types';

/**
 * Drip Irrigator (objet de maison, Project Station) : « keep its tiles hydrated for 150% longer ».
 * Relevé en jeu : avec Deep Hydration I et le Drip, une tomate (5 min de base) tient 7 min 30.
 * C'est donc 150 % de la durée de base, et Deep Hydration ne s'y ajoute pas.
 */
export const DRIP_IRRIGATOR_FACTOR = 1.5;

export function perkSum(list: readonly Perk[], lvl: number): number {
  return list.filter((p) => lvl >= p.level).reduce((a, p) => a + p.value, 0);
}

export function activePerks(list: readonly Perk[], lvl: number): Perk[] {
  return list.filter((p) => lvl >= p.level);
}

/** Parcelles du jardin : un nombre = autant de parcelles de garden bed, 0 = illimitées */
export function slotsOf(plots: number | readonly SlotGroup[]): readonly SlotGroup[] {
  if (typeof plots === 'number') return plots > 0 ? [{ n: plots }] : [];
  return plots.filter((g) => g.n > 0);
}

/** Une graine à faire pousser : pousse en garden bed (Rapid Growth compris) et en Hydrofarm (sans) */
export interface GrowUnit {
  slug: string;
  bed: number;
  hydro: number;
  /** Charges de Nutrient Solution qu'elle boit si elle pousse en Hydrofarm */
  charges?: number;
}

export interface Placement<U extends GrowUnit> {
  u: U;
  /** Rang du groupe de parcelles dans `slots` (-1 : parcelles illimitées, en garden bed) */
  group: number;
  start: number;
  end: number;
}

/**
 * Répartit les graines sur les parcelles (LPT) : la plus longue d'abord, sur la parcelle où elle sera prête
 * le plus tôt ; à égalité, le premier groupe de `slots` puis la première parcelle. Sans parcelle : tout est
 * planté tout de suite. Avec un seul type de parcelle, c'est la répartition du prototype (makespan).
 */
export function placeUnits<U extends GrowUnit>(units: readonly U[], slots: readonly SlotGroup[]): Placement<U>[] {
  const sorted = units
    .filter((u) => u.bed > 0)
    .sort((a, b) => b.bed - a.bed || b.hydro - a.hydro || a.slug.localeCompare(b.slug));
  if (!slots.length) return sorted.map((u) => ({ u, group: -1, start: 0, end: u.bed }));
  const loads = slots.map((g) => new Array<number>(g.n).fill(0));
  return sorted.map((u) => {
    let group = 0;
    let slot = 0;
    let end = Infinity;
    slots.forEach((g, gi) => {
      const L = loads[gi];
      let mi = 0;
      for (let k = 1; k < L.length; k++) if (L[k] < L[mi]) mi = k;
      const e = L[mi] + (g.hydro ? u.hydro : u.bed);
      if (e < end) [group, slot, end] = [gi, mi, e];
    });
    const start = loads[group][slot];
    loads[group][slot] = end;
    return { u, group, start, end };
  });
}

/**
 * Plantation des graines sur les parcelles : fin de la dernière pousse (au moins `tree`, le cycle des arbres)
 * et charges de Nutrient Solution bues par celles qui tombent en Hydrofarm.
 */
function growAll(units: readonly GrowUnit[], slots: readonly SlotGroup[], tree = 0): { time: number; charges: number } {
  let time = tree;
  let charges = 0;
  for (const p of placeUnits(units, slots)) {
    time = Math.max(time, p.end);
    if (slots[p.group]?.hydro) charges += p.u.charges ?? 0;
  }
  return { time, charges };
}

/** Temps pour faire pousser des unités sur `plots` parcelles de garden bed (0 = illimitées) — répartition LPT */
export function makespan(durations: readonly number[], plots: number): number {
  return growAll(
    durations.map((d) => ({ slug: '', bed: d, hydro: d })),
    slotsOf(plots),
  ).time;
}

/** Unités à faire pousser : une graine par ingrédient de culture ; les arbres ne prennent pas de parcelle */
function growUnits(
  ings: readonly ComputedIngredient[],
  n: number,
  chargesOf: (slug: string) => number,
): { units: GrowUnit[]; tree: number } {
  const units: GrowUnit[] = [];
  let tree = 0;
  for (const i of ings) {
    if (i.type === 'crop') {
      const charges = chargesOf(i.slug);
      for (let k = 0; k < i.q * n; k++) units.push({ slug: i.slug, bed: i.t, hydro: i.grow, charges });
    }
    if (i.type === 'tree') tree = Math.max(tree, i.t);
  }
  return { units, tree };
}

/** Front de Pareto : aucune autre recette n'est à la fois plus rapide (ou égale) et plus rentable (ou égale) */
export function paretoSet(list: readonly ComputedRecipe[]): Set<string> {
  const out = new Set<string>();
  for (const a of list) {
    if (a.profit <= 0) continue;
    const dominated = list.some(
      (b) => b !== a && b.time <= a.time && b.profit >= a.profit && (b.time < a.time || b.profit > a.profit),
    );
    if (!dominated) out.add(a.slug);
  }
  return out;
}

export type Engine = ReturnType<typeof createEngine>;

export function createEngine(data: LoftiaData) {
  const cropMap = new Map<string, Crop>(data.crops.map((c) => [c.slug, c]));
  const recipeMap = new Map<string, Recipe>(data.recipes.map((r) => [r.slug, r]));

  /** Recettes qui utilisent chaque ingrédient (index inverse) */
  const usedIn = new Map<string, string[]>();
  for (const r of data.recipes) {
    for (const i of r.ingredients) {
      const list = usedIn.get(i.slug) ?? [];
      list.push(r.slug);
      usedIn.set(i.slug, list);
    }
  }

  const isTree = (c: Crop) => c.seedPrice === null;

  /** Parcelles prises par un plat : une graine par unité de culture ; les arbres n'en prennent pas */
  const plotSeedsMap = new Map<string, number>(
    data.recipes.map((r) => [
      r.slug,
      r.ingredients.reduce((a, i) => {
        const c = cropMap.get(i.slug);
        return c && !isTree(c) ? a + i.qty : a;
      }, 0),
    ]),
  );
  function plotSeeds(slug: string): number {
    return plotSeedsMap.get(slug) ?? 0;
  }

  function ingredient(slug: string): Ingredient {
    const c = cropMap.get(slug);
    if (c) {
      const tree = isTree(c);
      return {
        slug,
        name: c.name,
        type: tree ? 'tree' : 'crop',
        sale: c.sell,
        cash: tree ? 0 : c.seedPrice,
        real: c.sell,
        grow: c.grow,
        seed: c.seed,
        seedName: c.seedName,
      };
    }
    const e = data.extras[slug];
    if (!e) throw new Error(`Ingrédient inconnu : ${slug}`);
    return { slug, name: e.name, type: e.type, where: e.where, sale: e.sale, cash: e.cash, real: e.real, grow: 0 };
  }

  /** Rapid Growth : −5 % par palier ; arrondi à la minute */
  function growTime(base: number, farmLvl: number): number {
    return Math.round(base * (1 - perkSum(data.perks.farming.faster, farmLvl)));
  }

  /**
   * Deep Hydration, ou Drip Irrigator qui le remplace : l'arrosage tient plus longtemps.
   * Arrondi à la seconde (le jeu affiche 7 min 30) ; le prototype arrondissait à la minute.
   */
  function waterTime(base: number, farmLvl: number, drip = false): number {
    const k = drip ? DRIP_IRRIGATOR_FACTOR : 1 + perkSum(data.perks.farming.water, farmLvl);
    return Math.round(base * k * 60) / 60;
  }

  /** Durée d'un arrosage d'une culture (0 si inconnue) ; le Drip Irrigator va sur les garden beds, pas sur les arbres */
  function cropWater(slug: string, opt: WaterOptions): number {
    const c = cropMap.get(slug);
    return c ? waterTime(c.water, opt.farmLvl, !!opt.drip && !isTree(c)) : 0;
  }

  /**
   * Charges de Nutrient Solution d'une plante en Hydrofarm, comme le Codex (economy/garden) : une charge par
   * arrosage, soit ⌈pousse ÷ arrosage⌉ — pousse sans Rapid Growth, arrosage avec Deep Hydration.
   */
  function hydroCharges(slug: string, farmLvl: number): number {
    const c = cropMap.get(slug);
    if (!c || !c.water) return 0;
    return Math.ceil(c.grow / (c.water * (1 + perkSum(data.perks.farming.water, farmLvl))) - 1e-9);
  }

  /**
   * Part de Nutrient Solution d'une recette : `charges` charges au prix de la charge (0 si elle n'est pas comptée).
   * Sert à comparer les recettes ; le plan, lui, paie des flacons entiers (nutrientBottles).
   */
  function nutrientCost(charges: number, opt: CalcOptions): number {
    return opt.nutrient ? Math.round((charges * opt.nutrient.cost) / opt.nutrient.charges) : 0;
  }

  /** Flacons entiers de Nutrient Solution à acheter pour `charges` charges (0 si elle n'est pas comptée) */
  function nutrientBottles(charges: number, opt: CalcOptions): number {
    return opt.nutrient ? Math.ceil(charges / opt.nutrient.charges) : 0;
  }

  /** n = nombre de fois que la recette est faite (les champs racine restent « par plat », tot = totaux pour n) */
  function computeRecipe(r: Recipe, opt: CalcOptions, n = 1): ComputedRecipe {
    n = n || 1;
    const slots = slotsOf(opt.plots);
    const refund = perkSum(data.perks.cooking.refund, opt.cookLvl);
    const dbl = perkSum(data.perks.cooking.double, opt.cookLvl);
    const value = Math.round(r.sell * (1 + dbl));

    let approx = false;
    const ings: ComputedIngredient[] = r.ingredients.map(({ slug, qty }) => {
      const i = ingredient(slug);
      let p = i.cash;
      let ingApprox = false;
      if (p === null || p === undefined) {
        p = i.real;
        approx = true;
        ingApprox = true;
      }
      let t = 0;
      if (i.type === 'crop' || i.type === 'tree') {
        t = i.type === 'tree' && opt.treesReady ? 0 : growTime(i.grow, opt.farmLvl);
      }
      return { ...i, q: qty, unit: p, t, crit: false, approx: ingApprox };
    });

    const raw = ings.reduce((a, i) => a + i.q * i.unit, 0);
    // Ingredient Saver : chance de récupérer le premier ingrédient (comportement du Codex)
    const ingCost = Math.round(raw - refund * ings[0].unit);

    // Pousse et Nutrient Solution : selon où tombent les graines (un plat seul, puis les n plats)
    const chargesOf = (slug: string) => hydroCharges(slug, opt.farmLvl);
    const g1 = growUnits(ings, 1, chargesOf);
    const p1 = growAll(g1.units, slots, g1.tree);
    let pn = p1;
    if (n > 1) {
      const gn = growUnits(ings, n, chargesOf);
      pn = growAll(gn.units, slots, gn.tree);
    }
    const time = p1.time;
    const timeN = pn.time;
    const nutrient = nutrientCost(p1.charges, opt);
    const nutrientN = nutrientCost(pn.charges, opt);
    const cost = ingCost + nutrient;
    const profit = value - cost;
    const costN = ingCost * n + nutrientN;
    const profitN = value * n - costN;
    const maxT = ings.reduce((a, i) => Math.max(a, i.t), 0);
    for (const i of ings) i.crit = maxT > 0 && i.t === maxT;

    const types = new Set(ings.map((i) => i.type));

    return {
      slug: r.slug,
      name: r.name,
      baseSell: r.sell,
      station: r.station,
      energy: r.energy,
      recipePrice: r.recipePrice,
      ings,
      value,
      cost,
      nutrient,
      profit,
      approx,
      time,
      dph: time > 0 ? profit / (time / 60) : null,
      dpe: profit / r.energy,
      hasCrop: types.has('crop') || types.has('tree'),
      hasTree: types.has('tree'),
      hasGather: types.has('gather'),
      hasShop: types.has('shop'),
      hasCraft: types.has('craft'),
      tot: {
        n,
        cost: costN,
        nutrient: nutrientN,
        value: value * n,
        profit: profitN,
        energy: r.energy * n,
        time: timeN,
        dph: timeN > 0 ? profitN / (timeN / 60) : null,
      },
    };
  }

  /** Plan : { slug: n } → totaux et liste d'ingrédients agrégée */
  function computePlan(plan: PlanQuantities, opt: CalcOptions): ComputedPlan {
    const slots = slotsOf(opt.plots);
    const refund = perkSum(data.perks.cooking.refund, opt.cookLvl);
    const entries: ComputedRecipe[] = [];
    const ingMap = new Map<string, PlanIngredient>();
    const chargesOf = (slug: string) => hydroCharges(slug, opt.farmLvl);
    let units: GrowUnit[] = [];
    let tree = 0;
    /** Ingrédients seuls (Ingredient Saver inclus) : la Nutrient Solution dépend du plan entier */
    let ingCost = 0;
    let value = 0;
    let energy = 0;
    let raw = 0;
    let approx = false;

    for (const slug of Object.keys(plan)) {
      const n = plan[slug];
      const r = recipeMap.get(slug);
      if (!n || !r) continue;
      const e = computeRecipe(r, opt, n);
      entries.push(e);
      ingCost += e.tot.cost - e.tot.nutrient;
      value += e.tot.value;
      energy += e.tot.energy;
      if (e.approx) approx = true;
      const g = growUnits(e.ings, n, chargesOf);
      units = units.concat(g.units);
      tree = Math.max(tree, g.tree);
      for (const i of e.ings) {
        raw += i.q * n * i.unit;
        let item = ingMap.get(i.slug);
        if (!item) {
          item = { ...i, qty: 0, recipes: [] };
          ingMap.set(i.slug, item);
        }
        item.qty += i.q * n;
        item.recipes.push(e.name);
      }
    }

    const ings = [...ingMap.values()];
    let seedCost = 0;
    let shopCost = 0;
    for (const i of ings) {
      if (i.type === 'crop') seedCost += i.qty * (i.cash ?? 0);
      if (i.type === 'shop') shopCost += i.qty * (i.cash ?? 0);
    }
    const { time, charges } = growAll(units, slots, tree);
    // Ce qu'on achète vraiment : des flacons entiers (180 charges → 8 flacons, 800 Dew, 20 charges de reste)
    const bottles = nutrientBottles(charges, opt);
    const nutrient = opt.nutrient ? bottles * opt.nutrient.cost : 0;
    const cost = ingCost + nutrient;
    const profit = value - cost;
    return {
      entries,
      ings,
      count: entries.reduce((a, e) => a + e.tot.n, 0),
      cost,
      nutrient,
      charges,
      bottles,
      leftover: opt.nutrient ? bottles * opt.nutrient.charges - charges : 0,
      raw,
      saver: raw - ingCost,
      value,
      profit,
      energy,
      approx,
      time,
      dph: time > 0 ? profit / (time / 60) : null,
      seedCost,
      shopCost,
      seeds: units.length,
      refund,
    };
  }

  function computeCrop(slug: string, opt: WaterOptions): ComputedCrop {
    const c = cropMap.get(slug);
    if (!c) throw new Error(`Culture inconnue : ${slug}`);
    const dbl = perkSum(data.perks.farming.double, opt.farmLvl);
    const value = Math.round(c.sell * (1 + dbl));
    const grow = growTime(c.grow, opt.farmLvl);
    const profit = c.seedPrice === null ? null : value - c.seedPrice;
    return {
      slug: c.slug,
      seed: c.seed,
      name: c.name,
      seedName: c.seedName,
      tree: isTree(c),
      grow,
      water: cropWater(slug, opt),
      cost: c.seedPrice,
      value,
      profit,
      dph: profit === null ? null : profit / (grow / 60),
    };
  }

  return {
    data,
    cropMap,
    recipeMap,
    usedIn,
    plotSeeds,
    ingredient,
    growTime,
    waterTime,
    cropWater,
    hydroCharges,
    computeRecipe,
    computePlan,
    computeCrop,
  };
}

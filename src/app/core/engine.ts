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
} from './types';

/**
 * Drip Irrigator (objet de maison, Project Station) : « keep its tiles hydrated for 150% longer ».
 * Même formulation que Deep Hydration (« +15% longer » = × 1,15), donc +150 % ; les deux bonus s'additionnent.
 */
export const DRIP_IRRIGATOR_BONUS = 1.5;

export function perkSum(list: readonly Perk[], lvl: number): number {
  return list.filter((p) => lvl >= p.level).reduce((a, p) => a + p.value, 0);
}

export function activePerks(list: readonly Perk[], lvl: number): Perk[] {
  return list.filter((p) => lvl >= p.level);
}

/** Temps pour faire pousser des unités sur `plots` parcelles (0 = illimitées) — répartition LPT */
export function makespan(durations: readonly number[], plots: number): number {
  const d = durations.filter((x) => x > 0);
  if (!d.length) return 0;
  const max = Math.max(...d);
  if (!plots || plots >= d.length) return max;
  d.sort((a, b) => b - a);
  const loads = new Array<number>(plots).fill(0);
  for (const x of d) {
    let mi = 0;
    for (let k = 1; k < loads.length; k++) if (loads[k] < loads[mi]) mi = k;
    loads[mi] += x;
  }
  return Math.max(...loads);
}

/** Unités à faire pousser : une graine par ingrédient de culture ; les arbres ne prennent pas de parcelle */
function growUnits(ings: readonly ComputedIngredient[], n: number): { units: number[]; tree: number } {
  const units: number[] = [];
  let tree = 0;
  for (const i of ings) {
    if (i.type === 'crop') for (let k = 0; k < i.q * n; k++) units.push(i.t);
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

  /** Deep Hydration (et Drip Irrigator) : l'arrosage tient plus longtemps */
  function waterTime(base: number, farmLvl: number, drip = false): number {
    return Math.round(base * (1 + perkSum(data.perks.farming.water, farmLvl) + (drip ? DRIP_IRRIGATOR_BONUS : 0)));
  }

  /** Durée d'un arrosage d'une culture (0 si inconnue) ; le Drip Irrigator va sur les garden beds, pas sur les arbres */
  function cropWater(slug: string, opt: Pick<CalcOptions, 'farmLvl' | 'drip'>): number {
    const c = cropMap.get(slug);
    return c ? waterTime(c.water, opt.farmLvl, !!opt.drip && !isTree(c)) : 0;
  }

  /** n = nombre de fois que la recette est faite (les champs racine restent « par plat », tot = totaux pour n) */
  function computeRecipe(r: Recipe, opt: CalcOptions, n = 1): ComputedRecipe {
    n = n || 1;
    const plots = opt.plots || 0;
    const refund = perkSum(data.perks.cooking.refund, opt.cookLvl);
    const dbl = perkSum(data.perks.cooking.double, opt.cookLvl);
    const value = Math.round(r.sell * (1 + dbl));

    let approx = false;
    const ings: ComputedIngredient[] = r.ingredients.map(({ slug, qty }) => {
      const i = ingredient(slug);
      let p = opt.mode === 'cash' ? i.cash : i.real;
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
    const cost = Math.round(raw - refund * ings[0].unit);
    const profit = value - cost;

    const g1 = growUnits(ings, 1);
    const time = Math.max(makespan(g1.units, plots), g1.tree);
    const gn = n === 1 ? g1 : growUnits(ings, n);
    const timeN = n === 1 ? time : Math.max(makespan(gn.units, plots), gn.tree);
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
        cost: cost * n,
        value: value * n,
        profit: profit * n,
        energy: r.energy * n,
        time: timeN,
        dph: timeN > 0 ? (profit * n) / (timeN / 60) : null,
      },
    };
  }

  /** Plan : { slug: n } → totaux et liste d'ingrédients agrégée */
  function computePlan(plan: PlanQuantities, opt: CalcOptions): ComputedPlan {
    const plots = opt.plots || 0;
    const refund = perkSum(data.perks.cooking.refund, opt.cookLvl);
    const entries: ComputedRecipe[] = [];
    const ingMap = new Map<string, PlanIngredient>();
    let units: number[] = [];
    let tree = 0;
    let cost = 0;
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
      cost += e.tot.cost;
      value += e.tot.value;
      energy += e.tot.energy;
      if (e.approx) approx = true;
      const g = growUnits(e.ings, n);
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
    const time = Math.max(makespan(units, plots), tree);
    const profit = value - cost;
    return {
      entries,
      ings,
      count: entries.reduce((a, e) => a + e.tot.n, 0),
      cost,
      raw,
      saver: raw - cost,
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

  function computeCrop(slug: string, opt: Pick<CalcOptions, 'farmLvl' | 'drip'>): ComputedCrop {
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
    computeRecipe,
    computePlan,
    computeCrop,
  };
}

import rawData from '../../data/loftia-data.json';
import fixture from './engine.fixture.json';
import { createEngine, makespan, paretoSet, perkSum } from './engine';
import { planText } from './plan-text';
import type { CalcOptions, LoftiaData, PlanQuantities, PriceMode } from './types';

const data = rawData as LoftiaData;
const engine = createEngine(data);
const base: CalcOptions = { cookLvl: 1, farmLvl: 1, mode: 'cash', plots: 0, treesReady: false };

/** Combinaisons dans l'ordre de scripts/gen-engine-fixture.mjs */
function combos(): CalcOptions[] {
  const out: CalcOptions[] = [];
  for (let lvl = 1; lvl <= 20; lvl++)
    for (const mode of ['cash', 'regular'] as PriceMode[])
      for (const plots of [0, 2])
        for (const treesReady of [false, true]) out.push({ cookLvl: lvl, farmLvl: lvl, mode, plots, treesReady });
  return out;
}
const r3 = (x: number | null) => (x === null ? null : Math.round(x * 1e3) / 1e3);

describe('données embarquées', () => {
  it('contient les 61 recettes et 23 cultures du Codex', () => {
    expect(data.schemaVersion).toBe(1);
    expect(data.recipes.length).toBe(61);
    expect(data.crops.length).toBe(23);
  });

  it('chaque ingrédient de recette existe', () => {
    for (const r of data.recipes)
      for (const i of r.ingredients) expect(() => engine.ingredient(i.slug), `${r.slug} → ${i.slug}`).not.toThrow();
  });
});

describe('moteur — équivalence avec le prototype', () => {
  const all = combos();
  const recipes = fixture.recipes as Record<string, (number | null)[][]>;
  const crops = fixture.crops as Record<string, (number | null)[][]>;

  for (const r of data.recipes) {
    it(`recette ${r.slug} : niveaux 1 à 20, prix, parcelles, arbres, × ${fixture.n}`, () => {
      const expected = recipes[r.slug];
      expect(expected).toHaveLength(all.length);
      all.forEach((opt, k) => {
        const c = engine.computeRecipe(r, opt, fixture.n);
        const got = [c.cost, c.value, c.profit, c.time, r3(c.dph), r3(c.dpe), c.approx ? 1 : 0, c.tot.time, r3(c.tot.dph)];
        expect(got, JSON.stringify(opt)).toEqual(expected[k]);
      });
    });
  }

  it('cultures : niveaux 1 à 20', () => {
    for (const c of data.crops) {
      for (let lvl = 1; lvl <= 20; lvl++) {
        const x = engine.computeCrop(c.slug, { farmLvl: lvl });
        expect([x.grow, x.water, x.value, x.profit, r3(x.dph)], `${c.slug} lv${lvl}`).toEqual(crops[c.slug][lvl - 1]);
      }
    }
  });

  it(`plans × n : ${fixture.plans.length} plans`, () => {
    for (const { plan, opt, out } of fixture.plans as unknown as { plan: PlanQuantities; opt: CalcOptions; out: unknown }[]) {
      const P = engine.computePlan(plan, opt);
      const got = {
        count: P.count, cost: P.cost, raw: P.raw, saver: r3(P.saver), value: P.value, profit: P.profit, energy: P.energy,
        approx: P.approx, time: P.time, dph: r3(P.dph), seedCost: P.seedCost, shopCost: P.shopCost, seeds: P.seeds,
        ings: P.ings.map((i) => [i.slug, i.qty]),
      };
      expect(got, JSON.stringify({ plan, opt })).toEqual(out);
    }
  });

  it('front de Pareto par défaut', () => {
    const list = data.recipes.map((r) => engine.computeRecipe(r, base));
    expect([...paretoSet(list)].sort()).toEqual(fixture.pareto);
  });
});

describe('moteur — règles', () => {
  it('cumule les paliers de bonus atteints', () => {
    const faster = data.perks.farming.faster;
    expect(perkSum(faster, 14)).toBe(0);
    expect(perkSum(faster, 15)).toBeCloseTo(0.05);
    expect(perkSum(faster, 20)).toBeCloseTo(0.1);
  });

  it('Ingredient Saver retire 5 % du premier ingrédient dès le niveau 2', () => {
    const r = engine.recipeMap.get('tomato-basil-soup')!; // 2 tomates (15) + 1 basilic (40)
    expect(engine.computeRecipe(r, base).cost).toBe(70);
    expect(engine.computeRecipe(r, { ...base, cookLvl: 2 }).cost).toBe(Math.round(70 - 0.05 * 15));
  });

  it('marque le miel comme approximation en mode « ce que ça coûte »', () => {
    const c = engine.computeRecipe(engine.recipeMap.get('summer-salad')!, base);
    expect(c.approx).toBe(true);
    expect(c.ings.find((i) => i.slug === 'honey')!.approx).toBe(true);
  });

  it('makespan : parcelles illimitées, une parcelle, répartition', () => {
    expect(makespan([10, 20, 30], 0)).toBe(30);
    expect(makespan([10, 20, 30], 1)).toBe(60);
    expect(makespan([30, 30, 20, 20, 20], 2)).toBe(70);
    expect(makespan([], 3)).toBe(0);
  });

  it('plan : les arbres attendent un cycle sans prendre de parcelle', () => {
    const plan = { 'nasi-lemak': 2 }; // riz (90 min) + noix de coco (arbre, 360 min)
    expect(engine.computePlan(plan, { ...base, plots: 1 }).time).toBe(360);
    expect(engine.computePlan(plan, { ...base, plots: 1, treesReady: true }).time).toBe(180);
    expect(engine.computePlan(plan, base).seeds).toBe(2);
  });

  it('plan : texte à copier', () => {
    const P = engine.computePlan({ omurice: 2 }, base);
    const txt = planText(P, 0);
    expect(txt).toContain('Plan de cuisine Loftia — 2 plats');
    expect(txt).toContain('• 2× Omurice');
    expect(txt).toContain('  - Rice ×2 (Rice Seed, 60 Dew, 1h 30m)');
    expect(txt).toContain('  - Egg ×2 (10 Dew)');
    expect(txt).toContain('(parcelles illimitées)');
  });
});

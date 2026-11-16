import rawData from '../../data/loftia-data.json';
import fixture from './engine.fixture.json';
import { createEngine, makespan, paretoSet, perkSum, placeUnits } from './engine';
import { fmtTime } from './format';
import { planText } from './plan-text';
import type { CalcOptions, LoftiaData, PlanQuantities } from './types';

const data = rawData as LoftiaData;
const engine = createEngine(data);
const base: CalcOptions = { cookLvl: 1, farmLvl: 1, plots: 0, treesReady: false };

/** Combinaisons dans l'ordre de scripts/gen-engine-fixture.mjs */
function combos(): CalcOptions[] {
  const out: CalcOptions[] = [];
  for (let lvl = 1; lvl <= 20; lvl++)
    for (const plots of [0, 2])
      for (const treesReady of [false, true]) out.push({ cookLvl: lvl, farmLvl: lvl, plots, treesReady });
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

describe('parcelles par plat', () => {
  it('une graine par unité de culture, les arbres et le reste ne comptent pas', () => {
    expect(engine.plotSeeds('tomato-basil-soup')).toBe(3);
    expect(engine.plotSeeds('nasi-lemak')).toBe(1); // riz + noix de coco (arbre)
    expect(engine.plotSeeds('mushroom-soup')).toBe(0);
    expect(engine.plotSeeds('inconnue')).toBe(0);
  });
});

describe('moteur — équivalence avec le prototype', () => {
  const all = combos();
  const recipes = fixture.recipes as Record<string, (number | null)[][]>;
  const crops = fixture.crops as Record<string, (number | null)[][]>;

  for (const r of data.recipes) {
    it(`recette ${r.slug} : niveaux 1 à 20, parcelles, arbres, × ${fixture.n}`, () => {
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
        const [grow, water, ...rest] = crops[c.slug][lvl - 1];
        expect([x.grow, x.value, x.profit, r3(x.dph)], `${c.slug} lv${lvl}`).toEqual([grow, ...rest]);
        // Arrosage : le prototype arrondit à la minute, l'appli à la seconde
        expect(Math.abs(x.water - (water as number)), `${c.slug} lv${lvl} arrosage`).toBeLessThanOrEqual(0.5);
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

  it('Drip Irrigator : arrosage × 1,5 de la base, Deep Hydration ne s’y ajoute pas, pas sur les arbres', () => {
    const water = (slug: string, farmLvl: number, drip?: boolean) => engine.computeCrop(slug, { farmLvl, drip }).water;
    expect(water('tomato', 1)).toBe(5);
    expect(water('tomato', 5)).toBe(5.75); // Deep Hydration I : 5 min 45
    expect(water('tomato', 5, true)).toBe(7.5); // relevé en jeu (Deep Hydration I + Drip) : 7 min 30
    expect(water('tomato', 1, true)).toBe(7.5);
    expect(water('carrot', 15)).toBe(14); // Deep Hydration I + II : +40 %
    expect(water('carrot', 15, true)).toBe(15);
    expect(water('banana', 1, true)).toBe(360);
    expect(engine.cropWater('tomato', { farmLvl: 1, drip: true })).toBe(7.5);
    expect(engine.cropWater('inconnue', { farmLvl: 1, drip: true })).toBe(0);
  });

  it('durées affichées à la seconde près', () => {
    expect(fmtTime(0)).toBe('0m');
    expect(fmtTime(95)).toBe('1h 35m');
    expect(fmtTime(60)).toBe('1h');
    expect(fmtTime(7.5)).toBe('7m 30s');
    expect(fmtTime(0.25)).toBe('15s');
    expect(fmtTime(60.5)).toBe('1h 0m 30s');
    expect(fmtTime(103.5)).toBe('1h 43m 30s');
  });

  it('Ingredient Saver retire 5 % du premier ingrédient dès le niveau 2', () => {
    const r = engine.recipeMap.get('tomato-basil-soup')!; // 2 tomates (15) + 1 basilic (40)
    expect(engine.computeRecipe(r, base).cost).toBe(70);
    expect(engine.computeRecipe(r, { ...base, cookLvl: 2 }).cost).toBe(Math.round(70 - 0.05 * 15));
  });

  it('marque le miel comme approximation (coût inconnu)', () => {
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

  it('jardin : la plus longue d’abord, là où elle est prête le plus tôt, d’abord dans les lits', () => {
    const u = (slug: string, bed: number, hydro: number) => ({ slug, bed, hydro });
    const where = (units: ReturnType<typeof u>[], slots: Parameters<typeof placeUnits>[1]) =>
      placeUnits(units, slots).map((p) => `${p.u.slug}@${p.group} ${p.start}-${p.end}`);
    // À égalité (pas de Rapid Growth), le lit passe avant l'Hydrofarm
    expect(where([u('a', 15, 15), u('b', 15, 15)], [{ n: 1 }, { n: 1, hydro: true }])).toEqual(['a@0 0-15', 'b@1 0-15']);
    // Rapid Growth : 9 min en lit, 10 en Hydrofarm
    expect(where([u('a', 9, 10), u('a', 9, 10), u('a', 9, 10)], [{ n: 1 }, { n: 1, hydro: true }])).toEqual([
      'a@0 0-9',
      'a@1 0-10',
      'a@0 9-18',
    ]);
    expect(where([u('a', 9, 10)], [])).toEqual(['a@-1 0-9']);
  });

  it('jardin : Rapid Growth ne s’applique pas en Hydrofarm', () => {
    const lv20 = { ...base, farmLvl: 20 }; // Rapid Growth II : riz 81 min en lit, 90 en Hydrofarm ; tomate 14 / 15
    expect(engine.computePlan({ omurice: 1 }, { ...lv20, plots: [{ n: 9 }] }).time).toBe(81);
    expect(engine.computePlan({ omurice: 1 }, { ...lv20, plots: [{ n: 15, hydro: true }] }).time).toBe(90);
    // 1 lit + 1 Hydrofarm d'une parcelle chacun : riz lit 0-81, riz Hydrofarm 0-90, tomate lit 81-95, tomate Hydrofarm 90-105
    const slots = [{ n: 1 }, { n: 1, hydro: true }];
    expect(engine.computePlan({ omurice: 2 }, { ...lv20, plots: slots }).time).toBe(105);
    expect(engine.computeRecipe(engine.recipeMap.get('omurice')!, { ...lv20, plots: slots }, 2).tot.time).toBe(105);
  });

  it('Nutrient Solution : une charge par arrosage en Hydrofarm, Deep Hydration compris, sans Rapid Growth', () => {
    // Codex : ⌈pousse ÷ arrosage⌉ ; riz 90/45, tomate 15/5, champignon bleu 40/10
    expect(engine.hydroCharges('rice', 1)).toBe(2);
    expect(engine.hydroCharges('tomato', 1)).toBe(3);
    expect(engine.hydroCharges('blue-cap-mushroom', 1)).toBe(4);
    expect(engine.hydroCharges('blue-cap-mushroom', 15)).toBe(3); // 40 ÷ (10 × 1,4)
    expect(engine.hydroCharges('egg', 1)).toBe(0);
  });

  it('Nutrient Solution : comptée dans le coût des graines tombées en Hydrofarm', () => {
    const nutrient = { cost: 100, charges: 25 }; // 4 Dew la charge
    const omurice = engine.recipeMap.get('omurice')!; // œuf + riz (2 charges) + tomate (3 charges)
    const bed = engine.computeRecipe(omurice, { ...base, plots: [{ n: 9 }], nutrient }, 2);
    const hydro = engine.computeRecipe(omurice, { ...base, plots: [{ n: 15, hydro: true }], nutrient }, 2);
    expect(bed.nutrient).toBe(0);
    expect(bed.tot.nutrient).toBe(0);
    expect(hydro.nutrient).toBe(20);
    expect(hydro.cost).toBe(bed.cost + 20);
    expect(hydro.profit).toBe(bed.profit - 20);
    expect(hydro.tot.nutrient).toBe(40);
    expect(hydro.tot.cost).toBe(bed.tot.cost + 40);
    expect(hydro.tot.profit).toBe(bed.tot.profit - 40);
    // Sans prix fourni (prototype) : rien n'est ajouté
    expect(engine.computeRecipe(omurice, { ...base, plots: [{ n: 15, hydro: true }] }).cost).toBe(bed.cost);
  });

  it('Nutrient Solution : le plan paie des flacons entiers pour toutes ses graines en Hydrofarm', () => {
    const nutrient = { cost: 100, charges: 25 };
    const lv20 = { ...base, farmLvl: 20, plots: [{ n: 1 }, { n: 1, hydro: true }] };
    // 1 riz et 1 tomate tombent en Hydrofarm (voir Rapid Growth ci-dessus) : 2 + 3 charges, un flacon entier
    const P = engine.computePlan({ omurice: 2 }, { ...lv20, nutrient });
    const free = engine.computePlan({ omurice: 2 }, lv20);
    expect([P.charges, P.bottles, P.nutrient, P.leftover]).toEqual([5, 1, 100, 20]);
    expect(P.cost).toBe(free.cost + 100);
    expect(P.profit).toBe(free.profit - 100);
    expect(P.saver).toBe(free.saver);
    expect([free.charges, free.bottles, free.nutrient, free.leftover]).toEqual([5, 0, 0, 0]);
    // 15 Hydrofarm seules, 9 omurices : 9 × 5 = 45 charges, 2 flacons
    const hydro = { ...base, plots: [{ n: 15, hydro: true }], nutrient };
    const H = engine.computePlan({ omurice: 9 }, hydro);
    expect([H.charges, H.bottles, H.nutrient, H.leftover]).toEqual([45, 2, 200, 5]);
    expect(planText(H, 15)).toContain('  - Nutrient Solution ×2 (200 Dew, 45 charges en Hydrofarm, 5 charges de reste)');
    // 36 omurices : 180 charges = 7,2 flacons → 8 flacons, 800 Dew, 20 charges de reste
    const B = engine.computePlan({ omurice: 36 }, hydro);
    const B0 = engine.computePlan({ omurice: 36 }, { ...hydro, nutrient: undefined });
    expect([B.charges, B.bottles, B.nutrient, B.leftover]).toEqual([180, 8, 800, 20]);
    expect(B.profit).toBe(B0.profit - 800);
    expect(planText(B, 15)).toContain('Nutrient Solution ×8 (800 Dew, 180 charges en Hydrofarm, 20 charges de reste)');
    // Flacons tout juste vidés : pas de reste
    const E = engine.computePlan({ omurice: 5 }, hydro);
    expect([E.charges, E.bottles, E.nutrient, E.leftover]).toEqual([25, 1, 100, 0]);
    expect(planText(E, 15)).toContain('Nutrient Solution ×1 (100 Dew, 25 charges en Hydrofarm)\n');
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

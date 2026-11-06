// Génère les résultats de référence du moteur du prototype (reference/prototype/engine.js) :
// toutes les recettes et cultures, niveaux 1 à 20, toutes les options, plus des plans × n.
// Le moteur TypeScript doit reproduire ces chiffres à l'identique (src/app/core/engine.spec.ts).
// Usage : node scripts/gen-engine-fixture.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root = new URL('..', import.meta.url);
const sandbox = { window: {} };
runInNewContext(readFileSync(new URL('reference/prototype/data.js', root), 'utf8'), sandbox);
runInNewContext(readFileSync(new URL('reference/prototype/engine.js', root), 'utf8'), sandbox);
const D = sandbox.window.LOFTIA;
const C = sandbox.window.LoftiaCalc;

const r3 = (x) => (x === null ? null : Math.round(x * 1e3) / 1e3);
export const LEVELS = Array.from({ length: 20 }, (_, k) => k + 1);
export const PLOTS = [0, 2];
const N = 4; // totaux vérifiés pour 4 plats

// recipes[slug][i] / crops[slug][i] : i parcourt les combinaisons dans l'ordre des boucles ci-dessous
const recipes = {};
const crops = {};
for (const lvl of LEVELS) {
  for (const mode of ['cash', 'regular']) {
    for (const plots of PLOTS) {
      for (const treesReady of [false, true]) {
        const opt = { cookLvl: lvl, farmLvl: lvl, mode, plots, treesReady };
        for (const r of D.recipes) {
          const c = C.computeRecipe(r, opt, N);
          (recipes[c.slug] ||= []).push([
            c.cost, c.value, c.profit, c.time, r3(c.dph), r3(c.dpe), c.approx ? 1 : 0, c.tot.time, r3(c.tot.dph),
          ]);
        }
      }
    }
  }
  for (const c of D.crops) {
    const x = C.computeCrop(c[0], { cookLvl: lvl, farmLvl: lvl });
    (crops[x.slug] ||= []).push([x.grow, x.water, x.value, x.profit, r3(x.dph)]);
  }
}

// Plans pseudo-aléatoires (graine fixe) : 2 à 5 recettes, 1 à 6 plats chacune
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const plans = [];
for (let k = 0; k < 40; k++) {
  const plan = {};
  const count = 2 + Math.floor(rnd() * 4);
  while (Object.keys(plan).length < count) plan[D.recipes[Math.floor(rnd() * D.recipes.length)][0]] = 1 + Math.floor(rnd() * 6);
  const opt = {
    cookLvl: 1 + Math.floor(rnd() * 20),
    farmLvl: 1 + Math.floor(rnd() * 20),
    mode: rnd() < 0.5 ? 'cash' : 'regular',
    plots: [0, 1, 3, 6][Math.floor(rnd() * 4)],
    treesReady: rnd() < 0.3,
  };
  const P = C.computePlan(plan, opt);
  plans.push({
    plan,
    opt,
    out: {
      count: P.count, cost: P.cost, raw: P.raw, saver: r3(P.saver), value: P.value, profit: P.profit, energy: P.energy,
      approx: P.approx, time: P.time, dph: r3(P.dph), seedCost: P.seedCost, shopCost: P.shopCost, seeds: P.seeds,
      ings: P.ings.map((i) => [i.slug, i.qty]),
    },
  });
}

// Front de Pareto par défaut (niveau 1, prix payé, parcelles illimitées)
const def = D.recipes.map((r) => C.computeRecipe(r, { cookLvl: 1, farmLvl: 1, mode: 'cash', plots: 0, treesReady: false }));
const pareto = Object.keys(C.paretoSet(def)).sort();

writeFileSync(
  new URL('src/app/core/engine.fixture.json', root),
  JSON.stringify({
    order: 'lvl 1..20 > mode cash,regular > plots 0,2 > treesReady false,true ; tot pour n = 4',
    n: N,
    recipes,
    crops,
    plans,
    pareto,
  }),
);
console.log(
  `${Object.keys(recipes).length} recettes × ${recipes[D.recipes[0][0]].length} cas, ${Object.keys(crops).length} cultures, ${plans.length} plans, ${pareto.length} recettes sur le front de Pareto`,
);

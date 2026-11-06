// Convertit reference/prototype/data.js (tableaux positionnels) en src/data/loftia-data.json (objets nommés).
// Usage : node scripts/convert-prototype-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root = new URL('..', import.meta.url);
const sandbox = { window: {} };
runInNewContext(readFileSync(new URL('reference/prototype/data.js', root), 'utf8'), sandbox);
const D = sandbox.window.LOFTIA;

const data = {
  schemaVersion: 1,
  source: D.source,
  extracted: D.extracted,
  perks: D.perks,
  crops: D.crops.map(([slug, seed, name, seedName, grow, water, seedPrice, sell]) => ({
    slug, seed, name, seedName, grow, water, seedPrice, sell,
  })),
  extras: Object.fromEntries(
    Object.entries(D.extras).map(([slug, e]) => [
      slug,
      { name: e.name, type: e.type, where: e.where, sale: e.p[0], cash: e.p[1], real: e.p[2] },
    ]),
  ),
  recipes: D.recipes.map(([slug, name, sell, station, energy, recipePrice, ings]) => ({
    slug, name, sell, station, energy, recipePrice,
    ingredients: ings.map(([s, qty]) => ({ slug: s, qty })),
  })),
};

writeFileSync(new URL('src/data/loftia-data.json', root), JSON.stringify(data, null, 2) + '\n');
console.log(`${data.recipes.length} recettes, ${data.crops.length} cultures, ${Object.keys(data.extras).length} autres ingrédients`);

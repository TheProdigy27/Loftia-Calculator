import rawGarden from '../../data/loftia-garden.json';
import { countRange, gardenSlots, normalizeCounts, stepCount } from './garden';
import type { GardenData } from './garden';

const garden = rawGarden as GardenData;

describe('données du jardin', () => {
  it('reprend garden-plots du Codex', () => {
    expect(garden.plots.map((p) => [p.key, p.per, p.start, p.max])).toEqual([
      ['bed', 9, 1, 6],
      ['hydrofarm', 15, 1, 5],
    ]);
  });

  it('Nutrient Solution du Codex : 100 Dew le flacon de 25 charges', () => {
    expect(garden.nutrient).toEqual({ name: 'Nutrient Solution', icon: 'nutrient-solution', cost: 100, charges: 25 });
  });
});

describe('compteurs', () => {
  it('normalizeCounts : départ du Codex, valeurs bornées et arrondies, irrigateurs ≤ lits', () => {
    expect(normalizeCounts(null, garden)).toEqual({ bed: 1, hydrofarm: 1, irrigator: 0 });
    expect(normalizeCounts({ bed: 9, hydrofarm: -2, irrigator: 3.6 }, garden)).toEqual({ bed: 6, hydrofarm: 0, irrigator: 4 });
    expect(normalizeCounts({ bed: 'x', hydrofarm: 2.4 }, garden)).toEqual({ bed: 1, hydrofarm: 2, irrigator: 0 });
    expect(normalizeCounts({ bed: 2, hydrofarm: 0, irrigator: 5 }, garden)).toEqual({ bed: 2, hydrofarm: 0, irrigator: 2 });
  });

  it('normalizeCounts : un jardin vide repart du départ du Codex', () => {
    expect(normalizeCounts({ bed: 0, hydrofarm: 0, irrigator: 0 }, garden)).toEqual({ bed: 1, hydrofarm: 1, irrigator: 0 });
  });

  it('stepCount : bornes max, irrigateurs suivent les lits', () => {
    const c = { bed: 2, hydrofarm: 5, irrigator: 2 };
    expect(stepCount(c, 'hydrofarm', 1, garden).hydrofarm).toBe(5);
    expect(stepCount(c, 'irrigator', 1, garden).irrigator).toBe(2);
    expect(stepCount(c, 'bed', -1, garden)).toEqual({ bed: 1, hydrofarm: 5, irrigator: 1 });
    expect(stepCount({ bed: 6, hydrofarm: 0, irrigator: 0 }, 'bed', 1, garden).bed).toBe(6);
  });

  it('stepCount : le jardin garde au moins un lit ou une Hydrofarm', () => {
    expect(stepCount({ bed: 1, hydrofarm: 0, irrigator: 1 }, 'bed', -1, garden)).toEqual({ bed: 1, hydrofarm: 0, irrigator: 1 });
    expect(stepCount({ bed: 0, hydrofarm: 1, irrigator: 0 }, 'hydrofarm', -1, garden).hydrofarm).toBe(1);
    expect(stepCount({ bed: 1, hydrofarm: 1, irrigator: 1 }, 'bed', -1, garden)).toEqual({ bed: 0, hydrofarm: 1, irrigator: 0 });
    expect(countRange('irrigator', { bed: 0, hydrofarm: 1, irrigator: 0 }, garden)).toEqual({ min: 0, max: 0 });
  });
});

describe('parcelles données au moteur', () => {
  it('lits irrigués, autres lits, puis Hydrofarms ; les groupes vides disparaissent', () => {
    expect(gardenSlots({ bed: 1, hydrofarm: 1, irrigator: 0 }, garden)).toEqual([{ n: 9 }, { n: 15, hydro: true }]);
    expect(gardenSlots({ bed: 3, hydrofarm: 2, irrigator: 1 }, garden)).toEqual([
      { n: 9, drip: true },
      { n: 18 },
      { n: 30, hydro: true },
    ]);
    expect(gardenSlots({ bed: 2, hydrofarm: 0, irrigator: 2 }, garden)).toEqual([{ n: 18, drip: true }]);
  });
});

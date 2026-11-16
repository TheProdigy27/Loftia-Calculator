import { TestBed } from '@angular/core/testing';
import { DEFAULT_STATE, PlannerStore, loadState } from './planner.store';

const storage = (v: unknown) => ({ getItem: () => (typeof v === 'string' ? v : JSON.stringify(v)) });

describe('loadState', () => {
  it('valeurs par défaut sans sauvegarde ou si elle est illisible', () => {
    expect(loadState(null)).toEqual(DEFAULT_STATE);
    expect(loadState(storage('{pas du json'))).toEqual(DEFAULT_STATE);
  });

  it('reprend les champs connus et ignore le reste', () => {
    const s = loadState(storage({ cookLvl: 12, plan: { omurice: 3 }, inconnu: true }));
    expect(s.cookLvl).toBe(12);
    expect(s.plan).toEqual({ omurice: 3 });
    expect('inconnu' in s).toBe(false);
  });

  it('jardin : départ du Codex, compteurs bornés, onglet inconnu', () => {
    expect(DEFAULT_STATE.garden).toEqual({ bed: 1, hydrofarm: 1, irrigator: 0 });
    const s = loadState(storage({ garden: { bed: 12, hydrofarm: 2, irrigator: 9 }, tab: 'cultures' }));
    expect(s.garden).toEqual({ bed: 6, hydrofarm: 2, irrigator: 6 });
    expect(s.tab).toBe('cultures');
    const bad = loadState(storage({ garden: 'x', tab: 'jardin' }));
    expect(bad.garden).toEqual(DEFAULT_STATE.garden);
    expect(bad.tab).toBe('recettes');
  });

  it('ancienne sauvegarde : la case Drip Irrigator équipe tous les lits', () => {
    expect(loadState(storage({ drip: true, plotsLimited: true, plots: 12 })).garden).toEqual({ bed: 1, hydrofarm: 1, irrigator: 1 });
    expect(loadState(storage({ drip: false })).garden.irrigator).toBe(0);
    expect(loadState(storage({ drip: true, garden: { bed: 2, hydrofarm: 0, irrigator: 0 } })).garden.irrigator).toBe(0);
    expect('drip' in loadState(storage({ drip: true }))).toBe(false);
  });

  it('corrige un tri invalide et un plan cassé', () => {
    const s = loadState(storage({ sort: 'nimporte', plan: null }));
    expect(s.sort).toBe('profit');
    expect(s.plan).toEqual({});
    expect(loadState(storage({ view: 'cards', sort: 'name' })).sort).toBe('profit');
  });
});

describe('PlannerStore', () => {
  let store: PlannerStore;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(PlannerStore);
  });

  it('affiche les recettes filtrées par station, triées par profit', () => {
    const all = store.recipes();
    expect(all.length).toBe(55); // défaut : sans les recettes sans culture
    for (let k = 1; k < all.length; k++) expect(all[k - 1].profit).toBeGreaterThanOrEqual(all[k].profit);
    store.patch({ station: 1 });
    expect(store.recipes().every((r) => r.station === 1)).toBe(true);
  });

  it('quantités du plan : bornes 1 à 999, 0 retire la recette', () => {
    store.setQty('omurice', 2);
    store.stepQty('omurice', 1);
    expect(store.qty('omurice')).toBe(3);
    store.setQty('omurice', 5000);
    expect(store.qty('omurice')).toBe(999);
    store.setQty('omurice', 0);
    expect(store.state().plan).toEqual({});
  });

  it('« Mon plan » ne garde que les recettes du plan et passe les cartes en totaux', () => {
    store.setQty('omurice', 4);
    store.toggleOpt('planOnly');
    const list = store.recipes();
    expect(list.map((r) => r.slug)).toEqual(['omurice']);
    expect(list[0].tot.n).toBe(4);
    expect(store.planCount()).toBe(4);
  });

  it('jardin : les lits et les Hydrofarms donnent les parcelles du moteur', () => {
    expect(store.plots()).toBe(24); // 1 lit (9) + 1 Hydrofarm (15)
    expect(store.opt().plots).toEqual([{ n: 9 }, { n: 15, hydro: true }]);
    store.stepGarden('bed', 2);
    store.stepGarden('irrigator', 1);
    expect(store.opt().plots).toEqual([{ n: 9, drip: true }, { n: 18 }, { n: 15, hydro: true }]);
    expect(store.plots()).toBe(42);
  });

  it('jardin : la Nutrient Solution des Hydrofarms entre dans le coût', () => {
    expect(store.opt().nutrient).toEqual({ name: 'Nutrient Solution', icon: 'nutrient-solution', cost: 100, charges: 25 });
    // 5 omurices = 5 riz + 5 tomates : 9 dans le lit, 1 tomate (la plus courte) en Hydrofarm → 3 charges,
    // mais on achète le flacon entier
    store.setQty('omurice', 5);
    const nut = () => [store.planResult().charges, store.planResult().bottles, store.planResult().nutrient, store.planResult().leftover];
    expect(nut()).toEqual([3, 1, 100, 22]);
    store.stepGarden('bed', -1); // Hydrofarm seule : 5 × (2 + 3) charges
    expect(nut()).toEqual([25, 1, 100, 0]);
  });

  it('remplir mes parcelles : maximum de plats par plantation, reste du plan déduit', () => {
    // Tomato Basil Soup : 2 tomates + 1 basilic = 3 parcelles par plat ; 1 lit + 1 Hydrofarm = 24 parcelles
    expect(store.plotFill('mushroom-soup')).toBeNull(); // aucune graine
    store.stepGarden('hydrofarm', -1); // 9 parcelles
    expect(store.fillPlots('tomato-basil-soup')).toBe(true);
    expect(store.qty('tomato-basil-soup')).toBe(3);
    expect(store.plotFill('tomato-basil-soup')).toMatchObject({ plots: 9, free: 9, n: 3, left: 0 });
    // Omurice ×2 (riz + tomate) prend 4 parcelles : il en reste 5 pour la soupe → 1 plat, 2 vides
    store.setQty('omurice', 2);
    store.fillPlots('tomato-basil-soup');
    expect(store.qty('tomato-basil-soup')).toBe(1);
    expect(store.plotFill('tomato-basil-soup')).toMatchObject({ others: 4, free: 5, n: 1, left: 2 });
    expect(store.planResult().seeds).toBe(7);
    // Plus assez de place : rien ne change
    store.setQty('omurice', 4);
    expect(store.fillPlots('tomato-basil-soup')).toBe(false);
    expect(store.qty('tomato-basil-soup')).toBe(1);
  });

  it('en-tête de tableau : tri bouton → inverse → retour au bouton', () => {
    store.setView('table');
    store.sortByColumn('profit');
    expect(store.state().sort).toBe('profit_');
    expect(store.recipes()[0].profit).toBeLessThanOrEqual(store.recipes()[1].profit);
    store.sortByColumn('profit');
    expect(store.state().sort).toBe('profit');
    store.sortByColumn('name');
    expect(store.recipes()[0].name).toBe('Baba Ganoush');
    store.setView('cards');
    expect(store.state().sort).toBe('profit');
  });

  it('recherche sur le plat ou un ingrédient', () => {
    store.q.set('garlic');
    expect(store.recipes().length).toBeGreaterThan(0);
    expect(store.recipes().every((r) => r.ings.some((i) => i.slug === 'garlic'))).toBe(true);
  });

  it('jardin : steppers bornés, irrigateurs ≤ lits, jamais vide, sauvegardés', () => {
    store.stepGarden('irrigator', 1);
    store.stepGarden('irrigator', 1);
    expect(store.state().garden.irrigator).toBe(1); // 1 lit au départ
    store.stepGarden('bed', -1);
    expect(store.state().garden).toEqual({ bed: 0, hydrofarm: 1, irrigator: 0 });
    store.stepGarden('bed', -1);
    store.stepGarden('hydrofarm', -1);
    expect(store.state().garden).toEqual({ bed: 0, hydrofarm: 1, irrigator: 0 });
    for (let k = 0; k < 8; k++) store.stepGarden('hydrofarm', 1);
    expect(store.state().garden.hydrofarm).toBe(5);
    expect(store.plots()).toBe(75);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('loftia-planner-v1')!).garden).toEqual({ bed: 0, hydrofarm: 5, irrigator: 0 });
  });

  it('depuis Cultures : filtre par ingrédient et revient aux recettes', () => {
    store.patch({ tab: 'cultures' });
    store.showRecipesWith('rice');
    expect(store.state().tab).toBe('recettes');
    expect(store.recipes().every((r) => r.ings.some((i) => i.slug === 'rice'))).toBe(true);
  });
});

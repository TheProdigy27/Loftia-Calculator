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

  it('parcelles limitées : bornes 1 à 99, passées au moteur', () => {
    store.patch({ plotsLimited: true });
    store.setPlots(0);
    expect(store.opt().plots).toBe(1);
    store.setPlots(150);
    expect(store.opt().plots).toBe(99);
    store.patch({ plotsLimited: false });
    expect(store.opt().plots).toBe(0);
  });

  it('remplir mes parcelles : maximum de plats par plantation, reste du plan déduit', () => {
    // Tomato Basil Soup : 2 tomates + 1 basilic = 3 parcelles par plat
    expect(store.plotFill('tomato-basil-soup')).toEqual({ per: 3, plots: 0, others: 0, free: 0, n: 0, left: 0 });
    expect(store.plotFill('mushroom-soup')).toBeNull(); // aucune graine
    store.patch({ plotsLimited: true, plots: 7 });
    expect(store.fillPlots('tomato-basil-soup')).toBe(true);
    expect(store.qty('tomato-basil-soup')).toBe(2);
    expect(store.plotFill('tomato-basil-soup')).toMatchObject({ free: 7, n: 2, left: 1 });
    expect(store.planResult().seeds).toBe(6);
    // Omurice ×2 (riz + tomate) prend 4 parcelles : il en reste 3 pour la soupe → 1 plat
    store.setQty('omurice', 2);
    store.fillPlots('tomato-basil-soup');
    expect(store.qty('tomato-basil-soup')).toBe(1);
    expect(store.plotFill('tomato-basil-soup')).toMatchObject({ others: 4, free: 3, n: 1, left: 0 });
    // Plus assez de place : rien ne change
    store.setQty('omurice', 6);
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

  it('depuis Cultures : filtre par ingrédient et revient aux recettes', () => {
    store.patch({ tab: 'cultures' });
    store.showRecipesWith('rice');
    expect(store.state().tab).toBe('recettes');
    expect(store.recipes().every((r) => r.ings.some((i) => i.slug === 'rice'))).toBe(true);
  });
});

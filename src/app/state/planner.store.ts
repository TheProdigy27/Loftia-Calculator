/*
 * État de l'appli (signals) : réglages joueur, filtres, tris et plan de cuisine.
 * Reprend la logique de reference/prototype/index.html ; les calculs restent dans core/engine.ts.
 */
import { Injectable, computed, effect, signal } from '@angular/core';
import rawData from '../../data/loftia-data.json';
import { createEngine, paretoSet } from '../core/engine';
import type { CalcOptions, ComputedRecipe, LoftiaData, PlanQuantities, PriceMode } from '../core/types';

export type Tab = 'recettes' | 'cultures';
export type View = 'cards' | 'table';
export type BaseSort = 'profit' | 'time' | 'dph' | 'dpe';
export type IncKey = 'nocrop' | 'gather' | 'shop' | 'craft';
export type OptKey = 'treesReady' | 'paretoOnly' | 'planOnly';
export type CropSortKey = 'seedName' | 'name' | 'grow' | 'water' | 'cost' | 'value' | 'profit' | 'dph' | 'uses';

export interface PlannerState {
  tab: Tab;
  cookLvl: number;
  farmLvl: number;
  mode: PriceMode;
  plotsLimited: boolean;
  plots: number;
  station: number;
  plan: PlanQuantities;
  planOnly: boolean;
  inc: Record<IncKey, boolean>;
  treesReady: boolean;
  paretoOnly: boolean;
  /** Tri : clé de SORTS, clé de colonne du tableau, ou « profit_ » (tri inverse d'une colonne déjà triée par un bouton) */
  sort: string;
  dir: 1 | -1;
  view: View;
  ings: string[];
  cropSort: CropSortKey;
  cropDir: 1 | -1;
  /** Encadré d'aide sous la barre de réglages */
  showTip: boolean;
}

export interface RecipeRow extends ComputedRecipe {
  pareto: boolean;
}

const STORE_KEY = 'loftia-planner-v1';

export const DEFAULT_STATE: PlannerState = {
  tab: 'recettes',
  cookLvl: 1,
  farmLvl: 1,
  mode: 'cash',
  plotsLimited: false,
  plots: 6,
  station: 3,
  plan: {},
  planOnly: false,
  inc: { nocrop: false, gather: true, shop: true, craft: true },
  treesReady: false,
  paretoOnly: false,
  sort: 'profit',
  dir: -1,
  view: 'cards',
  ings: [],
  cropSort: 'dph',
  cropDir: -1,
  showTip: false,
};

export const SORTS: Record<BaseSort, (a: ComputedRecipe, b: ComputedRecipe) => number> = {
  profit: (a, b) => b.profit - a.profit || a.time - b.time,
  time: (a, b) => a.time - b.time || b.profit - a.profit,
  dph: (a, b) =>
    Number(a.dph === null) - Number(b.dph === null) || (b.dph || 0) - (a.dph || 0) || b.profit - a.profit,
  dpe: (a, b) => b.dpe - a.dpe || b.profit - a.profit,
};

/** Colonnes triables du tableau ; « k_ » = tri inverse d'une colonne triée par un bouton */
const TABLE_KEYS: Record<string, keyof ComputedRecipe> = {
  name: 'name',
  time: 'time',
  cost: 'cost',
  value: 'value',
  profit: 'profit',
  dph: 'dph',
  dpe: 'dpe',
  station: 'station',
  profit_: 'profit',
  dph_: 'dph',
  dpe_: 'dpe',
  time_: 'time',
};

export const isBaseSort = (s: string): s is BaseSort => s in SORTS;

function compareBy<T>(k: keyof T, d: number) {
  return (a: T, b: T) => {
    const x = a[k] as unknown;
    const y = b[k] as unknown;
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === 'string') return d * x.localeCompare(y as string);
    return d * ((x as number) - (y as number));
  };
}

export function loadState(storage: Pick<Storage, 'getItem'> | null): PlannerState {
  const state: PlannerState = structuredClone(DEFAULT_STATE);
  try {
    const saved = JSON.parse(storage?.getItem(STORE_KEY) ?? 'null') as Partial<PlannerState> | null;
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(DEFAULT_STATE) as (keyof PlannerState)[]) {
        if (k in saved) (state as unknown as Record<string, unknown>)[k] = saved[k];
      }
    }
    if (!state.plan || typeof state.plan !== 'object') state.plan = {};
    if (!isBaseSort(state.sort) && !(state.sort in TABLE_KEYS)) state.sort = 'profit';
    if (state.view === 'cards' && !isBaseSort(state.sort)) state.sort = 'profit';
  } catch {
    /* sauvegarde illisible : on repart des valeurs par défaut */
  }
  return state;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class PlannerStore {
  readonly engine = createEngine(rawData as LoftiaData);
  readonly data = this.engine.data;

  readonly state = signal<PlannerState>(loadState(safeStorage()));
  /** Recherche : jamais sauvegardée */
  readonly q = signal('');
  readonly ingPickerOpen = signal(this.state().ings.length > 0);

  constructor() {
    effect(() => {
      const s = this.state();
      try {
        safeStorage()?.setItem(STORE_KEY, JSON.stringify(s));
      } catch {
        /* stockage indisponible : l'appli marche quand même */
      }
    });
  }

  patch(p: Partial<PlannerState>): void {
    this.state.update((s) => ({ ...s, ...p }));
  }

  // ---------- options de calcul ----------
  readonly opt = computed<CalcOptions>(() => {
    const s = this.state();
    return {
      cookLvl: s.cookLvl,
      farmLvl: s.farmLvl,
      mode: s.mode,
      plots: s.plotsLimited ? s.plots : 0,
      treesReady: s.treesReady,
    };
  });

  /** Nombre de parcelles retenu (0 = illimitées) */
  readonly plots = computed(() => this.opt().plots);

  // ---------- plan ----------
  readonly planResult = computed(() => this.engine.computePlan(this.state().plan, this.opt()));
  readonly planCount = computed(() => this.planResult().count);

  qty(slug: string): number {
    return this.state().plan[slug] || 0;
  }

  setQty(slug: string, n: number | string): void {
    const v = Math.round(Number(n));
    this.state.update((s) => {
      const plan = { ...s.plan };
      if (!Number.isFinite(v) || v <= 0) delete plan[slug];
      else plan[slug] = Math.min(999, v);
      return { ...s, plan };
    });
  }

  stepQty(slug: string, d: number): void {
    this.setQty(slug, this.qty(slug) + d);
  }

  clearPlan(): void {
    this.patch({ plan: {} });
  }

  // ---------- réglages ----------
  stepLevel(k: 'cookLvl' | 'farmLvl', d: number): void {
    this.state.update((s) => ({ ...s, [k]: Math.max(1, Math.min(20, s[k] + d)) }));
  }

  setPlots(n: number | string): void {
    const v = Math.round(Number(n));
    this.patch({ plots: Number.isFinite(v) && v >= 1 ? Math.min(99, v) : 1 });
  }

  setView(view: View): void {
    const s = this.state();
    this.patch({ view, sort: view === 'cards' && !isBaseSort(s.sort) ? 'profit' : s.sort });
  }

  toggleInc(k: IncKey): void {
    this.state.update((s) => ({ ...s, inc: { ...s.inc, [k]: !s.inc[k] } }));
  }

  toggleOpt(k: OptKey): void {
    this.state.update((s) => ({ ...s, [k]: !s[k] }));
  }

  toggleIng(slug: string): void {
    this.state.update((s) => ({
      ...s,
      ings: s.ings.includes(slug) ? s.ings.filter((x) => x !== slug) : [...s.ings, slug],
    }));
  }

  /** Depuis Cultures : afficher les recettes qui utilisent cet ingrédient */
  showRecipesWith(slug: string): void {
    this.q.set('');
    this.ingPickerOpen.set(true);
    this.patch({ ings: [slug], tab: 'recettes' });
  }

  /** Clic sur un en-tête du tableau des recettes (même cycle que le prototype) */
  sortByColumn(k: string): void {
    const s = this.state();
    if (s.sort === k && !isBaseSort(k)) this.patch({ dir: s.dir === 1 ? -1 : 1 });
    else if (s.sort === k && isBaseSort(k)) this.patch({ sort: `${k}_`, dir: k === 'time' ? -1 : 1 });
    else this.patch({ sort: k, dir: ['name', 'cost', 'time', 'station'].includes(k) ? 1 : -1 });
  }

  sortCrops(k: CropSortKey): void {
    const s = this.state();
    if (s.cropSort === k) this.patch({ cropDir: s.cropDir === 1 ? -1 : 1 });
    else
      this.patch({
        cropSort: k,
        cropDir: ['grow', 'water', 'cost', 'name', 'seedName'].includes(k) ? 1 : -1,
      });
  }

  readonly baseSort = computed(() => this.state().sort.replace(/_$/, ''));

  // ---------- recettes ----------
  readonly recipes = computed<RecipeRow[]>(() => {
    const s = this.state();
    const o = this.opt();
    const q = this.q().trim().toLowerCase();
    const list = this.data.recipes
      .map((r) => this.engine.computeRecipe(r, o, s.plan[r.slug] || 1))
      .filter((r) => {
        if (s.planOnly && !s.plan[r.slug]) return false;
        if (r.station > s.station) return false;
        if (!s.inc.nocrop && !r.hasCrop) return false;
        if (!s.inc.gather && r.hasGather) return false;
        if (!s.inc.shop && r.hasShop) return false;
        if (!s.inc.craft && r.hasCraft) return false;
        for (const ing of s.ings) if (!r.ings.some((i) => i.slug === ing)) return false;
        if (q && !r.name.toLowerCase().includes(q) && !r.ings.some((i) => i.name.toLowerCase().includes(q)))
          return false;
        return true;
      });
    const pareto = paretoSet(list);
    let rows: RecipeRow[] = list.map((r) => ({ ...r, pareto: pareto.has(r.slug) }));
    if (s.paretoOnly) rows = rows.filter((r) => r.pareto);
    if (s.view === 'table' && TABLE_KEYS[s.sort] && !isBaseSort(s.sort)) {
      rows.sort(compareBy<RecipeRow>(TABLE_KEYS[s.sort], s.dir));
    } else {
      rows.sort(isBaseSort(s.sort) ? SORTS[s.sort] : SORTS.profit);
    }
    return rows;
  });
}

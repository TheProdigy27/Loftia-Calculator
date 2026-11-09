/*
 * Minuteur du plan : calendrier des arrosages, replantations et récoltes à partir du moment où on a planté.
 * Fonctions pures ; l'horloge, le son et les alertes sont dans state/timer.store.ts.
 *
 * Hypothèses : on plante et on arrose tout ce qui tient dans les parcelles juste avant de lancer le minuteur ;
 * un arrosage tient `water` minutes, il faut donc arroser de nouveau toutes les `water` minutes jusqu'à la récolte.
 * Avec plus de graines que de parcelles, les plantations suivent la même répartition que le temps du plan
 * (engine.ts, makespan) : la plus longue culture d'abord, et on replante dès qu'une parcelle se libère.
 */
import type { ComputedPlan } from './types';

export type StepKind = 'harvest' | 'plant' | 'water';

/** Une action à faire en jeu : récolter, replanter ou arroser `qty` plants d'une culture */
export interface TimerStep {
  kind: StepKind;
  slug: string;
  name: string;
  qty: number;
  /** Fruit d'arbre : pas de parcelle, on le cueille */
  tree?: boolean;
}

export interface TimerEvent {
  /** Minutes depuis le lancement du minuteur */
  at: number;
  steps: TimerStep[];
}

export interface TimerSchedule {
  /** À planter (et arroser) avant de lancer le minuteur */
  first: TimerStep[];
  events: TimerEvent[];
  /** Dernière récolte (min) : c'est le temps du plan */
  total: number;
}

interface Unit {
  slug: string;
  name: string;
  grow: number;
  water: number;
  tree: boolean;
}

const KIND_ORDER: Record<StepKind, number> = { harvest: 0, plant: 1, water: 2 };

function byKindThenName(a: TimerStep, b: TimerStep): number {
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name);
}

/**
 * Calendrier du plan.
 * @param plots parcelles (0 = illimitées)
 * @param waterOf durée d'un arrosage (min, à la seconde près) d'une culture, Deep Hydration et Drip Irrigator compris
 */
export function buildSchedule(
  plan: ComputedPlan,
  plots: number,
  waterOf: (slug: string) => number,
): TimerSchedule {
  const crops: Unit[] = [];
  const planted: { u: Unit; start: number; qty: number }[] = [];
  for (const i of plan.ings) {
    // t = 0 : arbre déjà planté, le fruit est disponible tout de suite
    if ((i.type !== 'crop' && i.type !== 'tree') || i.t <= 0) continue;
    const u: Unit = {
      slug: i.slug,
      name: i.name,
      grow: i.t,
      water: waterOf(i.slug),
      tree: i.type === 'tree',
    };
    if (u.tree) planted.push({ u, start: 0, qty: i.qty });
    else for (let k = 0; k < i.qty; k++) crops.push(u);
  }

  if (!plots || plots >= crops.length) {
    for (const u of crops) planted.push({ u, start: 0, qty: 1 });
  } else {
    // Même répartition que makespan() : la plus longue d'abord, sur la parcelle la moins chargée
    const sorted = [...crops].sort((a, b) => b.grow - a.grow || a.slug.localeCompare(b.slug));
    const loads = new Array<number>(plots).fill(0);
    for (const u of sorted) {
      let mi = 0;
      for (let k = 1; k < loads.length; k++) if (loads[k] < loads[mi]) mi = k;
      planted.push({ u, start: loads[mi], qty: 1 });
      loads[mi] += u.grow;
    }
  }

  const first = new Map<string, TimerStep>();
  const byTime = new Map<number, Map<string, TimerStep>>();
  const add = (at: number, kind: StepKind, u: Unit, qty: number) => {
    let steps = byTime.get(at);
    if (!steps) byTime.set(at, (steps = new Map()));
    addStep(steps, { kind, slug: u.slug, name: u.name, qty, ...(u.tree ? { tree: true } : {}) });
  };

  let total = 0;
  for (const { u, start, qty } of planted) {
    if (start > 0) add(start, 'plant', u, qty);
    else if (!u.tree) addStep(first, { kind: 'plant', slug: u.slug, name: u.name, qty });
    const end = start + u.grow;
    // k × water plutôt que des additions successives : pas de dérive avec des durées à la seconde (7,5 min)
    if (u.water > 0) for (let k = 1; start + k * u.water < end; k++) add(start + k * u.water, 'water', u, qty);
    add(end, 'harvest', u, qty);
    total = Math.max(total, end);
  }

  const events = [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([at, steps]) => ({ at, steps: [...steps.values()].sort(byKindThenName) }));
  return { first: [...first.values()].sort(byKindThenName), events, total };
}

function addStep(map: Map<string, TimerStep>, s: TimerStep): void {
  const key = `${s.kind}|${s.slug}`;
  const prev = map.get(key);
  if (prev) prev.qty += s.qty;
  else map.set(key, { ...s });
}

/**
 * Regroupe plusieurs rappels annoncés en même temps (appli fermée ou en veille entre-temps) :
 * les récoltes et replantations s'additionnent ; seul le dernier arrosage compte, et il disparaît
 * si la culture a été récoltée ensuite.
 */
export function mergeSteps(events: readonly TimerEvent[]): TimerStep[] {
  const map = new Map<string, TimerStep>();
  for (const e of events) {
    // Dans un rappel, les récoltes passent avant les arrosages (byKindThenName)
    for (const s of e.steps) {
      const key = `${s.kind}|${s.slug}`;
      const prev = map.get(key);
      if (s.kind === 'harvest') map.delete(`water|${s.slug}`);
      if (s.kind === 'water' || !prev) map.set(key, { ...s });
      else prev.qty += s.qty;
    }
  }
  return [...map.values()].sort(byKindThenName);
}

export function stepVerb(s: TimerStep): string {
  switch (s.kind) {
    case 'harvest':
      return s.tree ? 'Cueille' : 'Récolte';
    case 'plant':
      return 'Replante';
    default:
      return 'Arrose';
  }
}

/** Titre de la notification */
export function alertTitle(steps: readonly TimerStep[]): string {
  const harvest = steps.some((s) => s.kind === 'harvest');
  const water = steps.some((s) => s.kind === 'water');
  if (harvest && water) return 'Récolte et arrosage !';
  if (harvest) return 'C’est prêt à récolter !';
  return 'C’est l’heure d’arroser !';
}

/** Résumé court pour la barre du haut */
export function nextLabel(steps: readonly TimerStep[]): string {
  if (steps.some((s) => s.kind === 'harvest')) return 'Récolte';
  if (steps.some((s) => s.kind === 'plant')) return 'Replanter';
  return 'Arrosage';
}

/** 272_000 ms → « 4:32 », 3_909_000 → « 1:05:09 » (arrondi à la seconde supérieure) */
export function fmtCountdown(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Heure locale « 14:05 » */
export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

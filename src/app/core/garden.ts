/*
 * Jardin du joueur : garden beds 3x3 (9 parcelles), Drip Irrigators et Hydrofarms (15 parcelles),
 * comme sur loftiacodex.com/economy/garden. Ces compteurs donnent les parcelles sur lesquelles
 * le moteur répartit les graines (engine.ts, placeUnits).
 * Librairie pure, sans dépendance ni accès disque/réseau.
 */
import type { NutrientSolution, SlotGroup } from './types';

export type PlotKey = 'bed' | 'hydrofarm';

export interface GardenPlot {
  key: PlotKey;
  name: string;
  icon: string;
  /** Parcelles (plantes) par lit ou par Hydrofarm */
  per: number;
  /** Nombre au départ du jeu */
  start: number;
  max: number;
}

/** Format de src/data/loftia-garden.json */
export interface GardenData {
  source: string;
  extracted: string;
  plots: GardenPlot[];
  /** Ce que boivent les Hydrofarms (Codex : 100 Dew le flacon de 25 charges) */
  nutrient: NutrientSolution & { name: string; icon: string };
}

/** Ce que le joueur possède (mêmes clés que localStorage["codex.garden"] sur le Codex) */
export interface GardenCounts {
  bed: number;
  hydrofarm: number;
  irrigator: number;
}
export type GardenCountKey = keyof GardenCounts;

function plot(garden: GardenData, key: PlotKey): GardenPlot {
  const p = garden.plots.find((x) => x.key === key);
  if (!p) throw new Error(`Parcelle inconnue dans le jardin : ${key}`);
  return p;
}

/** Bornes d'un compteur : les Drip Irrigators ne dépassent pas le nombre de lits, et le jardin n'est jamais vide */
export function countRange(key: GardenCountKey, counts: GardenCounts, garden: GardenData): { min: number; max: number } {
  if (key === 'irrigator') return { min: 0, max: counts.bed };
  const other = key === 'bed' ? counts.hydrofarm : counts.bed;
  return { min: other > 0 ? 0 : 1, max: plot(garden, key).max };
}

/** Compteurs entiers et bornés, irrigateurs ≤ lits ; valeurs de départ du Codex si absents, illisibles ou jardin vide */
export function normalizeCounts(raw: unknown, garden: GardenData): GardenCounts {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const read = (k: GardenCountKey, max: number, dflt: number) => {
    const v = src[k];
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : dflt;
  };
  const bed = plot(garden, 'bed');
  const hydro = plot(garden, 'hydrofarm');
  const out: GardenCounts = {
    bed: read('bed', bed.max, bed.start),
    hydrofarm: read('hydrofarm', hydro.max, hydro.start),
    irrigator: read('irrigator', Infinity, 0),
  };
  if (!out.bed && !out.hydrofarm) {
    out.bed = bed.start;
    out.hydrofarm = hydro.start;
  }
  out.irrigator = Math.min(out.irrigator, out.bed);
  return out;
}

/** + / − sur un compteur, dans ses bornes */
export function stepCount(counts: GardenCounts, key: GardenCountKey, d: number, garden: GardenData): GardenCounts {
  const { min, max } = countRange(key, counts, garden);
  const next = { ...counts, [key]: Math.max(min, Math.min(max, counts[key] + d)) };
  next.irrigator = Math.min(next.irrigator, next.bed);
  return next;
}

/** Parcelles du jardin, dans l'ordre où le moteur les remplit à égalité : lits irrigués, autres lits, Hydrofarms */
export function gardenSlots(counts: GardenCounts, garden: GardenData): SlotGroup[] {
  const per = plot(garden, 'bed').per;
  const irrigated = Math.min(counts.irrigator, counts.bed);
  const groups: SlotGroup[] = [
    { n: irrigated * per, drip: true },
    { n: (counts.bed - irrigated) * per },
    { n: counts.hydrofarm * plot(garden, 'hydrofarm').per, hydro: true },
  ];
  return groups.filter((g) => g.n > 0);
}

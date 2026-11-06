import { fmtTime, n0 } from './format';
import type { ComputedPlan, IngredientType } from './types';

/** Groupes de la liste de courses, dans l'ordre d'affichage */
export const PLAN_GROUPS: { type: IngredientType; title: string; icon: string }[] = [
  { type: 'crop', title: 'À planter', icon: 'T_UI_Attribute_Icons_Farm' },
  { type: 'tree', title: "Fruits d'arbres", icon: 'coconut-tree-sapling' },
  { type: 'gather', title: 'À cueillir', icon: 'wild-berries' },
  { type: 'shop', title: 'À acheter chez Kun', icon: 'egg' },
  { type: 'craft', title: 'Ruche', icon: 'honey' },
];

export function plotsLabel(plots: number): string {
  return plots ? `${plots} parcelle${plots > 1 ? 's' : ''}` : 'parcelles illimitées';
}

/** Texte « Copier la liste » du plan (même format que le prototype) */
export function planText(P: ComputedPlan, plots: number): string {
  if (!P.count) return '';
  const L = [`Plan de cuisine Loftia — ${P.count} plat${P.count > 1 ? 's' : ''}`];
  for (const e of P.entries) L.push(`• ${e.tot.n}× ${e.name}`);
  for (const g of PLAN_GROUPS) {
    const list = P.ings.filter((i) => i.type === g.type);
    if (!list.length) continue;
    L.push('', `${g.title} :`);
    for (const i of list) {
      const extra =
        i.type === 'crop'
          ? ` (${i.seedName}, ${n0(i.qty * (i.cash ?? 0))} Dew, ${fmtTime(i.t)})`
          : i.type === 'shop'
            ? ` (${n0(i.qty * (i.cash ?? 0))} Dew)`
            : i.where
              ? ` (${i.where})`
              : '';
      L.push(`  - ${i.name} ×${i.qty}${extra}`);
    }
  }
  L.push('');
  L.push(`Vente ${n0(P.value)} · Coût ${n0(P.cost)} · Profit ${n0(P.profit)} Dew`);
  L.push(
    `Temps ${P.time ? fmtTime(P.time) : '—'} (${plotsLabel(plots)}) · Énergie ${P.energy} · À dépenser ${n0(P.seedCost + P.shopCost)} Dew`,
  );
  return L.join('\n');
}

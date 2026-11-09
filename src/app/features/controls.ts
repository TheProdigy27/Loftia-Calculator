import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { Perk } from '../core/types';
import { PlannerStore, RecipeRow } from '../state/planner.store';
import { AssetPipe, PlotsControl } from '../ui/shared';

const PERK_ICON: Record<string, string> = {
  'cooking.refund': 'T_UI_Perks_Cook_IngredientRefund',
  'cooking.double': 'T_UI_Perks_Cook_DoubleDish',
  'farming.double': 'T_UI_Perks_Farm_DoubleHarvest',
  'farming.faster': 'T_UI_Perks_Farm_FasterCrops',
  'farming.water': 'T_UI_Perks_Farm_WetterCrops',
};
const PERK_DESC: Record<string, string> = {
  'cooking.refund': '5 % de chance de récupérer le premier ingrédient (baisse le coût moyen)',
  'cooking.double': "5 % de chance d'obtenir un plat en double (+5 % de valeur moyenne)",
  'farming.double': '5 % de chance de double récolte (+5 % de valeur moyenne)',
  'farming.faster': 'Les cultures poussent 5 % plus vite',
  'farming.water': "L'arrosage tient plus longtemps (+15 % puis +25 %)",
};

interface PerkChip {
  icon: string;
  label: string;
  title: string;
  on: boolean;
}

function perkChips(skill: 'cooking' | 'farming', tiers: Record<string, Perk[]>, lvl: number): PerkChip[] {
  return Object.keys(tiers)
    .sort((a, b) => tiers[a][0].level - tiers[b][0].level)
    .map((k) => {
      const key = `${skill}.${k}`;
      const list = tiers[k];
      const on = list.filter((p) => lvl >= p.level);
      const next = list.find((p) => lvl < p.level);
      const base = list[0].name.replace(/ I+$/, '');
      return {
        icon: PERK_ICON[key],
        on: on.length > 0,
        label: on.length ? on[on.length - 1].name : `${base} · Lv ${list[0].level}`,
        title:
          `${base} — ${PERK_DESC[key]}` +
          (on.length ? ` · actif : ${on.map((p) => p.name).join(', ')}` : '') +
          (next ? ` · prochain palier au Lv ${next.level}` : ''),
      };
    });
}

@Component({
  selector: 'app-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AssetPipe, PlotsControl],
  host: { class: 'controls' },
  template: `
    <div class="panel ctlbar">
      @for (row of levelRows(); track row.key) {
        <div class="ctl" [title]="'Ton niveau de ' + row.label">
          <span class="clabel"><img [src]="row.icon | asset" alt="" />{{ row.label }}</span>
          <div class="stepper">
            <button type="button" class="step" [disabled]="row.lvl <= 1" (click)="store.stepLevel(row.key, -1)" [attr.aria-label]="'Baisser le niveau de ' + row.label">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 12h12" /></svg>
            </button>
            <span class="lv">Lv {{ row.lvl }}</span>
            <button type="button" class="step" [disabled]="row.lvl >= 20" (click)="store.stepLevel(row.key, 1)" [attr.aria-label]="'Monter le niveau de ' + row.label">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 12h12M12 6v12" /></svg>
            </button>
          </div>
          <span class="perks">
            @for (p of row.perks; track p.icon) {
              <img class="perk" [class.off]="!p.on" [src]="p.icon | asset" [alt]="p.label" [title]="p.title" />
            }
          </span>
        </div>
      }

      <div class="ctl" title="Prix utilisé pour le coût des ingrédients">
        <span class="clabel">Prix</span>
        <div class="seg">
          <button type="button" [attr.aria-pressed]="s().mode === 'cash'" (click)="store.patch({ mode: 'cash' })">Ce que ça coûte</button>
          <button type="button" [attr.aria-pressed]="s().mode === 'regular'" (click)="store.patch({ mode: 'regular' })">Prix de revente</button>
        </div>
      </div>
      <div class="ctl" title="Pour calculer le temps de pousse">
        <span class="clabel">Parcelles</span>
        <app-plots />
      </div>
      <div class="ctl" title="Drip Irrigator installé sur tes garden beds : l'arrosage tient 150 % plus longtemps, en plus de Deep Hydration (pas sur les arbres)">
        <button type="button" class="chip" [attr.aria-pressed]="s().drip" (click)="store.toggleOpt('drip')">
          <span class="box"></span><img [src]="'drip-irrigator' | asset" alt="" />Drip Irrigator
        </button>
      </div>
      <div class="ctl" title="Station de cuisine : recettes jusqu'à ce niveau">
        <span class="clabel"><img src="assets/cooking-station.webp" alt="" />Station</span>
        <div class="seg">
          @for (lv of [1, 2, 3]; track lv) {
            <button type="button" [attr.aria-pressed]="s().station === lv" (click)="store.patch({ station: lv })">Lv {{ lv }}</button>
          }
        </div>
      </div>

      <button type="button" class="helpbtn" [attr.aria-expanded]="s().showTip" (click)="store.patch({ showTip: !s().showTip })" title="Comment c'est calculé ?" aria-label="Afficher l'aide">?</button>
    </div>

    @if (s().showTip) {
      <div class="tip">
        <span class="tip-tag">Tip</span>
        @if (s().tab === 'cultures') {
          <p><b>Dew / h</b> = (vente − prix de la graine) ÷ temps de pousse, comme sur le Codex. Ton niveau de Farming applique Rapid Growth (pousse plus courte), Fruitful Harvest (valeur moyenne) et Deep Hydration (arrosage plus long).</p>
          <p><b>Arrosage</b> = combien de temps un arrosage tient{{ s().drip ? ', Drip Irrigator compris (+150 %, pas sur les arbres)' : '' }}. Le minuteur du plan s'en sert pour te rappeler d'arroser. Les arbres n'ont pas de prix de graine relevé sur le Codex.</p>
          <div class="ex">Clique sur les plats d'une ligne pour voir les recettes qui utilisent cette culture.</div>
        } @else {
          @if (s().mode === 'cash') {
            <p><b>Ce que ça coûte</b> : prix des graines + achats en boutique. La cueillette et les fruits d'arbres sont gratuits. Le profit, c'est ce que tu gagnes vraiment en partant de zéro.</p>
          } @else {
            <p><b>Prix de revente</b> (comme sur le Codex) : tes cultures et ta cueillette comptent pour ce que tu pourrais les vendre, la boutique pour son prix. Le profit, c'est ce que la cuisine ajoute par rapport à vendre les ingrédients bruts.</p>
          }
          @if (!s().plotsLimited) {
            <p><b>Temps</b> = pousse de l'ingrédient le plus long (<span class="here">cerclé en orange</span>), toutes les graines plantées en même temps.</p>
          } @else {
            <p><b>Temps</b> = toutes les graines réparties au mieux sur <b>{{ s().plots }} parcelle{{ s().plots > 1 ? 's' : '' }}</b>. Les arbres ne prennent pas de parcelle. L'ingrédient le plus long est <span class="here">cerclé en orange</span>.</p>
          }
          <p>Ajoute des recettes à <b>ton plan</b> avec le bouton + : la carte passe en totaux et le plan additionne les ingrédients.</p>
          @if (example(); as ex) {
            <div class="ex">
              <b>{{ ex.name }}</b> : {{ ex.parts }} = {{ ex.cost }} Dew{{ s().cookLvl >= 2 ? ' (Ingredient Saver inclus)' : '' }}{{ ex.approx ? ' · prix du miel inconnu, valeur de revente utilisée' : '' }}
            </div>
          }
        }
      </div>
    }
  `,
})
export class Controls {
  protected readonly store = inject(PlannerStore);
  protected readonly s = this.store.state;

  protected readonly levelRows = computed(() => {
    const s = this.s();
    const perks = this.store.data.perks;
    return [
      { key: 'cookLvl' as const, label: 'Cuisine', icon: 'T_UI_Attribute_Icons_Cook', lvl: s.cookLvl, perks: perkChips('cooking', perks.cooking, s.cookLvl) },
      { key: 'farmLvl' as const, label: 'Farming', icon: 'T_UI_Attribute_Icons_Farm', lvl: s.farmLvl, perks: perkChips('farming', perks.farming, s.farmLvl) },
    ];
  });

  /** Détail du coût de la première recette affichée */
  protected readonly example = computed(() => {
    const top: RecipeRow | undefined = this.store.recipes()[0];
    if (!top) return null;
    return {
      name: top.name,
      parts: top.ings.map((i) => `${i.name} ${i.q > 1 ? i.q + '×' : ''}${i.unit}`).join(' + '),
      cost: top.cost,
      approx: top.approx,
    };
  });
}

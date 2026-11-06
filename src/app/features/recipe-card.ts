import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { fmtTime } from '../core/format';
import type { ComputedIngredient } from '../core/types';
import { PlannerStore, RecipeRow } from '../state/planner.store';
import { AssetPipe, CODEX_ITEMS, Dew, ExternalLink, Icon, N0Pipe, N1Pipe, QtyControl, TimePipe } from '../ui/shared';
import { FillButton } from './fill-button';

export const TYPE_LABEL: Record<string, string> = {
  crop: 'Culture',
  tree: 'Arbre',
  gather: 'Cueillette',
  shop: 'Boutique',
  craft: 'Ruche',
};

/** Infobulle d'un ingrédient (même texte que le prototype) */
export function ingTitle(i: ComputedIngredient, growTime: (base: number) => number): string {
  const src =
    i.type === 'crop'
      ? `Culture · graine ${i.cash} Dew · pousse ${fmtTime(i.t)}`
      : i.type === 'tree'
        ? `Arbre (${i.seedName}) · fruit toutes les ${fmtTime(growTime(i.grow))}`
        : `${TYPE_LABEL[i.type]} · ${i.where}`;
  return (
    `${i.name} ×${i.q} — ${src} · compté ${i.unit} Dew/u` +
    (i.approx ? ' (coût inconnu, revente utilisée)' : '') +
    (i.crit ? ' · le plus long à pousser' : '')
  );
}

@Component({
  selector: 'app-recipe-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AssetPipe, TimePipe, N0Pipe, N1Pipe, Dew, Icon, QtyControl, ExternalLink, FillButton],
  host: {
    class: 'panel rcard',
    '[class.inplan]': 'n() > 0',
    tabindex: '0',
    '[attr.aria-label]': 'r().name',
    '(keydown)': 'onKey($event)',
  },
  template: `
    @let rec = r();
    @let T = rec.tot;
    @let s = store.baseSort();
    <span class="rank" [class.top]="rank() < 3">#{{ rank() + 1 }}</span>
    <div class="rhead">
      <span class="dish-art"><img [src]="rec.slug | asset" alt="" loading="lazy" /></span>
      <div>
        <a class="rname" appExternal [href]="codex + rec.slug">{{ rec.name }}</a>
        <div class="tags">
          <span class="tag" title="Niveau de station de cuisine requis"><img src="assets/cooking-station.webp" alt="" />Station Lv {{ rec.station }}</span>
          <span class="tag" title="Énergie dépensée pour cuisiner un plat"><img src="assets/energy-cost.webp" alt="" />{{ rec.energy }}</span>
          @if (rec.recipePrice) {
            <span class="tag kun" title="Recette vendue chez Kun's Recipe Shop (prix de base)">Recette {{ rec.recipePrice }}</span>
          }
          @if (rec.pareto) {
            <span class="tag best" title="Aucune autre recette n'est à la fois plus rapide et plus rentable">Meilleur compromis</span>
          }
          @if (!rec.hasCrop) {
            <span class="tag warn" title="Aucun ingrédient à faire pousser">Aucune pousse</span>
          }
        </div>
      </div>
    </div>

    <div class="ings">
      @for (i of rec.ings; track i.slug) {
        <a class="ing" appExternal [class.crit]="i.crit" [class.hit]="hit().has(i.slug)" [href]="codex + i.slug" [title]="title(i)">
          <span class="ing-art"><img [src]="i.slug | asset" alt="" loading="lazy" /><span class="qty">×{{ i.q * (n() || 1) }}</span></span>
          <span class="nm">{{ i.name }}</span>
          @switch (i.type) {
            @case ('crop') { <span class="tm crop">{{ i.t | time }}</span> }
            @case ('tree') { <span class="tm tree">{{ store.state().treesReady ? 'prêt' : (i.t | time) }}</span> }
            @default { <span class="tm" [class]="i.type">{{ typeLabel[i.type] }}</span> }
          }
        </a>
      }
    </div>

    @if (n()) {
      <div class="totcap">Total pour {{ n() }} plat{{ n() > 1 ? 's' : '' }}</div>
    }
    <div class="metrics">
      <div class="m" [attr.title]="per(rec.cost + ' Dew')"><div class="l">Coût</div><div class="v"><app-dew />{{ T.cost }}{{ rec.approx ? '≈' : '' }}</div></div>
      <div class="m" [attr.title]="per(rec.value + ' Dew')"><div class="l">Vente</div><div class="v"><app-dew />{{ T.value }}</div></div>
      <div class="m" [class.hot]="s === 'profit'" [attr.title]="per(rec.profit + ' Dew')">
        <div class="l">Profit</div><div class="v" [class.neg]="T.profit < 0"><app-dew />{{ T.profit }}</div>
      </div>
      <div class="m" [class.hot]="s === 'time'" [attr.title]="per(rec.time ? (rec.time | time) : '—')">
        <div class="l">Temps</div>
        <div class="v">@if (T.time) { {{ T.time | time }} } @else { <span class="na">—</span> }</div>
      </div>
      @if (s === 'dpe') {
        <div class="m hot" [attr.title]="per('même ratio')"><div class="l">Dew/⚡</div><div class="v"><app-dew />{{ rec.dpe | n1 }}</div></div>
      } @else {
        <div class="m" [class.hot]="s === 'dph'" [attr.title]="per(rec.dph === null ? '—' : (rec.dph | n0) + ' Dew/h')">
          <div class="l">Dew / h</div>
          <div class="v">@if (T.dph === null) { <span class="na">sans pousse</span> } @else { <app-dew />{{ T.dph | n0 }} }</div>
        </div>
      }
    </div>

    <div class="qtyrow">
      @if (n()) {
        <span class="lbl">Je cuisine</span>
        <app-qty [slug]="rec.slug" />
        <app-fill-btn [r]="rec" [compact]="true" />
        <span class="tot"><img src="assets/energy-cost.webp" alt="" />{{ T.energy }} énergie</span>
        <button type="button" class="iconbtn" (click)="store.setQty(rec.slug, 0)" title="Retirer du plan" aria-label="Retirer du plan"><app-icon name="x" /></button>
      } @else {
        <button type="button" class="addbtn" (click)="store.setQty(rec.slug, 1)"><app-icon name="plus" />Ajouter au plan</button>
        <app-fill-btn [r]="rec" />
        <span class="tot">valeurs pour 1 plat</span>
      }
    </div>
  `,
})
export class RecipeCard {
  protected readonly store = inject(PlannerStore);
  protected readonly codex = CODEX_ITEMS;
  protected readonly typeLabel = TYPE_LABEL;

  readonly r = input.required<RecipeRow>();
  readonly rank = input.required<number>();

  protected readonly n = computed(() => this.store.state().plan[this.r().slug] || 0);
  protected readonly hit = computed(() => new Set(this.store.state().ings));

  protected title(i: ComputedIngredient): string {
    const n = this.n();
    const farm = this.store.state().farmLvl;
    return ingTitle(i, (b) => this.store.engine.growTime(b, farm)) + (n ? ` · ${i.q * n} au total pour ${n} plats` : '');
  }

  protected per(v: string): string | null {
    return this.n() ? `Par plat : ${v}` : null;
  }

  /** + et − sur la carte sélectionnée */
  protected onKey(e: KeyboardEvent): void {
    if (e.target !== e.currentTarget) return;
    if (e.key === '+' || e.key === '=') {
      this.store.stepQty(this.r().slug, 1);
      e.preventDefault();
    } else if (e.key === '-') {
      this.store.stepQty(this.r().slug, -1);
      e.preventDefault();
    }
  }
}

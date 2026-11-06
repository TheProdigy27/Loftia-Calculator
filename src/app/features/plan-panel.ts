import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { PLAN_GROUPS, planText, plotsLabel } from '../core/plan-text';
import { PlannerStore } from '../state/planner.store';
import { AssetPipe, Dew, Icon, N0Pipe, PlotsControl, QtyControl, TimePipe } from '../ui/shared';

/** « Mon plan de cuisine » : panneau fixe à droite sur grand écran, tiroir sinon */
@Component({
  selector: 'app-plan-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AssetPipe, TimePipe, N0Pipe, Dew, Icon, QtyControl, PlotsControl],
  template: `
    <div class="drawer-head">
      <span class="sticker sm"><img src="assets/cooking-station.webp" alt="" /></span>
      <h2>Mon plan de cuisine</h2>
      @if (closable()) {
        <button type="button" class="xbtn" (click)="closed.emit()" aria-label="Fermer"><app-icon name="x" /></button>
      }
    </div>
    <div class="drawer-body">
      @let P = plan();
      @if (!P.count) {
        <div class="panel empty" style="flex-direction: column; text-align: center">
          <img src="assets/T_UI_NPC_Quest_Icons_Pebble.webp" alt="" />
          <div class="say"><b>Pebble</b><p>Ton plan est vide. Clique sur <b>Ajouter au plan</b> sous une recette, puis choisis combien de fois tu veux la cuisiner.</p></div>
        </div>
      } @else {
        <section class="psec">
          <div class="ptot">
            <div class="m hot"><div class="l">Profit</div><div class="v" [class.neg]="P.profit < 0"><app-dew />{{ P.profit | n0 }}</div></div>
            <div class="m"><div class="l">Temps</div><div class="v">@if (P.time) { {{ P.time | time }} } @else { <span class="na">—</span> }</div></div>
            <div class="m"><div class="l">Dew / h</div><div class="v">@if (P.dph === null) { <span class="na">—</span> } @else { <app-dew />{{ P.dph | n0 }} }</div></div>
            <div class="m"><div class="l">Énergie</div><div class="v"><img class="dew" src="assets/energy-cost.webp" alt="" />{{ P.energy }}</div></div>
          </div>
          <div class="panel plines">
            <div class="pline"><span>Vente totale ({{ P.count }} plat{{ P.count > 1 ? 's' : '' }})</span><b><app-dew />{{ P.value | n0 }}</b></div>
            <div class="pline">
              <span>Coût des ingrédients <span style="color: var(--muted)">({{ s().mode === 'cash' ? 'ce que ça coûte' : 'prix de revente' }})</span></span>
              <b><app-dew />{{ P.raw | n0 }}{{ P.approx ? '≈' : '' }}</b>
            </div>
            @if (P.saver > 0.5) {
              <div class="pline sub"><span>Ingredient Saver (économie moyenne)</span><b style="color: var(--teal)">−{{ P.saver | n0 }}</b></div>
            }
            <div class="pline big"><span>Profit</span><b><app-dew />{{ P.profit | n0 }}</b></div>
            <div class="pline sub">
              <span>À dépenser : graines {{ P.seedCost | n0 }}{{ P.shopCost ? ' + boutique ' + (P.shopCost | n0) : '' }}</span>
              <b><app-dew />{{ P.seedCost + P.shopCost | n0 }}</b>
            </div>
          </div>
        </section>

        <section class="psec">
          <h3>Parcelles<small>{{ P.seeds }} graine{{ P.seeds > 1 ? 's' : '' }} à planter</small></h3>
          <div class="panel prow2" style="justify-content: space-between; flex-wrap: wrap">
            <span class="pnote">Temps calculé avec {{ plotsText() }}{{ treeNote() }}</span>
            <app-plots />
          </div>
        </section>

        <section class="psec">
          <h3><img src="assets/T_UI_Attribute_Icons_Cook.webp" alt="" />Recettes<small>{{ P.entries.length }} recette{{ P.entries.length > 1 ? 's' : '' }}</small></h3>
          <div class="panel">
            @for (e of P.entries; track e.slug) {
              <div class="prow2">
                <img class="di" [src]="e.slug | asset" alt="" />
                <span class="nm"><b>{{ e.name }}</b><small>profit {{ e.tot.profit | n0 }} · coût {{ e.tot.cost | n0 }} · {{ e.tot.time ? (e.tot.time | time) : 'sans pousse' }}</small></span>
                <app-qty [slug]="e.slug" [sm]="true" />
                <button type="button" class="iconbtn" (click)="store.setQty(e.slug, 0)" [attr.aria-label]="'Retirer ' + e.name"><app-icon name="x" /></button>
              </div>
            }
          </div>
        </section>

        @for (g of groups(); track g.type) {
          <section class="psec">
            <h3><img [src]="g.icon | asset" alt="" />{{ g.title }}<small>{{ g.right }}</small></h3>
            <div class="panel">
              @for (i of g.list; track i.slug) {
                <div class="prow2" [title]="'Pour : ' + i.recipes.join(', ')">
                  <img class="di ing" [src]="i.slug | asset" alt="" />
                  <span class="nm">
                    <b>{{ i.name }}</b>
                    <small>
                      @switch (i.type) {
                        @case ('crop') { <img [src]="i.seed! | asset" alt="" style="width: 16px; height: 16px; vertical-align: -3px" /> {{ i.seedName }} · {{ i.cash }} Dew/u · pousse {{ i.t | time }} }
                        @case ('tree') { {{ i.seedName }} · {{ s().treesReady ? 'déjà planté' : 'un fruit toutes les ' + (growTime(i.grow) | time) }} }
                        @case ('shop') { {{ i.where }} · {{ i.cash }} Dew/u }
                        @default { {{ i.where }} }
                      }
                    </small>
                  </span>
                  <span class="q">×{{ i.qty }}</span>
                  @switch (i.type) {
                    @case ('crop') { <span class="c"><app-dew />{{ i.qty * (i.cash ?? 0) | n0 }}</span> }
                    @case ('shop') { <span class="c"><app-dew />{{ i.qty * (i.cash ?? 0) | n0 }}</span> }
                    @case ('craft') { <span class="c">—</span> }
                    @default { <span class="c free">gratuit</span> }
                  }
                </div>
              }
            </div>
          </section>
        }

        <div class="pactions">
          <button type="button" class="btn primary" (click)="copy()"><app-icon name="copy" /><span>{{ copyLabel() }}</span></button>
          <button type="button" class="btn" (click)="store.clearPlan()"><app-icon name="x" />Vider le plan</button>
        </div>
        <p class="pnote">Quantités exactes (sans compter la chance de Fruitful Harvest ou d'Ingredient Saver). Le coût et la vente incluent la moyenne des bonus de niveau.</p>
      }
    </div>
  `,
})
export class PlanPanel {
  protected readonly store = inject(PlannerStore);
  protected readonly s = this.store.state;
  protected readonly plan = this.store.planResult;

  readonly closable = input(false);
  readonly closed = output<void>();

  protected readonly copyLabel = signal('Copier la liste');

  protected readonly plotsText = computed(() => plotsLabel(this.store.plots()));
  protected readonly treeNote = computed(() =>
    this.plan().ings.some((i) => i.type === 'tree')
      ? this.s().treesReady
        ? ', arbres déjà plantés'
        : ', arbres comptés 1 cycle'
      : '',
  );

  protected readonly groups = computed(() => {
    const P = this.plan();
    return PLAN_GROUPS.map((g) => {
      const list = P.ings.filter((i) => i.type === g.type);
      const qty = list.reduce((a, i) => a + i.qty, 0);
      const right =
        g.type === 'crop'
          ? `${qty} graine${qty > 1 ? 's' : ''} · ${Math.round(P.seedCost).toLocaleString('fr-FR')} Dew`
          : g.type === 'shop'
            ? `${qty} article${qty > 1 ? 's' : ''} · ${Math.round(P.shopCost).toLocaleString('fr-FR')} Dew`
            : `${qty} au total`;
      return { ...g, list, right };
    }).filter((g) => g.list.length);
  });

  protected growTime(base: number): number {
    return this.store.engine.growTime(base, this.s().farmLvl);
  }

  protected async copy(): Promise<void> {
    const txt = planText(this.plan(), this.store.plots());
    let ok = false;
    try {
      await navigator.clipboard.writeText(txt);
      ok = true;
    } catch {
      ok = fallbackCopy(txt);
    }
    this.copyLabel.set(ok ? 'Copié !' : 'Copie impossible');
    setTimeout(() => this.copyLabel.set('Copier la liste'), 1600);
  }
}

function fallbackCopy(txt: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

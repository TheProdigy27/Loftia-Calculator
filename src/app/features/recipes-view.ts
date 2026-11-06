import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { ComputedRecipe } from '../core/types';
import { BaseSort, IncKey, OptKey, PlannerStore, SORTS, isBaseSort } from '../state/planner.store';
import { AssetPipe, CODEX_ITEMS, Dew, ExternalLink, Icon, N0Pipe, N1Pipe, QtyControl, TimePipe } from '../ui/shared';
import { RecipeCard, ingTitle } from './recipe-card';

interface Highlight {
  k: string;
  sort: BaseSort;
  r: ComputedRecipe | undefined;
}

@Component({
  selector: 'app-recipes-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AssetPipe, TimePipe, N0Pipe, N1Pipe, Dew, Icon, QtyControl, ExternalLink, RecipeCard],
  template: `
    @let st = s();
    <div class="sortbar">
      <button type="button" class="sortbtn" [attr.aria-pressed]="store.baseSort() === 'profit'" (click)="store.patch({ sort: 'profit' })">
        <span class="ico"><img src="assets/currency-dew.webp" alt="" /></span><span><b>Les plus rentables</b><small>Profit par plat</small></span>
      </button>
      <button type="button" class="sortbtn" [attr.aria-pressed]="store.baseSort() === 'time'" (click)="store.patch({ sort: 'time' })">
        <span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></svg></span>
        <span><b>Les plus rapides</b><small>Pousse des ingrédients incluse</small></span>
      </button>
      <button type="button" class="sortbtn" [attr.aria-pressed]="store.baseSort() === 'dph'" (click)="store.patch({ sort: 'dph' })">
        <span class="ico duo"><img src="assets/currency-dew.webp" alt="" /><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></svg></span>
        <span><b>Meilleur Dew / h</b><small>Profit ÷ temps de pousse</small></span>
      </button>
      <button type="button" class="sortbtn" [attr.aria-pressed]="store.baseSort() === 'dpe'" (click)="store.patch({ sort: 'dpe' })">
        <span class="ico"><img src="assets/energy-cost.webp" alt="" /></span><span><b>Dew par énergie</b><small>Profit ÷ énergie dépensée</small></span>
      </button>
    </div>

    <div class="filterbar">
      <span class="fl">Inclure :</span>
      @for (c of incChips; track c.key) {
        <button type="button" class="chip" [attr.aria-pressed]="st.inc[c.key]" (click)="store.toggleInc(c.key)">
          <span class="box"></span>
          @if (c.icon) { <img [src]="c.icon | asset" alt="" /> }
          {{ c.label }}
        </button>
      }
      @for (c of optChips; track c.key) {
        <button type="button" class="chip" [attr.aria-pressed]="st[c.key]" [attr.title]="c.title" (click)="store.toggleOpt(c.key)">
          <span class="box"></span>
          @if (c.icon) { <img [src]="c.icon | asset" alt="" /> }
          {{ c.label }}
        </button>
      }
      <span class="spacer"></span>
      <span class="count">{{ list().length }} recette{{ list().length > 1 ? 's' : '' }} sur {{ store.data.recipes.length }}</span>
      <div class="seg">
        <button type="button" [attr.aria-pressed]="st.view === 'cards'" (click)="store.setView('cards')">Cartes</button>
        <button type="button" [attr.aria-pressed]="st.view === 'table'" (click)="store.setView('table')">Tableau</button>
      </div>
    </div>

    <details class="panel ingpick" [open]="store.ingPickerOpen()" (toggle)="store.ingPickerOpen.set($any($event.target).open)">
      <summary>
        <app-icon name="caret" />
        Filtrer par ingrédient
        <span class="sel-mini">
          @for (slug of st.ings; track slug) {
            <img [src]="slug | asset" alt="" [title]="store.engine.ingredient(slug).name" />
          }
        </span>
        <span class="spacer"></span>
        @if (st.ings.length) {
          <button type="button" class="linkbtn" (click)="$event.preventDefault(); store.patch({ ings: [] })">Tout retirer</button>
        }
      </summary>
      <div class="ing-groups">
        @for (g of ingGroups; track g.t) {
          <div class="ing-group">
            <h3>{{ g.t }}</h3>
            <div class="ing-grid">
              @for (slug of g.list; track slug) {
                <button type="button" class="ingbtn" [attr.aria-pressed]="st.ings.includes(slug)" (click)="store.toggleIng(slug)"
                  [title]="store.engine.ingredient(slug).name + ' — ' + (store.engine.usedIn.get(slug)?.length ?? 0) + ' recette(s)'">
                  <img [src]="slug | asset" alt="" /><span>{{ store.engine.ingredient(slug).name }}</span>
                </button>
              }
            </div>
          </div>
        }
      </div>
    </details>

    @if (list().length) {
      <div class="highlights">
        @for (h of highlights(); track h.sort) {
          @if (h.r; as r) {
            <button type="button" class="panel hl" (click)="goto(h.sort)">
              <span class="art"><img [src]="r.slug | asset" alt="" /></span>
              <span>
                <span class="k">{{ h.k }}</span>
                <span class="n" style="display: block">{{ r.name }}</span>
                <span class="v" style="display: block">
                  @switch (h.sort) {
                    @case ('profit') { <app-dew />{{ r.profit }} de profit{{ r.time ? ' · ' + (r.time | time) : '' }} }
                    @case ('time') { <app-icon name="clock" cls="clock" />{{ r.time | time }} · <app-dew />{{ r.profit }} de profit }
                    @case ('dph') { <app-dew />{{ r.dph! | n0 }} / h · {{ r.time | time }} }
                  }
                </span>
              </span>
            </button>
          } @else {
            <div class="panel hl" style="opacity: 0.6"><div><div class="k">{{ h.k }}</div><div class="n">—</div></div></div>
          }
        }
      </div>
    }

    <div #results>
      @if (!list().length) {
        <div class="panel empty">
          <img src="assets/T_UI_NPC_Quest_Icons_Pebble.webp" alt="" />
          <div class="say"><b>Pebble</b><p>Aucune recette ne correspond. Retire un filtre ou un ingrédient, ou monte le niveau de station.</p></div>
        </div>
      } @else if (st.view === 'table') {
        <p class="pnote" style="margin: 0 0 8px">Valeurs pour 1 plat. Les totaux de ton plan sont dans <b>Mon plan</b>.</p>
        <div class="panel tablewrap">
          <table>
            <thead>
              <tr>
                <th class="num">#</th>
                @for (c of columns; track c.k) {
                  @if (c.k) {
                    <th [class.num]="c.num" (click)="store.sortByColumn(c.k)" data-k>
                      {{ c.label }}@if (arrow(c.k); as a) {<span class="arr">{{ a }}</span>}
                    </th>
                  } @else {
                    <th>{{ c.label }}</th>
                  }
                }
                <th title="Nombre de plats dans ton plan">Plan</th>
              </tr>
            </thead>
            <tbody>
              @let b = store.baseSort();
              @for (r of list(); track r.slug; let idx = $index) {
                <tr [class.inplan]="!!st.plan[r.slug]">
                  <td class="num" style="color: var(--muted); font-weight: 800">{{ idx + 1 }}</td>
                  <td>
                    <a class="cell" appExternal [href]="codex + r.slug">
                      <span class="ci"><img [src]="r.slug | asset" alt="" loading="lazy" /></span>{{ r.name }}
                      @if (r.pareto) { <span class="tag best">compromis</span> }
                    </a>
                  </td>
                  <td>
                    <div class="mini-ings">
                      @for (i of r.ings; track i.slug) {
                        <span class="mini-ing" [class.crit]="i.crit" [title]="title(i)"><img [src]="i.slug | asset" alt="" loading="lazy" /><i>{{ i.q }}</i></span>
                      }
                    </div>
                  </td>
                  <td class="num" [class.hot]="b === 'time'">{{ r.time ? (r.time | time) : '—' }}</td>
                  <td class="num" [class.hot]="b === 'cost'">{{ r.cost }}{{ r.approx ? '≈' : '' }}</td>
                  <td class="num" [class.hot]="b === 'value'">{{ r.value }}</td>
                  <td class="num strong" [class.hot]="b === 'profit'">{{ r.profit }}</td>
                  <td class="num" [class.hot]="b === 'dph'">{{ r.dph === null ? '—' : (r.dph | n0) }}</td>
                  <td class="num" [class.hot]="b === 'dpe'">{{ r.dpe | n1 }}</td>
                  <td class="num" [class.hot]="b === 'station'">{{ r.station }}</td>
                  <td>
                    @if (st.plan[r.slug]) {
                      <app-qty [slug]="r.slug" [sm]="true" />
                    } @else {
                      <button type="button" class="addbtn sm" (click)="store.setQty(r.slug, 1)"><app-icon name="plus" />Plan</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="grid">
          @for (r of list(); track r.slug; let idx = $index) {
            <app-recipe-card [r]="r" [rank]="idx" />
          }
        </div>
      }
    </div>
  `,
})
export class RecipesView {
  protected readonly store = inject(PlannerStore);
  protected readonly s = this.store.state;
  protected readonly list = this.store.recipes;
  protected readonly codex = CODEX_ITEMS;
  private readonly results = viewChild<ElementRef<HTMLElement>>('results');

  protected readonly incChips: { key: IncKey; label: string; icon?: string }[] = [
    { key: 'nocrop', label: 'Sans culture' },
    { key: 'gather', label: 'Cueillette' },
    { key: 'shop', label: 'Boutique', icon: 'egg' },
    { key: 'craft', label: 'Miel', icon: 'honey' },
  ];
  protected readonly optChips: { key: OptKey; label: string; icon?: string; title?: string }[] = [
    { key: 'treesReady', label: 'Arbres déjà plantés', icon: 'coconut', title: 'Si tes arbres sont déjà plantés, leurs fruits ne comptent pas dans le temps' },
    { key: 'paretoOnly', label: 'Meilleurs compromis', title: "Recettes qu'aucune autre ne bat à la fois en profit et en temps" },
    { key: 'planOnly', label: 'Mon plan', icon: 'cooking-station' },
  ];

  protected readonly columns: { label: string; k?: string; num?: boolean }[] = [
    { label: 'Plat', k: 'name' },
    { label: 'Ingrédients' },
    { label: 'Temps', k: 'time', num: true },
    { label: 'Coût', k: 'cost', num: true },
    { label: 'Vente', k: 'value', num: true },
    { label: 'Profit', k: 'profit', num: true },
    { label: 'Dew/h', k: 'dph', num: true },
    { label: 'Dew/⚡', k: 'dpe', num: true },
    { label: 'Station', k: 'station', num: true },
  ];

  protected readonly ingGroups = (() => {
    const d = this.store.data;
    const used = this.store.engine.usedIn;
    return [
      { t: 'Cultures', list: d.crops.filter((c) => c.seedPrice !== null && used.has(c.slug)).map((c) => c.slug) },
      { t: 'Arbres', list: d.crops.filter((c) => c.seedPrice === null).map((c) => c.slug) },
      { t: 'Cueillette', list: Object.keys(d.extras).filter((k) => d.extras[k].type === 'gather') },
      { t: 'Boutique & ruche', list: Object.keys(d.extras).filter((k) => d.extras[k].type !== 'gather') },
    ];
  })();

  protected readonly highlights = computed<Highlight[]>(() => {
    const list = this.list();
    const withCrop = list.filter((r) => r.time > 0 && r.profit > 0);
    return [
      { k: 'Le plus rentable', sort: 'profit', r: [...list].sort(SORTS.profit)[0] },
      { k: 'Le plus rapide (avec pousse)', sort: 'time', r: [...withCrop].sort(SORTS.time)[0] },
      { k: 'Meilleur Dew / heure', sort: 'dph', r: [...withCrop].sort(SORTS.dph)[0] },
    ];
  });

  protected arrow(k: string): string | null {
    const { sort, dir } = this.s();
    if (sort === k && isBaseSort(k)) return k === 'time' ? '▲' : '▼';
    if (sort === k || sort === `${k}_`) return dir > 0 ? '▲' : '▼';
    return null;
  }

  protected title(i: Parameters<typeof ingTitle>[0]): string {
    const farm = this.s().farmLvl;
    return ingTitle(i, (b) => this.store.engine.growTime(b, farm));
  }

  protected goto(sort: BaseSort): void {
    this.store.patch({ sort });
    this.results()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

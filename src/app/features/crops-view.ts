import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { ComputedCrop } from '../core/types';
import { CropSortKey, PlannerStore } from '../state/planner.store';
import { AssetPipe, CODEX_ITEMS, ExternalLink, N0Pipe, TimePipe } from '../ui/shared';
import { TYPE_LABEL } from './recipe-card';

@Component({
  selector: 'app-crops-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AssetPipe, TimePipe, N0Pipe, ExternalLink],
  template: `
    @let st = store.state();
    <div class="panel tablewrap">
      <table>
        <thead>
          <tr>
            @for (c of columns; track c.k) {
              <th [class.num]="c.num" [attr.title]="c.tip ?? null" (click)="store.sortCrops(c.k)" data-k>
                {{ c.label }}@if (st.cropSort === c.k) {<span class="arr">{{ st.cropDir > 0 ? '▲' : '▼' }}</span>}
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.slug) {
            @let uses = usedIn(r.slug);
            <tr>
              <td><a class="cell" appExternal [href]="codex + r.seed"><span class="ci"><img [src]="r.seed | asset" alt="" loading="lazy" /></span>{{ r.seedName }}</a></td>
              <td><a class="cell" appExternal [href]="codex + r.slug"><span class="ci"><img [src]="r.slug | asset" alt="" loading="lazy" /></span>{{ r.name }}</a></td>
              <td class="num" [class.hot]="st.cropSort === 'grow'">{{ r.grow | time }}</td>
              <td class="num" [class.hot]="st.cropSort === 'water'">{{ r.water | time }}</td>
              <td class="num" [class.hot]="st.cropSort === 'cost'">{{ r.cost === null ? '—' : r.cost }}</td>
              <td class="num" [class.hot]="st.cropSort === 'value'">{{ r.value }}</td>
              <td class="num strong" [class.hot]="st.cropSort === 'profit'">{{ r.profit === null ? '—' : r.profit }}</td>
              <td class="num strong" [class.hot]="st.cropSort === 'dph'">{{ r.dph === null ? '—' : (r.dph | n0) }}</td>
              <td>
                @if (uses.length) {
                  <div class="dish-stack">
                    <button type="button" (click)="store.showRecipesWith(r.slug)" [title]="'Voir les ' + uses.length + ' recettes'">
                      @for (s of uses.slice(0, 5); track s) {
                        <img [src]="s | asset" alt="" [title]="recipeName(s)" loading="lazy" />
                      }
                      <span>{{ uses.length }} recette{{ uses.length > 1 ? 's' : '' }} ›</span>
                    </button>
                  </div>
                } @else {
                  <span style="color: #9aa79f; font-size: 13px">aucune</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <div class="section-head">
      <h2>Autres ingrédients</h2>
      <p>Cueillette, boutique et ruche : clique pour voir les recettes qui les utilisent.</p>
    </div>
    <div class="extras">
      @for (x of extras(); track x.slug) {
        <button type="button" class="panel xcard" (click)="store.showRecipesWith(x.slug)">
          <img [src]="x.slug | asset" alt="" loading="lazy" />
          <span>
            <b>{{ x.name }}</b>
            <small>{{ x.label }} · {{ x.where }}{{ x.price }}</small>
            <small style="color: var(--teal); font-weight: 800">{{ x.uses }} recette{{ x.uses > 1 ? 's' : '' }} ›</small>
          </span>
        </button>
      }
    </div>
  `,
})
export class CropsView {
  protected readonly store = inject(PlannerStore);
  protected readonly codex = CODEX_ITEMS;

  protected readonly columns: { label: string; k: CropSortKey; num?: boolean; tip?: string }[] = [
    { label: 'Graine', k: 'seedName' },
    { label: 'Récolte', k: 'name' },
    { label: 'Pousse', k: 'grow', num: true },
    { label: 'Arrosage', k: 'water', num: true, tip: 'Durée pendant laquelle un arrosage tient' },
    { label: 'Coût', k: 'cost', num: true },
    { label: 'Vente', k: 'value', num: true },
    { label: 'Profit', k: 'profit', num: true },
    { label: 'Dew / h', k: 'dph', num: true },
    { label: 'Utilisée dans', k: 'uses' },
  ];

  protected usedIn(slug: string): string[] {
    return this.store.engine.usedIn.get(slug) ?? [];
  }

  protected recipeName(slug: string): string {
    return this.store.engine.recipeMap.get(slug)?.name ?? slug;
  }

  protected readonly rows = computed(() => {
    const { farmLvl, cropSort: k, cropDir: d } = this.store.state();
    const q = this.store.q().trim().toLowerCase();
    let rows = this.store.data.crops.map((c) => this.store.engine.computeCrop(c.slug, { farmLvl }));
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.seedName.toLowerCase().includes(q));
    const val = (r: ComputedCrop) => (k === 'uses' ? this.usedIn(r.slug).length : r[k]);
    return rows.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === 'string') return d * x.localeCompare(y as string);
      return d * (x - (y as number));
    });
  });

  protected readonly extras = computed(() => {
    const q = this.store.q().trim().toLowerCase();
    const ex = this.store.data.extras;
    return Object.keys(ex)
      .filter((s) => !q || ex[s].name.toLowerCase().includes(q))
      .map((slug) => {
        const e = ex[slug];
        return {
          slug,
          name: e.name,
          where: e.where,
          label: TYPE_LABEL[e.type],
          price: e.type === 'shop' ? ` · ${e.cash} Dew` : e.type === 'craft' ? ` · revente ${e.sale} Dew` : '',
          uses: this.usedIn(slug).length,
        };
      });
  });
}

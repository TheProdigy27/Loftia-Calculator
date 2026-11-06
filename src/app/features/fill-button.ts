import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ComputedRecipe } from '../core/types';
import { PlannerStore, PlotFill } from '../state/planner.store';

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

/** Infobulle du bouton « Remplir mes parcelles » */
export function fillTitle(
  f: PlotFill,
  r: Pick<ComputedRecipe, 'ings'>,
  current: number,
  defaultPlots: number,
): string {
  if (!f.plots)
    return `Remplir mes parcelles : passe en parcelles limitées (${defaultPlots}) et met le maximum de plats qui y tient. Un plat prend ${plural(f.per, 'parcelle')}.`;
  const taken = f.others
    ? ` (${f.others} déjà prise${f.others > 1 ? 's' : ''} par le reste du plan)`
    : '';
  if (f.n < 1)
    return `Un plat prend ${plural(f.per, 'parcelle')}, il n'en reste que ${f.free} de libre${f.free > 1 ? 's' : ''} sur ${f.plots}${taken}.`;
  const seeds = r.ings
    .filter((i) => i.type === 'crop')
    .map((i) => `${i.q * f.n} ${i.seedName}`)
    .join(', ');
  return (
    `${current === f.n ? 'Parcelles remplies' : 'Remplir mes parcelles'} : ${plural(f.n, 'plat')} sur ${plural(f.free, 'parcelle')} libre${f.free > 1 ? 's' : ''}${taken}` +
    ` → à planter : ${seeds}` +
    (f.left ? ` · ${plural(f.left, 'parcelle')} restera vide${f.left > 1 ? 's' : ''}` : '')
  );
}

/** Règle le nombre de plats pour remplir les parcelles libres (une graine par parcelle) */
@Component({
  selector: 'app-fill-btn',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:contents' },
  template: `
    @if (fill(); as f) {
      <button
        type="button"
        class="fillbtn"
        [class.sm]="compact()"
        [class.done]="done()"
        [attr.aria-disabled]="f.plots > 0 && f.n < 1"
        [title]="title()"
        [attr.aria-label]="title()"
        (click)="onClick()"
      >
        <img src="assets/T_UI_Attribute_Icons_Farm.webp" alt="" />
        @if (!compact()) {
          <span>{{ done() ? 'Parcelles remplies' : 'Remplir mes parcelles' }}</span>
        }
      </button>
    }
  `,
})
export class FillButton {
  protected readonly store = inject(PlannerStore);

  readonly r = input.required<ComputedRecipe>();
  /** Icône seule */
  readonly compact = input(false);

  protected readonly fill = computed(() => this.store.plotFill(this.r().slug));
  private readonly current = computed(() => this.store.state().plan[this.r().slug] || 0);
  protected readonly done = computed(() => {
    const f = this.fill();
    return !!f && f.n > 0 && this.current() === f.n;
  });
  protected readonly title = computed(() => {
    const f = this.fill();
    return f ? fillTitle(f, this.r(), this.current(), this.store.state().plots) : '';
  });

  protected onClick(): void {
    if (!this.store.state().plotsLimited) this.store.patch({ plotsLimited: true });
    this.store.fillPlots(this.r().slug);
  }
}

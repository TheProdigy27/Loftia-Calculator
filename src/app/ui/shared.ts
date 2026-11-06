/* Petits éléments partagés : pipes, icônes, liens externes, contrôles de quantité et de parcelles. */
import { ChangeDetectionStrategy, Component, Directive, HostListener, Pipe, PipeTransform, inject, input } from '@angular/core';
import { fmtTime, n0, n1 } from '../core/format';
import { PlannerStore } from '../state/planner.store';

export const CODEX_ITEMS = 'https://loftiacodex.com/items/';

/** Icône du jeu : assets/<slug>.webp */
@Pipe({ name: 'asset' })
export class AssetPipe implements PipeTransform {
  transform(slug: string): string {
    return `assets/${slug}.webp`;
  }
}

@Pipe({ name: 'time' })
export class TimePipe implements PipeTransform {
  transform(m: number | null | undefined): string {
    return fmtTime(m);
  }
}

@Pipe({ name: 'n0' })
export class N0Pipe implements PipeTransform {
  transform(x: number): string {
    return n0(x);
  }
}

@Pipe({ name: 'n1' })
export class N1Pipe implements PipeTransform {
  transform(x: number): string {
    return n1(x);
  }
}

@Pipe({ name: 'plural' })
export class PluralPipe implements PipeTransform {
  /** 2 | plural:'plat' → « 2 plats » */
  transform(n: number, word: string): string {
    return `${n} ${word}${n > 1 ? 's' : ''}`;
  }
}

export type IconName = 'minus' | 'plus' | 'x' | 'clock' | 'search' | 'copy' | 'caret' | 'refresh' | 'bell' | 'bell-off';

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:contents' },
  template: `
    @switch (name()) {
      @case ('minus') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 12h12" /></svg>
      }
      @case ('plus') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 12h12M12 6v12" /></svg>
      }
      @case ('x') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
      }
      @case ('clock') {
        <svg [class]="cls()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></svg>
      }
      @case ('search') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>
      }
      @case ('copy') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>
      }
      @case ('refresh') {
        <svg [class]="cls()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.6-4.5M4 5v4h4" /><path d="M4 13a8 8 0 0 0 14.6 4.5M20 19v-4h-4" /></svg>
      }
      @case ('bell') {
        <svg [class]="cls()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
      }
      @case ('bell-off') {
        <svg [class]="cls()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /><path d="M4 4l16 16" /></svg>
      }
      @case ('caret') {
        <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6" /></svg>
      }
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly cls = input('');
}

/** Image Dew en ligne (monnaie du jeu) */
@Component({
  selector: 'app-dew',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:contents' },
  template: `<img class="dew" src="assets/currency-dew.webp" alt="" />`,
})
export class Dew {}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Liens vers le Codex : dans l'appli Tauri, ils s'ouvrent dans le navigateur par défaut
 * au lieu de remplacer la fenêtre ; dans un navigateur, dans un nouvel onglet.
 */
@Directive({
  selector: 'a[appExternal]',
  host: { target: '_blank', rel: 'noopener' },
})
export class ExternalLink {
  @HostListener('click', ['$event'])
  async onClick(e: MouseEvent): Promise<void> {
    if (!isTauri()) return;
    const href = (e.currentTarget as HTMLAnchorElement).href;
    e.preventDefault();
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(href);
  }
}

/** − [n] + pour le nombre de plats d'une recette du plan */
@Component({
  selector: 'app-qty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { style: 'display:contents' },
  template: `
    <span class="qty-ctl" [class.sm]="sm()">
      <button type="button" (click)="store.stepQty(slug(), -1)" aria-label="Une de moins"><app-icon name="minus" /></button>
      <input
        type="number" min="1" max="999" inputmode="numeric" aria-label="Nombre de plats"
        [value]="store.qty(slug())"
        (change)="store.setQty(slug(), $any($event.target).value)"
        (keydown.enter)="$any($event.target).blur()"
      />
      <button type="button" (click)="store.stepQty(slug(), 1)" aria-label="Une de plus"><app-icon name="plus" /></button>
    </span>
  `,
})
export class QtyControl {
  protected readonly store = inject(PlannerStore);
  readonly slug = input.required<string>();
  readonly sm = input(false);
}

/** Parcelles illimitées / limitées + nombre */
@Component({
  selector: 'app-plots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { class: 'plots-ctl' },
  template: `
    <span class="seg">
      <button type="button" [attr.aria-pressed]="!s().plotsLimited" (click)="store.patch({ plotsLimited: false })">Illimitées</button>
      <button type="button" [attr.aria-pressed]="s().plotsLimited" (click)="store.patch({ plotsLimited: true })">Limitées</button>
    </span>
    @if (s().plotsLimited) {
      <span class="qty-ctl sm">
        <button type="button" (click)="store.setPlots(s().plots - 1)" aria-label="Une parcelle de moins"><app-icon name="minus" /></button>
        <input
          type="number" min="1" max="99" inputmode="numeric" aria-label="Nombre de parcelles"
          [value]="s().plots"
          (change)="store.setPlots($any($event.target).value)"
          (keydown.enter)="$any($event.target).blur()"
        />
        <button type="button" (click)="store.setPlots(s().plots + 1)" aria-label="Une parcelle de plus"><app-icon name="plus" /></button>
      </span>
    }
  `,
})
export class PlotsControl {
  protected readonly store = inject(PlannerStore);
  protected readonly s = this.store.state;
}

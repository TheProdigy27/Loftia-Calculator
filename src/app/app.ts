import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { Controls } from './features/controls';
import { CropsView } from './features/crops-view';
import { PlanPanel } from './features/plan-panel';
import { RecipesView } from './features/recipes-view';
import { PlannerStore, Tab } from './state/planner.store';
import { AssetPipe, Dew, ExternalLink, Icon, N0Pipe, TimePipe } from './ui/shared';

/** Largeur à partir de laquelle « Mon plan » reste ouvert à droite des recettes */
const WIDE_QUERY = '(min-width: 1180px)';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AssetPipe, TimePipe, N0Pipe, Dew, Icon, ExternalLink, Controls, RecipesView, CropsView, PlanPanel],
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(PlannerStore);
  protected readonly s = this.store.state;
  protected readonly plan = this.store.planResult;

  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('search');

  protected readonly wide = signal(false);
  protected readonly drawerOpen = signal(false);

  protected readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'recettes', label: 'Recettes', icon: 'T_UI_Attribute_Icons_Cook' },
    { id: 'cultures', label: 'Cultures', icon: 'T_UI_Attribute_Icons_Farm' },
  ];

  protected readonly extracted = new Date(this.store.data.extracted).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  protected readonly page = computed(() =>
    this.s().tab === 'recettes'
      ? {
          title: 'Planificateur de cuisine',
          crumb: 'Cuisine & cultures',
          icon: 'T_UI_Attribute_Icons_Cook',
          subtitle:
            'Toutes les recettes avec le temps de pousse de leurs ingrédients : trouve les plus rentables, ou celles qui sont prêtes le plus vite.',
        }
      : {
          title: 'Cultures',
          crumb: 'Cultures',
          icon: 'T_UI_Attribute_Icons_Farm',
          subtitle: 'Graines, temps de pousse et rentabilité de chaque culture, avec les recettes où elles servent.',
        },
  );

  constructor() {
    if (typeof matchMedia !== 'undefined') {
      const mq = matchMedia(WIDE_QUERY);
      this.wide.set(mq.matches);
      mq.addEventListener('change', (e) => {
        this.wide.set(e.matches);
        if (e.matches) this.drawerOpen.set(false);
      });
    }
  }

  protected setTab(tab: Tab): void {
    this.store.patch({ tab });
    window.scrollTo(0, 0);
  }

  protected onSearch(v: string): void {
    this.store.q.set(v);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    const el = this.search().nativeElement;
    const inField = e.target instanceof Element && e.target.matches('input, textarea, select');
    if ((e.key === 'f' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !inField)) {
      e.preventDefault();
      el.focus();
      el.select();
    } else if (e.key === 'Escape') {
      if (document.activeElement === el) {
        el.value = '';
        this.store.q.set('');
        el.blur();
      } else if (this.drawerOpen()) {
        this.drawerOpen.set(false);
      }
    }
  }
}

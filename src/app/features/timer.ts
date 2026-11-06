/* Minuteur du plan : carte dans « Mon plan », pastille de la barre du haut et notifications. Logique dans state/timer.store.ts. */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import {
  TimerStep,
  alertTitle,
  fmtClock,
  fmtCountdown,
  nextLabel,
  stepVerb,
} from '../core/timer-plan';
import { TimerAlert, TimerStore } from '../state/timer.store';
import { AssetPipe, Icon, TimePipe } from '../ui/shared';

const WATER_ICON = 'T_UI_Perks_Farm_WetterCrops';
const HARVEST_ICON = 'T_UI_Perks_Farm_DoubleHarvest';
/** Rappels listés sous le prochain */
const LATER_MAX = 4;

/** Pastilles « Arrose Tomate ×3 » */
@Component({
  selector: 'app-timer-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AssetPipe],
  host: { class: 'tsteps' },
  template: `
    @for (s of steps(); track s.kind + s.slug) {
      <span class="tstep" [class]="s.kind">
        <img [src]="s.slug | asset" alt="" />{{ bare() ? '' : verb(s) + ' '
        }}<b>{{ s.name }}</b> ×{{ s.qty }}
      </span>
    }
  `,
})
export class TimerSteps {
  readonly steps = input.required<TimerStep[]>();
  /** Sans verbe (« Rice ×3 »), quand le libellé est déjà à côté */
  readonly bare = input(false);
  protected readonly verb = stepVerb;
}

/** Section « Minuteur » de Mon plan : lancer, suivre, arrêter */
@Component({
  selector: 'app-timer-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, TimePipe, TimerSteps],
  host: { style: 'display:contents' },
  template: `
    @let T = t.session();
    @let pv = t.preview();
    @if (T || pv.events.length) {
      <section class="psec" id="timer">
        <h3>
          <app-icon name="clock" cls="h3ico" />Minuteur
          @if (T) {
            <small>{{ t.running() ? 'en cours' : 'terminé' }}</small>
          }
        </h3>
        @if (!T) {
          <div class="panel tcard">
            @if (pv.first.length) {
              <div class="tfirst">
                <span class="tl">{{ staggered() ? 'Plante d’abord' : 'Plante' }}</span>
                <app-timer-steps [steps]="pv.first" [bare]="true" />
              </div>
            }
            <p class="pnote">
              Plante, arrose, puis lance le minuteur : il sonne à chaque arrosage{{
                staggered() ? ', te dit quoi replanter' : ''
              }}
              et quand c'est prêt à récolter.
            </p>
            <div class="tgo">
              <span class="pnote">
                <b>{{ pv.events.length }}</b> rappel{{ pv.events.length > 1 ? 's' : '' }} · tout
                récolté dans <b>{{ pv.total | time }}</b>
              </span>
              <button type="button" class="btn primary" (click)="start()">
                <app-icon name="clock" />J'ai planté, c'est parti
              </button>
            </div>
          </div>
        } @else {
          <div class="panel tcard on">
            @if (t.next(); as n) {
              <div class="tnext">
                <div
                  class="cd"
                  role="timer"
                  [attr.aria-label]="'Prochain rappel dans ' + countdown()"
                >
                  {{ countdown() }}
                </div>
                <div class="what">
                  <small>Prochain rappel à {{ clock(n.due) }}</small>
                  <app-timer-steps [steps]="n.steps" />
                </div>
              </div>
              <div class="tprog" aria-hidden="true">
                <span [style.width.%]="t.progress() * 100"></span>
              </div>
              <p class="pnote">
                Tout est récolté vers <b>{{ clock(t.endsAt()!) }}</b> ·
                {{ t.upcoming().length }} rappel{{ t.upcoming().length > 1 ? 's' : '' }} restant{{
                  t.upcoming().length > 1 ? 's' : ''
                }}
              </p>
              @if (later().length) {
                <ul class="tlist">
                  @for (e of later(); track e.at) {
                    <li>
                      <span class="tm">{{ clock(e.due) }}</span
                      ><app-timer-steps [steps]="e.steps" />
                    </li>
                  }
                  @if (hidden() > 0) {
                    <li class="more">
                      et {{ hidden() }} autre{{ hidden() > 1 ? 's' : '' }} rappel{{
                        hidden() > 1 ? 's' : ''
                      }}
                    </li>
                  }
                </ul>
              }
            } @else {
              <div class="tdone">
                <img [src]="'assets/' + harvestIcon + '.webp'" alt="" />
                <span
                  ><b>Tout est récolté !</b
                  ><span class="pnote">Direction la station de cuisine.</span></span
                >
              </div>
            }
            <div class="tacts">
              <button
                type="button"
                class="btn"
                [attr.aria-pressed]="t.sound()"
                (click)="t.toggleSound()"
              >
                <app-icon [name]="t.sound() ? 'bell' : 'bell-off'" />{{
                  t.sound() ? 'Son activé' : 'Son coupé'
                }}
              </button>
              @if (!t.running() && pv.events.length) {
                <button type="button" class="btn primary" (click)="start()">
                  <app-icon name="clock" />Relancer
                </button>
              }
              <button type="button" class="btn" (click)="t.stop()">
                <app-icon name="x" />{{ t.running() ? 'Arrêter' : 'Terminer' }}
              </button>
            </div>
            <p class="pnote">Lancé à {{ clock(T.startedAt) }} pour {{ recipesText() }}.</p>
          </div>
        }
      </section>
    }
  `,
})
export class TimerCard {
  protected readonly t = inject(TimerStore);
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly harvestIcon = HARVEST_ICON;
  protected readonly clock = fmtClock;

  /** Plus de graines que de parcelles : il faudra replanter en cours de route */
  protected readonly staggered = computed(() =>
    this.t.preview().events.some((e) => e.steps.some((s) => s.kind === 'plant')),
  );
  protected readonly countdown = computed(() =>
    fmtCountdown((this.t.next()?.due ?? 0) - this.t.now()),
  );
  protected readonly later = computed(() => this.t.upcoming().slice(1, 1 + LATER_MAX));
  protected readonly hidden = computed(() => this.t.upcoming().length - 1 - this.later().length);
  protected readonly recipesText = computed(() =>
    (this.t.session()?.recipes ?? []).map((r) => `${r.n}× ${r.name}`).join(', '),
  );

  protected start(): void {
    // Le minuteur lancé passe en tête de Mon plan (cette carte est remplacée) : on y remonte
    const body = this.host.nativeElement.closest('.drawer-body');
    this.t.start();
    setTimeout(() =>
      body?.querySelector('#timer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }
}

/** Pastille de la barre du haut : temps avant le prochain rappel, clic pour ouvrir le minuteur */
@Component({
  selector: 'app-timer-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { style: 'display:contents' },
  template: `
    @if (t.session()) {
      <button
        type="button"
        class="tchip"
        [class.ring]="t.alerts().length"
        [class.done]="!t.running()"
        [title]="title()"
        (click)="open.emit()"
      >
        <app-icon [name]="t.alerts().length ? 'bell' : 'clock'" />
        @if (t.next(); as n) {
          <span class="cd">{{ countdown() }}</span
          ><span class="lbl">{{ label() }}</span>
        } @else {
          <span>Tout est récolté</span>
        }
      </button>
    }
  `,
})
export class TimerChip {
  protected readonly t = inject(TimerStore);
  readonly open = output<void>();

  protected readonly countdown = computed(() =>
    fmtCountdown((this.t.next()?.due ?? 0) - this.t.now()),
  );
  protected readonly label = computed(() => nextLabel(this.t.next()?.steps ?? []));
  protected readonly title = computed(() => {
    const n = this.t.next();
    return n ? `Minuteur : ${this.label().toLowerCase()} à ${fmtClock(n.due)}` : 'Minuteur terminé';
  });
}

/** Notifications dans l'appli : restent affichées jusqu'à « C'est fait » */
@Component({
  selector: 'app-timer-alerts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AssetPipe, TimerSteps],
  host: { class: 'talerts', 'aria-live': 'assertive' },
  template: `
    @for (a of t.alerts(); track a.id) {
      <div class="talert" [class.harvest]="isHarvest(a)" role="alert">
        <img class="ico" [src]="(isHarvest(a) ? harvestIcon : waterIcon) | asset" alt="" />
        <div class="body">
          @if (a.late && a.count > 1) {
            <b>Tu as manqué {{ a.count }} rappels</b>
            <small>Prévus entre {{ clock(a.from) }} et {{ clock(a.due) }}</small>
          } @else {
            <b>{{ title(a) }}</b>
            @if (a.late) {
              <small>Prévu à {{ clock(a.due) }}</small>
            }
          }
          <app-timer-steps [steps]="a.steps" />
        </div>
        <button type="button" class="btn primary" (click)="t.dismiss(a.id)">C'est fait</button>
      </div>
    }
  `,
})
export class TimerAlerts {
  protected readonly t = inject(TimerStore);
  protected readonly waterIcon = WATER_ICON;
  protected readonly harvestIcon = HARVEST_ICON;
  protected readonly clock = fmtClock;
  protected readonly title = (a: TimerAlert) => alertTitle(a.steps);
  protected readonly isHarvest = (a: TimerAlert) => a.steps.some((s) => s.kind === 'harvest');
}

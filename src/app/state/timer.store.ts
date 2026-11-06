/*
 * Minuteur du plan de cuisine : « J'ai planté » lance le calendrier (core/timer-plan.ts), puis l'appli
 * sonne et affiche une notification à chaque arrosage, replantation et récolte.
 * Le calendrier est figé au lancement et sauvegardé : il survit à une fermeture de l'appli
 * (les rappels manqués entre-temps sont annoncés en une fois au redémarrage).
 */
import {
  Injectable,
  InjectionToken,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';
import {
  TimerEvent,
  TimerSchedule,
  TimerStep,
  buildSchedule,
  mergeSteps,
} from '../core/timer-plan';
import { PlannerStore } from './planner.store';

export type ChimeKind = 'water' | 'harvest';

/** Son et signal Windows, remplacés dans les tests */
export interface AlertBackend {
  /** À appeler pendant un clic : le navigateur n'autorise le son qu'après une action de l'utilisateur */
  unlock(): void;
  play(kind: ChimeKind): void;
  /** Fait clignoter le bouton de l'appli dans la barre des tâches si la fenêtre n'a pas le focus */
  attention(): void;
}

export const TIMER_ALERTS = new InjectionToken<AlertBackend>('TIMER_ALERTS', {
  factory: () => webAlerts(),
});

export interface TimerSession {
  /** Heure du lancement (ms) */
  startedAt: number;
  schedule: TimerSchedule;
  /** Recettes du plan au lancement */
  recipes: { slug: string; name: string; n: number }[];
  /** Nombre de rappels déjà annoncés */
  fired: number;
}

export interface TimerAlert {
  id: number;
  /** Heure prévue (ms) du premier et du dernier rappel regroupés */
  from: number;
  due: number;
  /** Nombre de rappels regroupés (plus d'un si l'appli était fermée ou en veille) */
  count: number;
  steps: TimerStep[];
  /** Annoncé plus d'une minute après l'heure prévue */
  late: boolean;
}

export interface DueEvent extends TimerEvent {
  /** Heure prévue (ms) */
  due: number;
}

export const MIN_MS = 60_000;
export const TICK_MS = 1_000;
export const LATE_MS = 60_000;
/** Notifications affichées en même temps au plus */
export const MAX_ALERTS = 3;

const STORE_KEY = 'loftia-timer-v1';

interface Saved {
  session: TimerSession | null;
  sound: boolean;
}

export function loadTimer(storage: Pick<Storage, 'getItem'> | null): Saved {
  const out: Saved = { session: null, sound: true };
  try {
    const saved = JSON.parse(storage?.getItem(STORE_KEY) ?? 'null') as Partial<Saved> | null;
    if (!saved || typeof saved !== 'object') return out;
    if (typeof saved.sound === 'boolean') out.sound = saved.sound;
    const s = saved.session;
    if (
      s &&
      typeof s.startedAt === 'number' &&
      typeof s.fired === 'number' &&
      Array.isArray(s.schedule?.events) &&
      Array.isArray(s.schedule?.first) &&
      typeof s.schedule?.total === 'number' &&
      Array.isArray(s.recipes)
    ) {
      out.session = s;
    }
  } catch {
    /* sauvegarde illisible : pas de minuteur */
  }
  return out;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class TimerStore {
  private readonly planner = inject(PlannerStore);
  private readonly backend = inject(TIMER_ALERTS);
  private nextId = 1;

  private readonly saved = loadTimer(safeStorage());
  readonly session = signal<TimerSession | null>(this.saved.session);
  readonly sound = signal(this.saved.sound);
  /** Notifications dans l'appli, la plus récente en dernier */
  readonly alerts = signal<TimerAlert[]>([]);
  /** Horloge, mise à jour chaque seconde tant qu'un minuteur tourne */
  readonly now = signal(Date.now());

  /** Calendrier du plan actuel si on le lançait maintenant */
  readonly preview = computed(() => {
    const { engine } = this.planner;
    const farmLvl = this.planner.state().farmLvl;
    return buildSchedule(this.planner.planResult(), this.planner.plots(), (slug) => {
      const c = engine.cropMap.get(slug);
      return c ? engine.waterTime(c.water, farmLvl) : 0;
    });
  });

  readonly events = computed<DueEvent[]>(() => {
    const s = this.session();
    return s ? s.schedule.events.map((e) => ({ ...e, due: s.startedAt + e.at * MIN_MS })) : [];
  });
  /** Rappels à venir, le prochain en premier */
  readonly upcoming = computed(() => this.events().slice(this.session()?.fired ?? 0));
  readonly next = computed<DueEvent | null>(() => this.upcoming()[0] ?? null);
  /** Un minuteur est lancé et il reste des rappels */
  readonly running = computed(() => !!this.session() && !!this.next());
  readonly endsAt = computed(() => {
    const s = this.session();
    return s ? s.startedAt + s.schedule.total * MIN_MS : null;
  });
  /** Avancement entre 0 et 1 */
  readonly progress = computed(() => {
    const s = this.session();
    if (!s || !s.schedule.total) return 0;
    return Math.min(1, Math.max(0, (this.now() - s.startedAt) / (s.schedule.total * MIN_MS)));
  });

  constructor() {
    effect(() => {
      const data: Saved = { session: this.session(), sound: this.sound() };
      try {
        safeStorage()?.setItem(STORE_KEY, JSON.stringify(data));
      } catch {
        /* stockage indisponible : le minuteur marche jusqu'à la fermeture */
      }
    });

    // Une horloge par seconde, seulement tant qu'il reste des rappels
    effect((onCleanup) => {
      if (!this.running()) return;
      untracked(() => this.tick());
      const id = setInterval(() => this.tick(), TICK_MS);
      // Au retour sur l'appli, annonce tout de suite un rappel arrivé pendant qu'elle était en arrière-plan
      const onVisible = () => this.tick();
      document.addEventListener('visibilitychange', onVisible);
      onCleanup(() => {
        clearInterval(id);
        document.removeEventListener('visibilitychange', onVisible);
      });
    });
  }

  /** « J'ai planté » : lance le minuteur sur le plan actuel */
  start(): void {
    const schedule = this.preview();
    if (!schedule.events.length) return;
    this.backend.unlock();
    const now = Date.now();
    this.now.set(now);
    this.alerts.set([]);
    this.session.set({
      startedAt: now,
      schedule,
      recipes: this.planner
        .planResult()
        .entries.map((e) => ({ slug: e.slug, name: e.name, n: e.tot.n })),
      fired: 0,
    });
  }

  stop(): void {
    this.session.set(null);
    this.alerts.set([]);
  }

  dismiss(id: number): void {
    this.alerts.update((list) => list.filter((a) => a.id !== id));
  }

  toggleSound(): void {
    const on = !this.sound();
    this.sound.set(on);
    if (on) {
      this.backend.unlock();
      this.backend.play('water');
    }
  }

  /** Annonce les rappels arrivés à échéance */
  tick(): void {
    const now = Date.now();
    this.now.set(now);
    const s = this.session();
    if (!s) return;
    const list = s.schedule.events;
    let k = s.fired;
    while (k < list.length && s.startedAt + list[k].at * MIN_MS <= now) k++;
    if (k === s.fired) return;
    const missed = list.slice(s.fired, k);
    const due = s.startedAt + missed[missed.length - 1].at * MIN_MS;
    this.session.set({ ...s, fired: k });
    this.announce({
      id: this.nextId++,
      from: s.startedAt + missed[0].at * MIN_MS,
      due,
      count: missed.length,
      steps: mergeSteps(missed),
      late: now - due > LATE_MS,
    });
  }

  private announce(alert: TimerAlert): void {
    this.alerts.update((list) => [...list, alert].slice(-MAX_ALERTS));
    if (this.sound())
      this.backend.play(alert.steps.some((s) => s.kind === 'harvest') ? 'harvest' : 'water');
    this.backend.attention();
  }
}

// ---------- son (Web Audio, sans fichier) et signal Windows ----------

/** Notes jouées : « ploc ploc » pour arroser, petit arpège montant pour récolter */
const CHIMES: Record<ChimeKind, { notes: number[]; gap: number }> = {
  water: { notes: [659.3, 523.3], gap: 0.22 }, // mi, do
  harvest: { notes: [392, 493.9, 587.3, 784], gap: 0.16 }, // sol, si, ré, sol
};

function webAlerts(): AlertBackend {
  let ctx: AudioContext | null = null;
  const unlock = () => {
    try {
      if (typeof AudioContext === 'undefined') return;
      ctx ??= new AudioContext();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch {
      /* pas de son disponible */
    }
  };
  // Minuteur repris au démarrage : le premier clic débloque le son si le navigateur l'exige
  if (typeof document !== 'undefined')
    document.addEventListener('pointerdown', unlock, { once: true, capture: true });

  return {
    unlock,
    play(kind) {
      unlock();
      if (!ctx) return;
      const { notes, gap } = CHIMES[kind];
      const t0 = ctx.currentTime + 0.03;
      notes.forEach((f, i) => bell(ctx!, f, t0 + i * gap, i === notes.length - 1 ? 1.8 : 1.1));
    },
    attention() {
      if (!isTauri() || document.hasFocus()) return;
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow, UserAttentionType }) =>
          getCurrentWindow().requestUserAttention(UserAttentionType.Informational),
        )
        .catch(() => {});
    },
  };
}

/** Une note douce : sinusoïde + un soupçon d'octave, attaque arrondie et longue extinction */
function bell(ctx: AudioContext, freq: number, t: number, dur: number): void {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.08, t + 0.05);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  out.connect(ctx.destination);
  for (const [mul, vol] of [
    [1, 1],
    [2, 0.06],
  ]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq * mul;
    g.gain.value = vol;
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

import { TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';
import { PlannerStore } from './planner.store';
import { MAX_ALERTS, MIN_MS, TIMER_ALERTS, TimerStore, loadTimer } from './timer.store';

const T0 = new Date('2026-11-06T14:00:00').getTime();
const SOUP = 'tomato-basil-soup'; // tomate ×2 (pousse 15, arrosage 5), basilic ×1 (30, 10)

const steps = (list: { kind: string; slug: string; qty: number }[]) =>
  list.map((s) => `${s.kind} ${s.slug}×${s.qty}`);

describe('TimerStore', () => {
  let backend: { unlock: Mock; play: Mock; attention: Mock };

  function setup() {
    backend = { unlock: vi.fn(), play: vi.fn(), attention: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: TIMER_ALERTS, useValue: backend }] });
    return { planner: TestBed.inject(PlannerStore), timer: TestBed.inject(TimerStore) };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('sonne et notifie à chaque arrosage puis à la récolte', () => {
    const { planner, timer } = setup();
    planner.setQty(SOUP, 1);
    timer.start();
    TestBed.tick();
    expect(backend.unlock).toHaveBeenCalled();
    expect(timer.next()?.due).toBe(T0 + 5 * MIN_MS);

    vi.advanceTimersByTime(5 * MIN_MS - 1000);
    expect(timer.alerts()).toEqual([]);
    vi.advanceTimersByTime(1000);
    const [a] = timer.alerts();
    expect(steps(a.steps)).toEqual(['water tomato×2']);
    expect(a.late).toBe(false);
    expect(backend.play).toHaveBeenCalledWith('water');
    expect(backend.attention).toHaveBeenCalledOnce();

    timer.dismiss(a.id);
    expect(timer.alerts()).toEqual([]);

    vi.advanceTimersByTime(25 * MIN_MS);
    expect(timer.alerts()).toHaveLength(MAX_ALERTS);
    expect(steps(timer.alerts().at(-1)!.steps)).toEqual(['harvest basil×1']);
    expect(backend.play).toHaveBeenLastCalledWith('harvest');
    expect(backend.play).toHaveBeenCalledTimes(5);
    expect(timer.running()).toBe(false);
    expect(timer.progress()).toBe(1);
  });

  it('son coupé : la notification s’affiche quand même', () => {
    const { planner, timer } = setup();
    planner.setQty(SOUP, 1);
    timer.toggleSound();
    expect(timer.sound()).toBe(false);
    timer.start();
    TestBed.tick();
    vi.advanceTimersByTime(5 * MIN_MS);
    expect(timer.alerts()).toHaveLength(1);
    expect(backend.play).not.toHaveBeenCalled();

    timer.toggleSound(); // réactiver joue un aperçu
    expect(backend.play).toHaveBeenCalledWith('water');
  });

  it('le calendrier est figé au lancement : modifier le plan ne change pas le minuteur', () => {
    const { planner, timer } = setup();
    planner.setQty(SOUP, 1);
    timer.start();
    planner.setQty(SOUP, 0);
    planner.setQty('omurice', 2);
    expect(timer.session()!.recipes).toEqual([{ slug: SOUP, name: 'Tomato Basil Soup', n: 1 }]);
    expect(timer.endsAt()).toBe(T0 + 30 * MIN_MS);
    expect(timer.preview().total).toBe(90);
  });

  it('appli fermée puis rouverte : les rappels manqués arrivent en une notification', () => {
    let { planner, timer } = setup();
    planner.setQty(SOUP, 1);
    timer.start();
    TestBed.tick(); // sauvegarde

    TestBed.resetTestingModule();
    vi.setSystemTime(T0 + 12 * MIN_MS);
    ({ timer } = setup());
    TestBed.tick();

    expect(timer.alerts()).toHaveLength(1);
    const [a] = timer.alerts();
    expect(steps(a.steps)).toEqual(['water basil×1', 'water tomato×2']);
    expect(a.late).toBe(true);
    expect(a.due).toBe(T0 + 10 * MIN_MS);
    expect(a.from).toBe(T0 + 5 * MIN_MS);
    expect(a.count).toBe(2);
    expect(timer.next()?.at).toBe(15);
  });

  it('arrêter efface le minuteur ; rien à lancer sans culture', () => {
    const { planner, timer } = setup();
    timer.start();
    expect(timer.session()).toBeNull();
    planner.setQty('fried-eggs', 2);
    timer.start();
    expect(timer.session()).toBeNull();

    planner.setQty(SOUP, 1);
    timer.start();
    TestBed.tick();
    timer.stop();
    TestBed.tick();
    expect(timer.session()).toBeNull();
    expect(loadTimer(localStorage).session).toBeNull();
  });

  it('sauvegarde illisible ou incomplète : pas de minuteur, son activé', () => {
    const storage = (v: string) => ({ getItem: () => v });
    expect(loadTimer(null)).toEqual({ session: null, sound: true });
    expect(loadTimer(storage('{pas du json'))).toEqual({ session: null, sound: true });
    expect(loadTimer(storage(JSON.stringify({ session: { startedAt: 1 }, sound: false })))).toEqual(
      {
        session: null,
        sound: false,
      },
    );
  });
});

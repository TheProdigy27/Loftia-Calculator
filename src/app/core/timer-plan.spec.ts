import rawData from '../../data/loftia-data.json';
import { createEngine } from './engine';
import { alertTitle, buildSchedule, fmtCountdown, mergeSteps, nextLabel } from './timer-plan';
import type { CalcOptions, LoftiaData, PlanQuantities } from './types';

const engine = createEngine(rawData as LoftiaData);
const BASE: CalcOptions = { cookLvl: 1, farmLvl: 1, plots: 0, treesReady: false };

function schedule(plan: PlanQuantities, opt: Partial<CalcOptions> = {}) {
  const o = { ...BASE, ...opt };
  const P = engine.computePlan(plan, o);
  const S = buildSchedule(P, o.plots, (slug, drip) => engine.cropWater(slug, { farmLvl: o.farmLvl, drip }));
  return { P, S };
}

/** « 5 water tomato×2 » : lecture compacte d'un calendrier */
const compact = (S: ReturnType<typeof schedule>['S']) =>
  S.events.map((e) => `${e.at} ${e.steps.map((s) => `${s.kind} ${s.slug}×${s.qty}`).join(', ')}`);

describe('buildSchedule', () => {
  it('arrose toutes les « water » minutes jusqu’à la récolte, regroupé par minute', () => {
    const { P, S } = schedule({ 'tomato-basil-soup': 1 }); // tomate ×2 (15/5), basilic ×1 (30/10)
    expect(compact(S)).toEqual([
      '5 water tomato×2',
      '10 water basil×1, water tomato×2',
      '15 harvest tomato×2',
      '20 water basil×1',
      '30 harvest basil×1',
    ]);
    expect(S.first.map((s) => `${s.slug}×${s.qty}`)).toEqual(['basil×1', 'tomato×2']);
    expect(S.total).toBe(P.time);
  });

  it('Deep Hydration espace les arrosages', () => {
    // niveau 15 : arrosage +40 % → tomate 7 min, basilic 14 min
    const { S } = schedule({ 'tomato-basil-soup': 1 }, { farmLvl: 15 });
    const waters = S.events.filter((e) => e.steps.some((s) => s.kind === 'water')).map((e) => e.at);
    expect(waters).toEqual([7, 14, 28]); // pousse : tomate 14 min, basilic 29 min (Rapid Growth I)
  });

  it('Drip Irrigator : 3 rappels sur 30 min pour la soupe tomate-basilic (au lieu de 5)', () => {
    // 1 lit irrigué + 1 Hydrofarm : tout va dans le lit ; arrosage × 1,5 → tomate 7 min 30, basilic 15 min
    const garden = [{ n: 9, drip: true }, { n: 15, hydro: true }];
    for (const farmLvl of [1, 5]) {
      const { S } = schedule({ 'tomato-basil-soup': 1 }, { farmLvl, plots: garden });
      expect(compact(S)).toEqual(['7.5 water tomato×2', '15 harvest tomato×2, water basil×1', '30 harvest basil×1']);
    }
  });

  it('plus de graines que de parcelles : replante dès qu’une parcelle se libère, même temps que le plan', () => {
    // omurice ×3 : riz ×3 (90 min), tomate ×3 (15 min) sur 2 parcelles
    const { P, S } = schedule({ omurice: 3 }, { plots: 2 });
    expect(S.first).toEqual([{ kind: 'plant', slug: 'rice', name: 'Rice', qty: 2 }]);
    const at90 = S.events.find((e) => e.at === 90)!;
    expect(at90.steps.map((s) => `${s.kind} ${s.slug}×${s.qty}`)).toEqual([
      'harvest rice×2',
      'plant rice×1',
      'plant tomato×1',
    ]);
    const planted = S.events.flatMap((e) => e.steps).filter((s) => s.kind === 'plant');
    expect(planted.reduce((a, s) => a + s.qty, 0)).toBe(P.seeds - 2);
    expect(S.total).toBe(P.time);
    expect(S.total).toBe(180);
  });

  it('le dernier rappel tombe toujours sur le temps du plan', () => {
    const plans: [PlanQuantities, Partial<CalcOptions>][] = [
      [{ chakalaka: 2, 'garden-salad': 3 }, {}],
      [{ chakalaka: 2, 'garden-salad': 3 }, { plots: 3 }],
      [
        { 'pineapple-fried-rice': 1, fries: 4 },
        { plots: 4, farmLvl: 20 },
      ],
      [{ 'nasi-lemak': 2, 'tomato-soup': 5 }, { plots: 6 }],
    ];
    for (const [plan, opt] of plans) {
      const { P, S } = schedule(plan, opt);
      expect(S.total).toBe(P.time);
      expect(S.events.at(-1)!.at).toBe(P.time);
    }
  });

  it('Hydrofarm : rien à arroser, on plante « en Hydrofarm »', () => {
    const { P, S } = schedule({ 'tomato-basil-soup': 1 }, { plots: [{ n: 15, hydro: true }] });
    expect(compact(S)).toEqual(['15 harvest tomato×2', '30 harvest basil×1']);
    expect(S.first).toEqual([
      { kind: 'plant', slug: 'basil', name: 'Basil', qty: 1, hydro: true },
      { kind: 'plant', slug: 'tomato', name: 'Tomato', qty: 2, hydro: true },
    ]);
    expect(S.total).toBe(P.time);
  });

  it('jardin mélangé : arrosage selon la parcelle (lit, lit avec Drip, Hydrofarm)', () => {
    // Basilic (le plus long) dans le lit irrigué : arrosage 15 min ; tomates dans les lits sans Drip : 5 min
    const drip = schedule({ 'tomato-basil-soup': 1 }, { plots: [{ n: 1, drip: true }, { n: 2 }] }).S;
    expect(compact(drip)).toEqual([
      '5 water tomato×2',
      '10 water tomato×2',
      '15 harvest tomato×2, water basil×1',
      '30 harvest basil×1',
    ]);
    // Un seul lit : le basilic y va, les tomates en Hydrofarm
    const mixed = schedule({ 'tomato-basil-soup': 1 }, { plots: [{ n: 1 }, { n: 15, hydro: true }] }).S;
    expect(compact(mixed)).toEqual(['10 water basil×1', '15 harvest tomato×2', '20 water basil×1', '30 harvest basil×1']);
    expect(mixed.first.map((s) => `${s.slug}×${s.qty}${s.hydro ? ' hydro' : ''}`)).toEqual(['basil×1', 'tomato×2 hydro']);
  });

  it('arbres : on cueille au bout d’un cycle, rien s’ils sont déjà plantés', () => {
    const { S } = schedule({ 'nasi-lemak': 2 });
    const coco = S.events.flatMap((e) => e.steps).filter((s) => s.slug === 'coconut');
    expect(coco).toEqual([
      { kind: 'harvest', slug: 'coconut', name: 'Coconut', qty: 2, tree: true },
    ]);
    expect(S.first.some((s) => s.slug === 'coconut')).toBe(false);

    const ready = schedule({ 'nasi-lemak': 2 }, { treesReady: true }).S;
    expect(ready.events.flatMap((e) => e.steps).some((s) => s.slug === 'coconut')).toBe(false);
    expect(ready.total).toBe(90);
  });

  it('rien à faire pousser : pas de rappel', () => {
    const { S } = schedule({ 'fried-eggs': 2 });
    expect(S).toEqual({ first: [], events: [], total: 0 });
  });
});

describe('textes du minuteur', () => {
  it('mergeSteps : récoltes additionnées, seul le dernier arrosage d’une culture encore en terre compte', () => {
    const tomato = { slug: 'tomato', name: 'Tomato' };
    const basil = { slug: 'basil', name: 'Basil' };
    const events = [
      { at: 5, steps: [{ kind: 'water' as const, ...tomato, qty: 2 }] },
      {
        at: 10,
        steps: [
          { kind: 'water' as const, ...basil, qty: 1 },
          { kind: 'water' as const, ...tomato, qty: 2 },
        ],
      },
      {
        at: 15,
        steps: [
          { kind: 'harvest' as const, ...tomato, qty: 2 },
          { kind: 'plant' as const, ...tomato, qty: 1 },
        ],
      },
      {
        at: 20,
        steps: [
          { kind: 'water' as const, ...basil, qty: 1 },
          { kind: 'water' as const, ...tomato, qty: 1 },
        ],
      },
    ];
    const merged = mergeSteps(events);
    expect(merged.map((s) => `${s.kind} ${s.slug}×${s.qty}`)).toEqual([
      'harvest tomato×2',
      'plant tomato×1',
      'water basil×1',
      'water tomato×1',
    ]);
    expect(alertTitle(merged)).toBe('Récolte et arrosage !');
    expect(nextLabel(merged)).toBe('Récolte');

    // Récoltée ensuite : plus besoin de l'arroser
    const later = mergeSteps([
      ...events,
      { at: 30, steps: [{ kind: 'harvest', ...tomato, qty: 1 }] },
    ]);
    expect(later.map((s) => `${s.kind} ${s.slug}×${s.qty}`)).toEqual([
      'harvest tomato×3',
      'plant tomato×1',
      'water basil×1',
    ]);
  });

  it('compte à rebours', () => {
    expect(fmtCountdown(272_000)).toBe('4:32');
    expect(fmtCountdown(3_909_000)).toBe('1:05:09');
    expect(fmtCountdown(400)).toBe('0:01');
    expect(fmtCountdown(-5)).toBe('0:00');
  });
});

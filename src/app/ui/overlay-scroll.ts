/*
 * Barres de défilement superposées.
 * La barre native est masquée (elle ne prend donc jamais de place) et remplacée par un fin curseur
 * dessiné par-dessus le contenu : il apparaît pendant le défilement, ou quand la souris s'approche du bord
 * (pour pouvoir l'attraper), puis s'efface. Rien ne bouge dans la mise en page quand il apparaît.
 */
import { Directive, DestroyRef, ElementRef, afterNextRender, inject, input } from '@angular/core';

type Axis = 'x' | 'y';

/** Délai d'inactivité avant que la barre s'efface (ms) */
const HIDE_DELAY = 900;
/** Largeur de la zone, au bord du conteneur, où le survol fait apparaître la barre (px) */
const EDGE = 14;
/** Épaisseur de la piste (zone cliquable), le curseur visible est plus fin (px) */
const TRACK = 12;
/** Marge entre la piste et les extrémités du conteneur (px) */
const INSET = 4;
const MIN_THUMB = 36;

interface Bar {
  axis: Axis;
  track: HTMLDivElement;
  thumb: HTMLDivElement;
  /** Longueur de la piste et du curseur, mises à jour par layout() / update() */
  len: number;
  size: number;
}

@Directive({ selector: '[appScroll]', host: { class: 'osb' } })
export class OverlayScroll {
  /** Axes surveillés : vertical par défaut, 'x' pour un défilement horizontal */
  readonly appScroll = input<'' | Axis>('');

  private readonly el: HTMLElement = inject(ElementRef).nativeElement;
  private bars: Bar[] = [];
  /** Conteneurs parents qui rognent l'affichage (pour une barre horizontale dans une page qui défile) */
  private clippers: HTMLElement[] | null = null;
  private shown = false;
  private near = false;
  private dragging = false;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private frame = 0;

  constructor() {
    const off: (() => void)[] = [];
    const on = (t: EventTarget, type: string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      off.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };

    afterNextRender(() => {
      this.bars = [this.makeBar(this.appScroll() || 'y')];
      on(this.el, 'scroll', () => this.onScroll(), { passive: true });
      on(this.el, 'pointermove', (e: PointerEvent) => this.onPointer(e), { passive: true });
      // La piste est à côté du conteneur : passer de l'un à l'autre n'est pas « sortir »
      on(this.el, 'pointerleave', (e: PointerEvent) => !this.onTrack(e.relatedTarget) && this.setNear(false));
      on(window, 'resize', () => this.shown && this.layout());
      // Une barre horizontale suit son tableau quand la page défile
      if (this.bars.some((b) => b.axis === 'x')) {
        on(document, 'scroll', (e: Event) => e.target !== this.el && this.shown && this.layout(), { capture: true, passive: true });
      }
    });

    inject(DestroyRef).onDestroy(() => {
      off.forEach((f) => f());
      clearTimeout(this.hideTimer);
      cancelAnimationFrame(this.frame);
      this.bars.forEach((b) => b.track.remove());
    });
  }

  private makeBar(axis: Axis): Bar {
    const track = document.createElement('div');
    track.className = `osb-track osb-${axis}`;
    track.setAttribute('aria-hidden', 'true');
    const thumb = document.createElement('div');
    thumb.className = 'osb-thumb';
    track.append(thumb);
    // À côté du conteneur et pas dedans : ni rognée par lui, ni repositionnée par son éventuel container-type
    this.el.after(track);
    const bar: Bar = { axis, track, thumb, len: 0, size: 0 };
    track.addEventListener('pointerdown', (e) => this.onTrackDown(bar, e));
    track.addEventListener('pointerenter', () => this.setNear(true));
    track.addEventListener('pointerleave', (e) => !this.el.contains(e.relatedTarget as Node | null) && this.setNear(false));
    track.addEventListener('wheel', (e) => this.onTrackWheel(bar, e), { passive: false });
    return bar;
  }

  private onTrack(t: EventTarget | null): boolean {
    return t instanceof Node && this.bars.some((b) => b.track.contains(t));
  }

  /** La molette au-dessus de la barre fait défiler le conteneur, comme sur une barre native */
  private onTrackWheel(b: Bar, e: WheelEvent): void {
    e.preventDefault();
    const el = this.el;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? (b.axis === 'y' ? el.clientHeight : el.clientWidth) : 1;
    if (b.axis === 'y') el.scrollTop += e.deltaY * unit;
    else el.scrollLeft += (e.deltaX || e.deltaY) * unit;
  }

  // ---------- Affichage ----------

  private onScroll(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.show();
    });
  }

  private show(): void {
    if (!this.shown) this.layout();
    this.update();
    this.toggle(true);
    this.scheduleHide();
  }

  private scheduleHide(): void {
    clearTimeout(this.hideTimer);
    if (this.near || this.dragging) return;
    this.hideTimer = setTimeout(() => this.toggle(false), HIDE_DELAY);
  }

  private toggle(v: boolean): void {
    this.shown = v;
    for (const b of this.bars) b.track.classList.toggle('on', v);
  }

  private setNear(v: boolean): void {
    if (this.near === v) return;
    this.near = v;
    for (const b of this.bars) b.track.classList.toggle('near', v);
    if (v) this.show();
    else this.scheduleHide();
  }

  /** La souris s'approche du bord où se trouve la barre : on l'affiche pour qu'elle puisse être attrapée */
  private onPointer(e: PointerEvent): void {
    if (this.dragging || e.pointerType === 'touch') return;
    const r = this.visibleRect();
    const near = this.bars.some((b) =>
      this.scrollable(b.axis) &&
      (b.axis === 'y'
        ? e.clientX >= r.right - EDGE && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        : e.clientY >= r.bottom - EDGE && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right),
    );
    this.setNear(near);
  }

  // ---------- Géométrie ----------

  private scrollable(axis: Axis): boolean {
    const el = this.el;
    return axis === 'y' ? el.scrollHeight - el.clientHeight > 1 : el.scrollWidth - el.clientWidth > 1;
  }

  /** Partie visible du conteneur à l'écran (zone de contenu, rognée par la fenêtre et les conteneurs parents) */
  private visibleRect(): { left: number; top: number; right: number; bottom: number } {
    const el = this.el;
    const r = el.getBoundingClientRect();
    let left = r.left + el.clientLeft;
    let top = r.top + el.clientTop;
    let right = left + el.clientWidth;
    let bottom = top + el.clientHeight;
    for (const p of this.clipAncestors()) {
      const pr = p.getBoundingClientRect();
      left = Math.max(left, pr.left + p.clientLeft);
      top = Math.max(top, pr.top + p.clientTop);
      right = Math.min(right, pr.left + p.clientLeft + p.clientWidth);
      bottom = Math.min(bottom, pr.top + p.clientTop + p.clientHeight);
    }
    return {
      left: Math.max(left, 0),
      top: Math.max(top, 0),
      right: Math.min(right, document.documentElement.clientWidth),
      bottom: Math.min(bottom, document.documentElement.clientHeight),
    };
  }

  private clipAncestors(): HTMLElement[] {
    if (!this.clippers) {
      this.clippers = [];
      for (let p = this.el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') this.clippers.push(p);
      }
    }
    return this.clippers;
  }

  /** Place les pistes le long du bord visible du conteneur */
  private layout(): void {
    const r = this.visibleRect();
    for (const b of this.bars) {
      const s = b.track.style;
      if (b.axis === 'y') {
        b.len = Math.max(0, r.bottom - r.top - 2 * INSET);
        s.left = `${r.right - TRACK}px`;
        s.top = `${r.top + INSET}px`;
        s.width = `${TRACK}px`;
        s.height = `${b.len}px`;
      } else {
        b.len = Math.max(0, r.right - r.left - 2 * INSET);
        s.left = `${r.left + INSET}px`;
        s.top = `${r.bottom - TRACK}px`;
        s.width = `${b.len}px`;
        s.height = `${TRACK}px`;
      }
      // Un parent transformé (tiroir qui glisse…) sert de repère aux éléments « fixed » : on compense le décalage
      const got = b.track.getBoundingClientRect();
      const dx = got.left - parseFloat(s.left);
      const dy = got.top - parseFloat(s.top);
      if (Math.abs(dx) > 0.5) s.left = `${parseFloat(s.left) - dx}px`;
      if (Math.abs(dy) > 0.5) s.top = `${parseFloat(s.top) - dy}px`;
    }
  }

  /** Taille et position du curseur selon le défilement */
  private update(): void {
    const el = this.el;
    for (const b of this.bars) {
      const y = b.axis === 'y';
      const view = y ? el.clientHeight : el.clientWidth;
      const total = y ? el.scrollHeight : el.scrollWidth;
      const max = total - view;
      b.track.classList.toggle('off', max <= 1 || b.len <= MIN_THUMB);
      if (max <= 1) continue;
      b.size = Math.max(MIN_THUMB, Math.round((b.len * view) / total));
      const pos = ((y ? el.scrollTop : el.scrollLeft) / max) * (b.len - b.size);
      b.thumb.style[y ? 'height' : 'width'] = `${b.size}px`;
      b.thumb.style.transform = y ? `translateY(${pos}px)` : `translateX(${pos}px)`;
    }
  }

  // ---------- Souris : glisser le curseur, cliquer sur la piste ----------

  private onTrackDown(b: Bar, e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = this.el;
    const y = b.axis === 'y';
    const coord = (ev: PointerEvent) => (y ? ev.clientY : ev.clientX);

    if (e.target !== b.thumb) {
      // Clic sur la piste : saute d'une page vers le clic
      const thumbRect = b.thumb.getBoundingClientRect();
      const dir = coord(e) < (y ? thumbRect.top : thumbRect.left) ? -1 : 1;
      const page = (y ? el.clientHeight : el.clientWidth) * 0.85 * dir;
      el.scrollBy(y ? { top: page, behavior: 'smooth' } : { left: page, behavior: 'smooth' });
      return;
    }

    const start = coord(e);
    const startScroll = y ? el.scrollTop : el.scrollLeft;
    const ratio = ((y ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth) || 0) / Math.max(1, b.len - b.size);
    this.dragging = true;
    b.track.classList.add('drag');
    b.thumb.setPointerCapture(e.pointerId);
    clearTimeout(this.hideTimer);

    const move = (ev: PointerEvent) => {
      const v = startScroll + (coord(ev) - start) * ratio;
      if (y) el.scrollTop = v;
      else el.scrollLeft = v;
    };
    const end = () => {
      this.dragging = false;
      b.track.classList.remove('drag');
      b.thumb.removeEventListener('pointermove', move);
      b.thumb.removeEventListener('pointerup', end);
      b.thumb.removeEventListener('lostpointercapture', end);
      this.scheduleHide();
    };
    b.thumb.addEventListener('pointermove', move);
    b.thumb.addEventListener('pointerup', end);
    b.thumb.addEventListener('lostpointercapture', end);
  }
}

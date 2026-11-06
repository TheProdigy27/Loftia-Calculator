/* Mise à jour : bouton ↻ de la barre du haut et bandeau de notification. Logique dans state/updater.store.ts. */
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { UpdaterStore } from '../state/updater.store';
import { ExternalLink, Icon } from '../ui/shared';

const RELEASES = 'https://github.com/TheProdigy27/Loftia-Calculator/releases';
/** Durée d'affichage de « Tu as la dernière version » */
const UPTODATE_MS = 4_000;

@Component({
  selector: 'app-update-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @if (u.supported) {
      <button
        type="button"
        class="updbtn"
        [class.spin]="u.status().kind === 'checking'"
        [class.has]="!!u.available()"
        [disabled]="u.busy()"
        [title]="title()"
        [attr.aria-label]="title()"
        (click)="u.check(true)"
      >
        <app-icon name="refresh" />
        @if (u.currentVersion(); as v) {
          <span class="ver">v{{ v }}</span>
        }
      </button>
    }
  `,
})
export class UpdateButton {
  protected readonly u = inject(UpdaterStore);

  protected readonly title = computed(() => {
    const parts = ['Rechercher des mises à jour'];
    const v = this.u.currentVersion();
    if (v) parts.push(`version installée : ${v}`);
    const at = this.u.lastCheck();
    if (at)
      parts.push(
        `dernière vérification à ${at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
      );
    const up = this.u.available();
    if (up) parts.push(`version ${up.version} disponible`);
    return parts.join(' · ');
  });
}

@Component({
  selector: 'app-update-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, ExternalLink],
  template: `
    @let s = u.status();
    @if (visible()) {
      <div class="updbar" role="status" [class.err]="s.kind === 'error'">
        @switch (s.kind) {
          @case ('checking') {
            <p><app-icon name="refresh" cls="spin" />Recherche de mises à jour…</p>
          }
          @case ('uptodate') {
            <p>
              Tu as la dernière version{{
                u.currentVersion() ? ' (' + u.currentVersion() + ')' : ''
              }}.
            </p>
          }
          @case ('available') {
            <p>
              <b>Loftia Planner {{ s.update.version }}</b> est disponible{{
                u.currentVersion() ? ' (tu as la ' + u.currentVersion() + ')' : ''
              }}.
              <a appExternal [href]="releaseUrl(s.update.version)">Nouveautés</a>
            </p>
            <div class="acts">
              <button type="button" class="btn" (click)="u.dismiss()">Plus tard</button>
              <button type="button" class="btn primary" (click)="u.install()">
                Installer et redémarrer
              </button>
            </div>
          }
          @case ('installing') {
            <p>
              @if (s.progress === null || s.progress < 1) {
                Téléchargement de la version {{ s.update.version }}…
                @if (s.progress !== null) {
                  {{ pct(s.progress) }} %
                }
              } @else {
                Installation de la version {{ s.update.version }}, l'appli va redémarrer…
              }
            </p>
            <div class="prog" [class.indet]="s.progress === null">
              <span [style.width.%]="s.progress === null ? 100 : pct(s.progress)"></span>
            </div>
          }
          @case ('error') {
            <p>
              @if (s.update) {
                L'installation de la version {{ s.update.version }} a échoué : {{ s.message }}
              } @else {
                Impossible de vérifier les mises à jour : {{ s.message }}
              }
            </p>
            <div class="acts">
              @if (s.update) {
                <button type="button" class="btn primary" (click)="u.install()">Réessayer</button>
              } @else {
                <button type="button" class="btn" (click)="u.check(true)">Réessayer</button>
              }
            </div>
          }
        }
        @if (s.kind !== 'installing' && s.kind !== 'available') {
          <button type="button" class="iconbtn close" aria-label="Fermer" (click)="u.dismiss()">
            <app-icon name="x" />
          </button>
        }
      </div>
    }
  `,
})
export class UpdateBanner {
  protected readonly u = inject(UpdaterStore);

  /** Les vérifications automatiques ne s'affichent que si elles trouvent quelque chose */
  protected readonly visible = computed(() => {
    const s = this.u.status();
    if (this.u.dismissed() && s.kind !== 'installing') return false;
    switch (s.kind) {
      case 'idle':
        return false;
      case 'checking':
      case 'uptodate':
        return s.manual;
      case 'error':
        return s.manual || !!s.update;
      default:
        return true;
    }
  });

  constructor() {
    effect((onCleanup) => {
      const s = this.u.status();
      if (s.kind !== 'uptodate' || !this.visible()) return;
      const t = setTimeout(() => this.u.dismiss(), UPTODATE_MS);
      onCleanup(() => clearTimeout(t));
    });
  }

  protected releaseUrl(version: string): string {
    return `${RELEASES}/tag/v${version}`;
  }

  protected pct(p: number): number {
    return Math.round(p * 100);
  }
}

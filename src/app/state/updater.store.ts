/*
 * Mise à jour automatique depuis GitHub Releases (plugin Tauri updater).
 * Vérifie au démarrage puis toutes les 6 heures, et à la demande (bouton ↻ de la barre du haut).
 * Le fichier interrogé est latest.json de la dernière release publiée, signé par le workflow release.yml.
 */
import { Injectable, InjectionToken, computed, inject, isDevMode, signal } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';

export interface UpdateInfo {
  version: string;
  /** Notes de version (corps de la release GitHub) */
  notes: string;
}

export interface PendingUpdate extends UpdateInfo {
  /** Télécharge et installe ; done/total en octets (total inconnu si le serveur ne l'annonce pas) */
  install(onProgress: (done: number, total: number | undefined) => void): Promise<void>;
  close(): Promise<void>;
}

/** Accès au plugin, remplacé dans les tests */
export interface UpdaterBackend {
  /** Faux dans le navigateur (npm start) : pas de mise à jour possible */
  readonly supported: boolean;
  currentVersion(): Promise<string>;
  check(): Promise<PendingUpdate | null>;
  relaunch(): Promise<void>;
}

const tauriBackend: UpdaterBackend = {
  supported: isTauri(),
  async currentVersion() {
    const { getVersion } = await import('@tauri-apps/api/app');
    return getVersion();
  },
  async check() {
    const { check } = await import('@tauri-apps/plugin-updater');
    const u = await check({ timeout: 30_000 });
    if (!u) return null;
    return {
      version: u.version,
      notes: u.body?.trim() ?? '',
      async install(onProgress) {
        let done = 0;
        let total: number | undefined;
        await u.downloadAndInstall((e) => {
          if (e.event === 'Started') total = e.data.contentLength;
          else if (e.event === 'Progress') done += e.data.chunkLength;
          onProgress(done, total);
        });
      },
      close: () => u.close(),
    };
  },
  async relaunch() {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  },
};

export const UPDATER_BACKEND = new InjectionToken<UpdaterBackend>('UPDATER_BACKEND', {
  factory: () => tauriBackend,
});

export type UpdateStatus =
  | { kind: 'idle' }
  /** manual : lancé par le bouton, on affiche alors le résultat même s'il n'y a rien de neuf */
  | { kind: 'checking'; manual: boolean }
  | { kind: 'uptodate'; manual: boolean }
  | { kind: 'available'; update: UpdateInfo }
  /** progress entre 0 et 1, null si la taille est inconnue */
  | { kind: 'installing'; update: UpdateInfo; progress: number | null }
  | { kind: 'error'; manual: boolean; message: string; update?: UpdateInfo };

export const AUTO_CHECK_DELAY_MS = 4_000;
export const AUTO_CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class UpdaterStore {
  private readonly backend = inject(UPDATER_BACKEND);
  private pending: PendingUpdate | null = null;
  private started = false;

  readonly supported = this.backend.supported;
  readonly status = signal<UpdateStatus>({ kind: 'idle' });
  readonly currentVersion = signal<string | null>(null);
  readonly lastCheck = signal<Date | null>(null);
  /** Bandeau fermé par l'utilisateur (« Plus tard ») */
  readonly dismissed = signal(false);

  readonly busy = computed(() => ['checking', 'installing'].includes(this.status().kind));
  readonly available = computed(() => {
    const s = this.status();
    if (s.kind === 'available') return s.update;
    if (s.kind === 'error') return s.update ?? null;
    return null;
  });

  /** Lance les vérifications automatiques (une fois, au démarrage de l'appli) */
  start(): void {
    if (!this.supported || this.started) return;
    this.started = true;
    this.backend.currentVersion().then(
      (v) => this.currentVersion.set(v),
      () => {},
    );
    // En développement (npm run dev), seulement à la demande : l'installeur remplacerait l'appli installée.
    if (isDevMode()) return;
    setTimeout(() => this.check(), AUTO_CHECK_DELAY_MS);
    setInterval(() => this.check(), AUTO_CHECK_EVERY_MS);
  }

  async check(manual = false): Promise<void> {
    if (!this.supported || this.busy()) return;
    const before = this.status();
    const known = this.available()?.version;
    this.status.set({ kind: 'checking', manual });
    try {
      const found = await this.backend.check();
      this.lastCheck.set(new Date());
      await this.pending?.close().catch(() => {});
      this.pending = found;
      if (found) {
        // Une vérification automatique ne rouvre pas le bandeau fermé pour la même version.
        if (manual || found.version !== known) this.dismissed.set(false);
        this.status.set({
          kind: 'available',
          update: { version: found.version, notes: found.notes },
        });
      } else {
        this.dismissed.set(false);
        this.status.set({ kind: 'uptodate', manual });
      }
    } catch (e) {
      this.lastCheck.set(new Date());
      // Échec silencieux d'une vérification automatique : on garde la version déjà trouvée.
      if (!manual && known) return this.status.set(before);
      this.dismissed.set(false);
      this.status.set({ kind: 'error', manual, message: errorText(e) });
    }
  }

  async install(): Promise<void> {
    const p = this.pending;
    if (!p || this.busy()) return;
    const update: UpdateInfo = { version: p.version, notes: p.notes };
    this.dismissed.set(false);
    this.status.set({ kind: 'installing', update, progress: 0 });
    try {
      await p.install((done, total) =>
        this.status.set({
          kind: 'installing',
          update,
          progress: total ? Math.min(1, done / total) : null,
        }),
      );
      // Sous Windows l'installeur ferme l'appli et la relance lui-même ; ailleurs on redémarre ici.
      await this.backend.relaunch();
    } catch (e) {
      this.status.set({ kind: 'error', manual: true, message: errorText(e), update });
    }
  }

  dismiss(): void {
    this.dismissed.set(true);
  }
}

function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  // Pas encore de release publiée (latest.json introuvable) ou pas de réseau
  if (/valid release JSON|404/i.test(raw)) return 'aucune version publiée trouvée sur GitHub.';
  if (/error sending request|dns|connect|timed? ?out/i.test(raw))
    return 'pas de connexion à GitHub.';
  return raw;
}

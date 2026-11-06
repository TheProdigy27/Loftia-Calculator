import { TestBed } from '@angular/core/testing';
import { PendingUpdate, UPDATER_BACKEND, UpdaterBackend, UpdaterStore } from './updater.store';

function fakeUpdate(version: string, installImpl?: PendingUpdate['install']): PendingUpdate {
  return {
    version,
    notes: '',
    install:
      installImpl ??
      (async (onProgress) => {
        onProgress(50, 100);
        onProgress(100, 100);
      }),
    close: vi.fn(async () => {}),
  };
}

describe('UpdaterStore', () => {
  let backend: UpdaterBackend & {
    check: ReturnType<typeof vi.fn>;
    relaunch: ReturnType<typeof vi.fn>;
  };
  let store: UpdaterStore;

  beforeEach(() => {
    backend = {
      supported: true,
      currentVersion: async () => '0.1.0',
      check: vi.fn(async () => null),
      relaunch: vi.fn(async () => {}),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: UPDATER_BACKEND, useValue: backend }],
    });
    store = TestBed.inject(UpdaterStore);
  });

  it('à jour : garde la trace d’une vérification manuelle', async () => {
    await store.check(true);
    expect(store.status()).toEqual({ kind: 'uptodate', manual: true });
    expect(store.lastCheck()).toBeInstanceOf(Date);
    expect(store.available()).toBeNull();
  });

  it('nouvelle version : disponible, puis installée et relancée', async () => {
    const progress: unknown[] = [];
    const seen = () => progress.push((store.status() as { progress?: number | null }).progress);
    backend.check.mockResolvedValue(
      fakeUpdate('0.2.0', async (onProgress) => {
        seen();
        onProgress(25, 100);
        seen();
        onProgress(80, undefined);
        seen();
      }),
    );
    await store.check();
    expect(store.available()).toEqual({ version: '0.2.0', notes: '' });

    await store.install();
    expect(progress).toEqual([0, 0.25, null]);
    expect(backend.relaunch).toHaveBeenCalledOnce();
  });

  it('« Plus tard » : une vérification auto ne rouvre pas le bandeau pour la même version, le bouton si', async () => {
    backend.check.mockResolvedValue(fakeUpdate('0.2.0'));
    await store.check();
    store.dismiss();
    await store.check();
    expect(store.dismissed()).toBe(true);
    backend.check.mockResolvedValue(fakeUpdate('0.3.0'));
    await store.check();
    expect(store.dismissed()).toBe(false);
    store.dismiss();
    await store.check(true);
    expect(store.dismissed()).toBe(false);
  });

  it('erreur : message lisible, et un échec automatique garde la version déjà trouvée', async () => {
    backend.check.mockRejectedValue(
      new Error('Could not fetch a valid release JSON from the remote'),
    );
    await store.check(true);
    expect(store.status()).toMatchObject({
      kind: 'error',
      manual: true,
      message: 'aucune version publiée trouvée sur GitHub.',
    });

    backend.check.mockResolvedValue(fakeUpdate('0.2.0'));
    await store.check();
    backend.check.mockRejectedValue(new Error('error sending request'));
    await store.check();
    expect(store.status()).toMatchObject({ kind: 'available' });
  });

  it('installation ratée : on peut réessayer', async () => {
    backend.check.mockResolvedValue(
      fakeUpdate('0.2.0', async () => {
        throw new Error('signature invalide');
      }),
    );
    await store.check();
    await store.install();
    expect(store.status()).toMatchObject({ kind: 'error', message: 'signature invalide' });
    expect(store.available()?.version).toBe('0.2.0');
    expect(backend.relaunch).not.toHaveBeenCalled();
  });

  it('ne fait rien hors de l’appli de bureau', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: UPDATER_BACKEND, useValue: { ...backend, supported: false } }],
    });
    const web = TestBed.inject(UpdaterStore);
    await web.check(true);
    expect(web.status()).toEqual({ kind: 'idle' });
    expect(backend.check).not.toHaveBeenCalled();
  });
});

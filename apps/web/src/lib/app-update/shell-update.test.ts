import { afterEach, describe, expect, test } from 'bun:test';

import type { HttpRequest } from '@/lib/api/http';

import { appUpdateStore } from './pending-store';
import { checkShellUpdate, isNewerVersion, shellPlatform, storeUpdateFrom, watchShellUpdates } from './shell-update';

afterEach(() => {
  appUpdateStore.setState({ pending: null, store: null, dismissed: false, applying: false });
});

const PLAY = 'https://play.google.com/store/apps/details?id=me.meeshy.app';

describe('la comparaison de versions', () => {
  test('une version plus haute sur n’importe quel rang est plus récente', () => {
    expect(isNewerVersion('2.0.8', '2.0.7')).toBe(true);
    expect(isNewerVersion('2.1.0', '2.0.9')).toBe(true);
    expect(isNewerVersion('3.0.0', '2.9.9')).toBe(true);
  });

  test('la même version, ou une plus ancienne, ne l’est pas', () => {
    expect(isNewerVersion('2.0.7', '2.0.7')).toBe(false);
    expect(isNewerVersion('2.0.6', '2.0.7')).toBe(false);
    expect(isNewerVersion('2.0', '2.0.0')).toBe(false);
  });

  test('une version illisible n’annonce jamais rien', () => {
    expect(isNewerVersion('', '2.0.7')).toBe(false);
    expect(isNewerVersion('beta', '2.0.7')).toBe(false);
    expect(isNewerVersion('9.0.0', 'dev')).toBe(false);
  });
});

describe('ce que la passerelle sert', () => {
  test('une version publiée plus récente devient une annonce vers la fiche du magasin', () => {
    expect(storeUpdateFrom({ latestVersion: '2.0.8', storeUrl: PLAY }, '2.0.7')).toEqual({
      version: '2.0.8',
      storeUrl: PLAY,
    });
  });

  test('une version vide (rien de publié) ne fabrique aucune annonce', () => {
    expect(storeUpdateFrom({ latestVersion: '', storeUrl: PLAY }, '2.0.7')).toBeNull();
  });

  test('la version installée, ou une fiche qui n’est pas https, n’annonce rien', () => {
    expect(storeUpdateFrom({ latestVersion: '2.0.7', storeUrl: PLAY }, '2.0.7')).toBeNull();
    expect(storeUpdateFrom({ latestVersion: '2.0.8', storeUrl: 'javascript:alert(1)' }, '2.0.7')).toBeNull();
    expect(storeUpdateFrom(null, '2.0.7')).toBeNull();
  });
});

describe('la plateforme de la coque', () => {
  test('lue sur le pont natif, et seulement android ou ios', () => {
    expect(shellPlatform({ getPlatform: () => 'android' })).toBe('android');
    expect(shellPlatform({ getPlatform: () => 'ios' })).toBe('ios');
    expect(shellPlatform({ getPlatform: () => 'web' })).toBeNull();
    expect(shellPlatform(undefined)).toBeNull();
  });
});

describe('la vérification', () => {
  const transportServing = (data: unknown, seen: HttpRequest[] = []) => ({
    request: <T,>(request: HttpRequest) => {
      seen.push(request);
      return Promise.resolve({ ok: true as const, data: data as T });
    },
  });

  test('elle demande la version de SA plateforme, et pose l’annonce', async () => {
    const seen: HttpRequest[] = [];
    await checkShellUpdate({
      transport: transportServing({ latestVersion: '2.0.8', storeUrl: PLAY }, seen),
      installed: '2.0.7',
      platform: 'android',
    });

    expect(seen.map((r) => [r.method, r.path])).toEqual([['GET', '/api/v1/app/shell-version?platform=android']]);
    expect(appUpdateStore.getState().store).toEqual({ version: '2.0.8', storeUrl: PLAY });
  });

  test('rien de plus récent ⇒ aucune annonce', async () => {
    await checkShellUpdate({
      transport: transportServing({ latestVersion: '', storeUrl: PLAY }),
      installed: '2.0.7',
      platform: 'android',
    });

    expect(appUpdateStore.getState().store).toBeNull();
  });

  test('une panne réseau ne fabrique aucune annonce et ne lève rien', async () => {
    await checkShellUpdate({
      transport: { request: () => Promise.resolve({ ok: false as const, status: 0, error: 'offline' }) },
      installed: '2.0.7',
      platform: 'android',
    });

    expect(appUpdateStore.getState().store).toBeNull();
  });

  test('une annonce déjà écartée pour la même version ne se rouvre pas au retour au premier plan', async () => {
    const transport = transportServing({ latestVersion: '2.0.8', storeUrl: PLAY });
    await checkShellUpdate({ transport, installed: '2.0.7', platform: 'android' });
    appUpdateStore.getState().dismiss();

    await checkShellUpdate({ transport, installed: '2.0.7', platform: 'android' });

    expect(appUpdateStore.getState().dismissed).toBe(true);
  });

  test('une version encore plus récente rouvre l’annonce', async () => {
    await checkShellUpdate({
      transport: transportServing({ latestVersion: '2.0.8', storeUrl: PLAY }),
      installed: '2.0.7',
      platform: 'android',
    });
    appUpdateStore.getState().dismiss();

    await checkShellUpdate({
      transport: transportServing({ latestVersion: '2.0.9', storeUrl: PLAY }),
      installed: '2.0.7',
      platform: 'android',
    });

    expect(appUpdateStore.getState().dismissed).toBe(false);
    expect(appUpdateStore.getState().store?.version).toBe('2.0.9');
  });
});

describe('la veille de la coque', () => {
  test('elle vérifie au démarrage puis à chaque retour au premier plan, jamais en arrière-plan', async () => {
    const paths: string[] = [];
    const listeners: Array<() => void> = [];
    let visibility: DocumentVisibilityState = 'visible';
    const host = {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
      removeEventListener: () => undefined,
    };
    const transport = {
      request: <T,>(request: HttpRequest) => {
        paths.push(request.path);
        return Promise.resolve({ ok: true as const, data: { latestVersion: '', storeUrl: PLAY } as T });
      },
    };

    watchShellUpdates({ transport, installed: '2.0.7', bridge: { getPlatform: () => 'android' }, host });
    visibility = 'hidden';
    listeners.forEach((listener) => listener());
    visibility = 'visible';
    listeners.forEach((listener) => listener());

    expect(paths.length).toBe(2);
  });

  test('hors coque (aucune plateforme native), elle ne demande rien', () => {
    const paths: string[] = [];
    const transport = {
      request: <T,>(request: HttpRequest) => {
        paths.push(request.path);
        return Promise.resolve({ ok: true as const, data: {} as T });
      },
    };
    const host = { visibilityState: 'visible' as const, addEventListener: () => undefined, removeEventListener: () => undefined };

    watchShellUpdates({ transport, installed: '2.0.7', bridge: undefined, host });

    expect(paths).toEqual([]);
  });
});

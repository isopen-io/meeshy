import { describe, expect, test } from 'bun:test';

import { SHELL_RECENT_MEDIA_WORKER_URL, registerShellRecentMediaWorker } from './recent-media-worker';

/**
 * #11326 — LA COQUE INSCRIT LE SEUL WORKER DES MÉDIAS RÉCENTS. Elle n'a pas
 * le worker du web (son bundle est embarqué) ; celui-ci ne resert que l'audio
 * et la vidéo gardés, plages comprises.
 */
describe('registerShellRecentMediaWorker', () => {
  test('inscrit `/sw-recent-media.js` à la racine', async () => {
    const calls: { readonly url: string; readonly scope: string | undefined }[] = [];
    const container = {
      register: async (url: string, options?: { readonly scope?: string }) => {
        calls.push({ url, scope: options?.scope });
        return {};
      },
    };
    expect(await registerShellRecentMediaWorker(container)).toBe('registered');
    expect(calls).toEqual([{ url: SHELL_RECENT_MEDIA_WORKER_URL, scope: '/' }]);
    expect(SHELL_RECENT_MEDIA_WORKER_URL).toBe('/sw-recent-media.js');
  });

  test('une WebView sans service worker (iOS `capacitor://`) : rien, sans exception', async () => {
    expect(await registerShellRecentMediaWorker(undefined)).toBe('unavailable');
  });

  test('une inscription refusée ne remonte aucune erreur', async () => {
    const container = { register: async () => Promise.reject(new Error('SecurityError')) };
    expect(await registerShellRecentMediaWorker(container)).toBe('refused');
  });
});

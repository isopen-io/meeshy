import { describe, expect, test } from 'bun:test';

import { applyRemotePreference, pushPreference, type Transport } from './sync';

describe('applyRemotePreference — arbitrage de version', () => {
  test('incoming.version <= local ⇒ ignoré', () => {
    const local = { mode: 'focal' as const, version: 3 };
    expect(applyRemotePreference(local, { version: 3, reset: false, readingMode: 'script' })).toEqual(local);
    expect(applyRemotePreference(local, { version: 1, reset: false, readingMode: 'script' })).toEqual(local);
  });

  test('incoming.version > local ⇒ appliqué, version retenue', () => {
    const local = { mode: 'focal' as const, version: 1 };
    expect(applyRemotePreference(local, { version: 2, reset: false, readingMode: 'script' })).toEqual({
      mode: 'script',
      version: 2,
    });
  });

  test('reset: true, preferences: null ⇒ retour aux défauts locaux (auto ⇒ mode: null)', () => {
    const local = { mode: 'script' as const, version: 1 };
    expect(applyRemotePreference(local, { version: 2, reset: true, readingMode: null })).toEqual({
      mode: null,
      version: 2,
    });
  });
});

describe('pushPreference — le port serveur (D-10)', () => {
  test('compose la MÉTHODE, le chemin et le corps EXACT { readingMode } de la route PUT', async () => {
    const calls: { readonly method: string; readonly path: string; readonly body?: unknown }[] = [];
    const transport: Transport = async (request) => {
      calls.push(request);
      return { success: true };
    };

    await pushPreference(transport, 'c-deploiement', 'script');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.path).toBe('/api/v1/user-preferences/conversations/c-deploiement');
    expect(calls[0]?.body).toEqual({ readingMode: 'script' });
  });

  test('ne compose AUCUN second champ', async () => {
    let received: unknown;
    const transport: Transport = async (request) => {
      received = request.body;
      return null;
    };
    await pushPreference(transport, 'c-1', 'bulles');
    expect(Object.keys(received as object)).toEqual(['readingMode']);
  });
});

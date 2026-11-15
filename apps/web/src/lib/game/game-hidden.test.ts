import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import type { GameSettingsResponse } from '@meeshy/shared/types/game';

import { GAME_SETTINGS_QUERY_KEY } from '@/lib/api/game-v2-queries';
import { createHttpTransport } from '@/lib/api/http';

import { adoptServedHidden, persistGameHidden } from './game-hidden';
import { createGamePrefsStore } from './preferences';

/**
 * « JEU MASQUÉ », LE SERVEUR FAIT FOI (#9481) — le drapeau de l'appareil n'est plus qu'une COPIE du
 * dernier état connu : il épouse ce que `GET /me/game/privacy` sert, et ne s'écrit qu'avec le
 * `PUT` qui le fait vrai côté serveur. Hors ligne, rien ne change (une bascule qui ne partirait pas
 * serait un contrôle qui ment) ; un refus rend l'interrupteur à son état d'avant.
 */

const served = (patch: Partial<GameSettingsResponse> = {}): GameSettingsResponse => ({
  gameHidden: false,
  friendsLeagueOptOut: false,
  visibility: { showcase: 'friends', rank: 'friends', treasury: 'friends', atlas: 'me' },
  ...patch,
});

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key) };
};

type Call = { readonly url: string; readonly method: string | undefined; readonly body: unknown };

function setup(response: { readonly status: number; readonly body: unknown } | 'network-error', options: { readonly online?: boolean } = {}) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method, body: JSON.parse(String(init?.body ?? 'null')) });
    if (response === 'network-error') throw new TypeError('offline');
    return new Response(JSON.stringify(response.body), { status: response.status, headers: { 'Content-Type': 'application/json' } });
  };
  const transport = createHttpTransport({ base: 'https://gate.test', credential: () => ({ kind: 'registered', token: 'jwt-test' }), fetchImpl, timeoutMs: 0 });
  const client = new QueryClient();
  const prefs = createGamePrefsStore({ storage: memoryStorage() });
  const deps = { transport, client, prefs, isOnline: () => options.online ?? true, requestId: () => 'req-12345678' };
  return { calls, client, prefs, deps };
}

const okBody = (data: unknown) => ({ status: 200, body: { success: true, data } });

describe('le serveur fait foi', () => {
  test('une lecture du serveur remplace la copie locale — dans les deux sens', () => {
    const prefs = createGamePrefsStore({ storage: memoryStorage() });
    adoptServedHidden(served({ gameHidden: true }), prefs);
    expect(prefs.get().hidden).toBe(true);
    adoptServedHidden(served({ gameHidden: false }), prefs);
    expect(prefs.get().hidden).toBe(false);
  });

  test('les célébrations, commodité de l’appareil, ne bougent pas', () => {
    const prefs = createGamePrefsStore({ storage: memoryStorage() });
    prefs.set({ celebrations: false });
    adoptServedHidden(served({ gameHidden: true }), prefs);
    expect(prefs.get()).toEqual({ hidden: true, celebrations: false });
  });
});

describe('masquer et réafficher écrivent côté serveur', () => {
  test('masquer : PUT /me/game/privacy, le jeu se masque tout de suite et la réponse est la vérité', async () => {
    const { calls, client, prefs, deps } = setup(okBody({ gameHidden: true, friendsLeagueOptOut: true }));
    client.setQueryData(GAME_SETTINGS_QUERY_KEY, served());
    const outcome = await persistGameHidden(true, deps);
    expect(outcome).toEqual({ status: 'saved' });
    expect(calls).toEqual([{ url: 'https://gate.test/api/v1/me/game/privacy', method: 'PUT', body: { requestId: 'req-12345678', gameHidden: true } }]);
    expect(prefs.get().hidden).toBe(true);
    expect(client.getQueryData<GameSettingsResponse>(GAME_SETTINGS_QUERY_KEY)).toEqual(served({ gameHidden: true, friendsLeagueOptOut: true }));
  });

  test('réafficher : le même PUT, à false — sinon la prochaine lecture le masquerait de nouveau', async () => {
    const { calls, prefs, deps } = setup(okBody({ gameHidden: false, friendsLeagueOptOut: false }));
    prefs.set({ hidden: true });
    expect(await persistGameHidden(false, deps)).toEqual({ status: 'saved' });
    expect(calls[0]?.body).toEqual({ requestId: 'req-12345678', gameHidden: false });
    expect(prefs.get().hidden).toBe(false);
  });

  test('l’interrupteur bascule avant la réponse (optimiste), pas après', async () => {
    const { client, prefs, deps } = setup(okBody({ gameHidden: true, friendsLeagueOptOut: false }));
    client.setQueryData(GAME_SETTINGS_QUERY_KEY, served());
    const pending = persistGameHidden(true, deps);
    await Promise.resolve();
    expect(prefs.get().hidden).toBe(true);
    await pending;
  });

  test('hors ligne : rien ne part, rien ne change', async () => {
    const { calls, client, prefs, deps } = setup(okBody({ gameHidden: true, friendsLeagueOptOut: false }), { online: false });
    client.setQueryData(GAME_SETTINGS_QUERY_KEY, served());
    expect(await persistGameHidden(true, deps)).toEqual({ status: 'offline' });
    expect(calls).toEqual([]);
    expect(prefs.get().hidden).toBe(false);
    expect(client.getQueryData<GameSettingsResponse>(GAME_SETTINGS_QUERY_KEY)).toEqual(served());
  });

  test('refusé ou panne : l’interrupteur revient à son état d’avant, côté appareil ET côté cache', async () => {
    for (const response of [{ status: 500, body: { success: false, error: 'boom' } }, 'network-error' as const]) {
      const { client, prefs, deps } = setup(response);
      client.setQueryData(GAME_SETTINGS_QUERY_KEY, served());
      const outcome = await persistGameHidden(true, deps);
      expect(outcome.status).toBe('refused');
      expect(prefs.get().hidden).toBe(false);
      expect(client.getQueryData<GameSettingsResponse>(GAME_SETTINGS_QUERY_KEY)).toEqual(served());
    }
  });

  test('sans lecture en cache, le geste marche quand même : le cache n’est pas inventé', async () => {
    const { client, prefs, deps } = setup(okBody({ gameHidden: true, friendsLeagueOptOut: false }));
    expect(await persistGameHidden(true, deps)).toEqual({ status: 'saved' });
    expect(prefs.get().hidden).toBe(true);
    expect(client.getQueryData(GAME_SETTINGS_QUERY_KEY)).toBeUndefined();
  });
});

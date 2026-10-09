import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from './http';
import { fetchGameSettings, fetchUserGame, setGamePrivacy } from './game-integration';

/**
 * L'INTÉGRATION DU JEU (#9481) — ce que les clients gardaient en mémoire se RELIT : les réglages du
 * jeu (`GET /me/game/privacy`), le jeu d'un autre (`GET /users/:userId/game`), et l'écriture de
 * « Jeu masqué » (`PUT /me/game/privacy`). Chaque lecture est refusée ENTIÈRE si elle est illisible :
 * le web ne devine ni un réglage, ni le niveau de quelqu'un.
 */

type Call = { readonly url: string; readonly init: RequestInit | undefined };

function transportServing(body: unknown, calls: Call[] = []) {
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return createHttpTransport({ base: 'https://gate.test', credential: () => ({ kind: 'registered', token: 'jwt-test' }), fetchImpl, timeoutMs: 0 });
}

const settings = { gameHidden: false, friendsLeagueOptOut: true, visibility: { showcase: 'friends', rank: 'everyone', treasury: 'me', atlas: 'me' } };
const standing = { level: 34, tier: 'eclat', prestige: 2, flame: 'brasier', rank: 'voix', division: 2 };

describe('les réglages du jeu', () => {
  test('GET /me/game/privacy : les deux interrupteurs et les quatre visibilités sont lus', async () => {
    const calls: Call[] = [];
    const result = await fetchGameSettings(transportServing(settings, calls));
    expect(result).toEqual({ ok: true, data: settings });
    expect(calls[0]?.url).toBe('https://gate.test/api/v1/me/game/privacy');
    expect(calls[0]?.init?.method).toBe('GET');
  });

  test('une visibilité inconnue, ou un interrupteur absent : refusé ENTIER', async () => {
    const wrong = await fetchGameSettings(transportServing({ ...settings, visibility: { ...settings.visibility, atlas: 'public' } }));
    expect(wrong.ok ? '' : wrong.code).toBe('MALFORMED_PAYLOAD');
    const missing = await fetchGameSettings(transportServing({ friendsLeagueOptOut: false, visibility: settings.visibility }));
    expect(missing.ok).toBe(false);
  });

  test('« Jeu masqué » s’écrit par PUT /me/game/privacy avec son requestId, la réponse est relue', async () => {
    const calls: Call[] = [];
    const result = await setGamePrivacy(transportServing({ gameHidden: true, friendsLeagueOptOut: false }, calls), 'req-12345678', { gameHidden: true });
    expect(result).toEqual({ ok: true, data: { gameHidden: true, friendsLeagueOptOut: false } });
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(calls[0]?.url).toBe('https://gate.test/api/v1/me/game/privacy');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ requestId: 'req-12345678', gameHidden: true });
  });
});

describe('le jeu d’un autre', () => {
  test('GET /users/:userId/game : le chemin porte l’identifiant encodé, le niveau, le rang et le palier sont lus', async () => {
    const calls: Call[] = [];
    const body = { visible: true, standing, treasury: { tier: 'coffre' } };
    const result = await fetchUserGame(transportServing(body, calls), 'u 1');
    expect(result).toEqual({ ok: true, data: body });
    expect(calls[0]?.url).toBe('https://gate.test/api/v1/users/u%201/game');
  });

  test('un refus est une VALEUR (visible: false, deux blocs nuls), jamais une erreur', async () => {
    const closed = { visible: false, standing: null, treasury: null };
    expect(await fetchUserGame(transportServing(closed), 'u1')).toEqual({ ok: true, data: closed });
  });

  test('Mythe n’a pas de division, la Flamme éteinte et le trésor vide sont nuls', async () => {
    const body = { visible: true, standing: { ...standing, rank: 'mythe', division: null, flame: null }, treasury: { tier: null } };
    expect((await fetchUserGame(transportServing(body), 'u1')).ok).toBe(true);
  });

  test('la division à cinq crans et la place du Mythe sont lues ; un serveur qui ne les sert pas reste lu (#9636)', async () => {
    const mythe = { visible: true, standing: { ...standing, rank: 'mythe', division: null, division5: null, mythic: { number: 12, edition: 40 } }, treasury: null };
    expect(await fetchUserGame(transportServing(mythe), 'u1')).toEqual({ ok: true, data: mythe });
    expect((await fetchUserGame(transportServing({ visible: true, standing: { ...standing, division5: 4 }, treasury: null }), 'u1')).ok).toBe(true);
    for (const bad of [{ ...standing, division5: 0 }, { ...standing, mythic: { number: 0, edition: 1 } }, { ...standing, mythic: { number: 1 } }]) {
      expect((await fetchUserGame(transportServing({ visible: true, standing: bad, treasury: null }), 'u1')).ok).toBe(false);
    }
  });

  test('un niveau hors 1..100, un palier ou un rang inconnu : refusé ENTIER', async () => {
    for (const bad of [{ ...standing, level: 101 }, { ...standing, tier: 'cosmos' }, { ...standing, rank: 'dieu' }, { ...standing, division: 4 }, { ...standing, prestige: 6 }, { ...standing, flame: 'volcan' }]) {
      const result = await fetchUserGame(transportServing({ visible: true, standing: bad, treasury: null }), 'u1');
      expect(result.ok).toBe(false);
    }
    expect((await fetchUserGame(transportServing({ visible: true, standing, treasury: { tier: 'banque' } }), 'u1')).ok).toBe(false);
  });
});

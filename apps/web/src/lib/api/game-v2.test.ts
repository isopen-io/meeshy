import { describe, expect, test } from 'bun:test';

import { GAME_ROUTES } from '@meeshy/shared/types/game-routes';

import { readGameBlock } from './game';
import { gameBlockFixture, gameBlockWithExtrasFixture } from './game-fixture';
import {
  abandonDuo,
  acceptDuo,
  buySeasonSeal,
  claimSeasonStep,
  fetchLeagueFriends,
  fetchLeagueWeek,
  fetchUserShowcase,
  inviteToDuo,
  passToPrestige,
  readGameExtensions,
  setGameVisibility,
  setLeagueConsent,
  setLeaguePseudonym,
  setShowcaseOrder,
} from './game-v2';
import { createHttpTransport } from './http';

/**
 * LE PORT DE LA VAGUE 2 (#9384 à #9392) — les sept extensions du bloc `game`,
 * lues chacune SEULE, et les treize routes avec leur verbe, leur chemin et
 * leur `requestId`.
 */

type Call = { readonly url: string; readonly init: RequestInit | undefined };

function transportServing(body: unknown, calls: Call[] = []) {
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return createHttpTransport({ base: 'https://gate.test', credential: () => ({ kind: 'registered', token: 'jwt-test' }), fetchImpl, timeoutMs: 0 });
}

const bodyOf = (call: Call | undefined): unknown => JSON.parse(String(call?.init?.body ?? 'null'));

describe('les extensions du bloc game', () => {
  const block = gameBlockWithExtrasFixture();

  test('un serveur de la vague 2 : les sept extensions sont lues telles quelles', () => {
    const read = readGameBlock(block);
    expect(read?.league).toEqual(block.league);
    expect(read?.duo).toEqual(block.duo);
    expect(read?.season).toEqual(block.season);
    expect(read?.trophies).toEqual(block.trophies);
    expect(read?.atlas).toEqual(block.atlas);
    expect(read?.prestige).toEqual(block.prestige);
    expect(read?.visibility).toEqual(block.visibility);
  });

  test('un ancien serveur : le bloc est lu SANS extension, rien n’est deviné', () => {
    const read = readGameBlock(gameBlockFixture());
    expect(read).not.toBeNull();
    expect(Object.keys(read ?? {})).not.toContain('league');
    expect(Object.keys(read ?? {})).not.toContain('season');
  });

  test('une extension illisible tombe SEULE : le bloc et les autres extensions survivent', () => {
    const read = readGameBlock({ ...block, league: { ...block.league, access: 'vip' } });
    expect(read).not.toBeNull();
    expect(read?.league).toBeUndefined();
    expect(read?.duo).toEqual(block.duo);
    expect(read?.level).toEqual(block.level);
  });

  test('la saison peut être null (aucune saison ouverte) : c’est une valeur, pas une panne', () => {
    expect(readGameExtensions({ season: null })).toEqual({ season: null });
  });

  test('une saison illisible tombe seule, une étape hors du parcours la refuse', () => {
    const bad = { ...block.season, claimedSteps: [41] };
    expect(readGameExtensions({ season: bad })).toEqual({});
  });

  test('une visibilité inconnue refuse le bloc de visibilité', () => {
    expect(readGameExtensions({ visibility: { showcase: 'friends', rank: 'friends', treasury: 'friends', atlas: 'public' } })).toEqual({});
  });
});

describe('les lectures', () => {
  test('le classement de la semaine : GET, entrées lues', async () => {
    const calls: Call[] = [];
    const week = { weekKey: '2026-10-05', snapshotDay: '2026-10-05', closes: { dayKey: '2026-10-11', minuteOfDay: 1200 }, placed: true, league: 'jade', groupId: 'g', entries: [{ rank: 1, displayName: 'Colibri-1', weekPoints: 10, zone: 'promotion', cup: 'gold', isMe: false }] };
    const result = await fetchLeagueWeek(transportServing(week, calls));
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(`https://gate.test/api/v1${GAME_ROUTES.leagueWeek}`);
    expect(calls[0]?.init?.method).toBe('GET');
  });

  test('un classement dont une entrée est illisible est refusé ENTIER', async () => {
    const week = { weekKey: '2026-10-05', snapshotDay: '2026-10-05', closes: { dayKey: '2026-10-11', minuteOfDay: 1200 }, placed: true, league: 'jade', groupId: 'g', entries: [{ rank: 0 }] };
    const result = await fetchLeagueWeek(transportServing(week));
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('MALFORMED_PAYLOAD');
  });

  test('la ligue Amis : GET', async () => {
    const calls: Call[] = [];
    const friends = { weekKey: '2026-10-05', closes: { dayKey: '2026-10-11', minuteOfDay: 1200 }, entries: [{ rank: 1, userId: 'u1', weekPoints: 5, isMe: true }] };
    expect((await fetchLeagueFriends(transportServing(friends, calls))).ok).toBe(true);
    expect(calls[0]?.url).toContain(GAME_ROUTES.leagueFriends);
  });

  test('la vitrine d’un autre : le chemin porte l’identifiant, une vitrine fermée est une valeur', async () => {
    const calls: Call[] = [];
    const result = await fetchUserShowcase(transportServing({ visible: false, items: [], order: [] }, calls), 'u 1');
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe('https://gate.test/api/v1/users/u%201/game/showcase');
  });
});

describe('les écritures', () => {
  test('consentir à la ligue : POST avec le pseudonyme choisi', async () => {
    const calls: Call[] = [];
    const result = await setLeagueConsent(transportServing({ consent: true, pseudonym: 'Colibri-4821' }, calls), { requestId: 'req-12345678', consent: true, pseudonym: 'Colibri-4821' });
    expect(result.ok).toBe(true);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(bodyOf(calls[0])).toEqual({ requestId: 'req-12345678', consent: true, pseudonym: 'Colibri-4821' });
  });

  test('retirer son consentement : aucun pseudonyme n’est envoyé', async () => {
    const calls: Call[] = [];
    await setLeagueConsent(transportServing({ consent: false, pseudonym: null }, calls), { requestId: 'req-12345678', consent: false });
    expect(bodyOf(calls[0])).toEqual({ requestId: 'req-12345678', consent: false });
  });

  test('le pseudonyme : PUT', async () => {
    const calls: Call[] = [];
    await setLeaguePseudonym(transportServing({ pseudonym: 'Aigrette-77' }, calls), 'req-12345678', 'Aigrette-77');
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(calls[0]?.url).toContain(GAME_ROUTES.leaguePseudonym);
  });

  test('le duo : inviter, accepter, quitter — les chemins portent le duoId', async () => {
    const calls: Call[] = [];
    await inviteToDuo(transportServing({ status: 'invited', duoId: 'd1', weekKey: '2026-10-05' }, calls), 'req-12345678', 'friend-1');
    await acceptDuo(transportServing({ status: 'active', duoId: 'd1' }, calls), 'req-12345678', 'd1');
    await abandonDuo(transportServing({ status: 'abandoned', duoId: 'd1' }, calls), 'req-12345678', 'd1');
    expect(calls.map((c) => c.url.replace('https://gate.test/api/v1', ''))).toEqual(['/me/game/duo/invite', '/me/game/duo/d1/accept', '/me/game/duo/d1/abandon']);
    expect(bodyOf(calls[0])).toEqual({ requestId: 'req-12345678', friendId: 'friend-1' });
  });

  test('la saison : réclamer une étape, acheter le Sceau', async () => {
    const calls: Call[] = [];
    const claim = { status: 'claimed', step: 4, reward: { kind: 'points', amount: 100 }, seal: null, completed: false, gloryGained: 0, score: 1300 };
    expect((await claimSeasonStep(transportServing(claim, calls), 'req-12345678', 4)).ok).toBe(true);
    expect((await buySeasonSeal(transportServing({ status: 'bought', balance: 3 }, calls), 'req-12345678')).ok).toBe(true);
    expect(calls.map((c) => c.url.replace('https://gate.test/api/v1', ''))).toEqual(['/me/game/season/steps/4/claim', '/me/game/season/seal']);
  });

  test('la vitrine : l’ordre et la visibilité sont des PUT', async () => {
    const calls: Call[] = [];
    await setShowcaseOrder(transportServing({ order: ['flame:100'] }, calls), 'req-12345678', ['flame:100']);
    await setGameVisibility(
      transportServing({ visibility: { showcase: 'me', rank: 'friends', treasury: 'friends', atlas: 'me' } }, calls),
      'req-12345678',
      { showcase: 'me' },
    );
    expect(calls.map((c) => c.init?.method)).toEqual(['PUT', 'PUT']);
    expect(bodyOf(calls[1])).toEqual({ requestId: 'req-12345678', showcase: 'me' });
  });

  test('le Prestige : POST ; une réponse qui ne remet pas le niveau à 1 est refusée', async () => {
    const calls: Call[] = [];
    const ok = { status: 'passed', prestige: 1, score: 0, level: 1, gloryGained: 1000, trophyKey: 'prestige:1' };
    expect((await passToPrestige(transportServing(ok, calls), 'req-12345678')).ok).toBe(true);
    expect((await passToPrestige(transportServing({ ...ok, level: 7 }), 'req-12345678')).ok).toBe(false);
    expect(calls[0]?.url).toContain(GAME_ROUTES.prestige);
  });
});

/**
 * @jest-environment node
 *
 * #10500 — l'ENVELOPPE v2 de `POST /social/events` : lecture événement par
 * événement (`ignored`), identifiant d'événement (un rejeu ne compte rien),
 * horloge corrigée (Snowplow), annonce de version — et la non-régression
 * d'un ancien client, qui n'envoie ni contexte ni identifiant.
 *
 * Les témoins passent par la VRAIE porte et lisent ce qui a été ÉCRIT.
 */
import { describe, it, expect, jest } from '@jest/globals';
import {
  reachHarness, sendReach, sendReachV2, visitorHeader, viewEvent, impressionEvent,
} from '../../../helpers/reach-harness';

jest.mock('../../../../services/PostService', () => ({ PostService: jest.fn() }));
jest.mock('../../../../services/MediaService', () => ({ MediaService: jest.fn() }));

const POST = '507f1f77bcf86cd799439011';
const READER = '507f1f77bcf86cd7994390ff';
const account = { authorization: `Bearer ${READER}` };
const EVENT_A = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';
const EVENT_B = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6c';

const dataOf = (res: { payload: string }) => JSON.parse(res.payload).data;
const scroll = (extra: Record<string, unknown> = {}) => ({
  type: 'scroll',
  action: 'listing',
  surface: 'feed',
  listingSessionId: '7f1c2b9e-1d2a-4c55-9a1e-0a4b5c6d7e8f',
  itemsRendered: 12,
  ...extra,
});

describe('lecture événement par événement — un type inconnu n’emporte plus le lot', () => {
  it('[type inconnu, view] ⇒ la vue est écrite et `ignored: 1` (un ancien serveur rendait 400)', async () => {
    const h = await reachHarness([{ id: POST }]);
    const res = await sendReach(h.app, [{ type: 'teleportation', postId: POST }, viewEvent(POST)], account);

    expect(res.statusCode).toBe(200);
    expect(dataOf(res)).toMatchObject({ recorded: 1, rejected: 0, ignored: 1 });
    expect(h.store.read(POST)).toMatchObject({ viewCount: 1 });
    await h.app.close();
  });

  it('un événement de comptage invalide (id malformé) est ignoré, ses voisins comptent', async () => {
    const h = await reachHarness([{ id: POST }]);
    const res = await sendReach(h.app, [impressionEvent('pas-un-id'), impressionEvent(POST)], account);

    expect(dataOf(res)).toMatchObject({ recorded: 1, rejected: 0, ignored: 1 });
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 1 });
    await h.app.close();
  });

  it('la FORME du lot reste gardée : `events` qui n’est pas un tableau ⇒ 400', async () => {
    const h = await reachHarness([{ id: POST }]);
    const res = await h.app.inject({ method: 'POST', url: '/social/events', headers: account, payload: { events: 'non' } });

    expect(res.statusCode).toBe(400);
    await h.app.close();
  });
});

describe('eventId — un rejeu ne compte rien de plus', () => {
  it('deux envois de la même impression ⇒ une ligne, un incrément, et `recorded` les deux fois', async () => {
    const h = await reachHarness([{ id: POST }]);
    const first = await sendReach(h.app, [impressionEvent(POST, { eventId: EVENT_A })], account);
    const replay = await sendReach(h.app, [impressionEvent(POST, { eventId: EVENT_A })], account);

    expect(dataOf(first)).toMatchObject({ recorded: 1 });
    expect(dataOf(replay)).toMatchObject({ recorded: 1 });
    expect(h.impressions).toHaveLength(1);
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 1 });
    await h.app.close();
  });

  it('la même impression deux fois dans UN lot ⇒ une ligne, un incrément', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [impressionEvent(POST, { eventId: EVENT_A }), impressionEvent(POST, { eventId: EVENT_A })], account);

    expect(h.impressions).toHaveLength(1);
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 1 });
    await h.app.close();
  });

  it('deux impressions d’eventId DIFFÉRENTS comptent deux fois — chaque listing compte', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [impressionEvent(POST, { eventId: EVENT_A }), impressionEvent(POST, { eventId: EVENT_B })], account);

    expect(h.store.read(POST)).toMatchObject({ impressionCount: 2 });
    await h.app.close();
  });

  it('une vue rejouée ne monte pas viewCount deux fois', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [viewEvent(POST, { eventId: EVENT_A })], account);
    const replay = await sendReach(h.app, [viewEvent(POST, { eventId: EVENT_A })], account);

    expect(dataOf(replay)).toMatchObject({ recorded: 1 });
    expect(h.store.read(POST)).toMatchObject({ viewCount: 1 });
    await h.app.close();
  });

  it('une vue anonyme rejouée ne monte pas viewCount deux fois', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [viewEvent(POST, { eventId: EVENT_A })], visitorHeader(1));
    await sendReach(h.app, [viewEvent(POST, { eventId: EVENT_A })], visitorHeader(1));

    expect(h.store.read(POST)).toMatchObject({ viewCount: 1 });
    await h.app.close();
  });

  it('l’eventId BRUT n’est rangé nulle part — seule sa clé HMAC l’est', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [impressionEvent(POST, { eventId: EVENT_A }), viewEvent(POST, { eventId: EVENT_B })], account);

    expect(JSON.stringify(h.writes)).not.toContain(EVENT_A);
    expect(JSON.stringify(h.writes)).not.toContain(EVENT_B);
    expect(h.impressions[0].eventKey).toMatch(/^[0-9a-f]{64}$/);
    await h.app.close();
  });
});

describe('horloge — derivedAt = receivedAt − (sentAt − occurredAt)', () => {
  it('un appareil en avance de 2 h : l’événement est daté de son âge réel, pas de l’heure de l’appareil', async () => {
    const h = await reachHarness([{ id: POST }]);
    const now = Date.now();
    const deviceOffset = 2 * 60 * 60 * 1000;
    await sendReachV2(h.app, [scroll({ occurredAt: new Date(now + deviceOffset - 10_000).toISOString() })], visitorHeader(1), {
      sentAt: new Date(now + deviceOffset).toISOString(),
    });

    const derivedAt = Date.parse((h.contentEvents[0].derivedAt as { $date: string }).$date);
    expect(Math.abs(derivedAt - (now - 10_000))).toBeLessThan(3_000);
    expect(h.contentEvents[0].clockSkewed).toBeUndefined();
    await h.app.close();
  });

  it('un événement v2 de plus de 72 h est ignoré ; le COMPTAGE du même âge compte (#10553)', async () => {
    const h = await reachHarness([{ id: POST }]);
    const now = Date.now();
    const res = await sendReachV2(h.app, [
      scroll({ occurredAt: new Date(now - 73 * 60 * 60 * 1000).toISOString() }),
      impressionEvent(POST, { occurredAt: new Date(now - 73 * 60 * 60 * 1000).toISOString() }),
    ], visitorHeader(1), { sentAt: new Date(now).toISOString() });

    expect(dataOf(res)).toMatchObject({ recorded: 1, ignored: 1 });
    expect(h.contentEvents.filter((row) => row.type === 'scroll')).toHaveLength(0);
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 1 });
    await h.app.close();
  });

  it('un événement « du futur » (> 5 min) est ramené à la réception et marqué clockSkewed', async () => {
    const h = await reachHarness([{ id: POST }]);
    const now = Date.now();
    await sendReachV2(h.app, [scroll({ occurredAt: new Date(now + 60 * 60 * 1000).toISOString() })], visitorHeader(1), {
      sentAt: new Date(now).toISOString(),
    });

    expect(h.contentEvents[0].clockSkewed).toBe(true);
    await h.app.close();
  });
});

describe('annonce — le serveur v2 dit ce qu’il accepte', () => {
  it('pose X-Social-Events-Version: 2 et data.accepts (types v2 compris), data.sampling', async () => {
    const h = await reachHarness([{ id: POST }]);
    const res = await sendReach(h.app, [impressionEvent(POST)], account);

    expect(res.headers['x-social-events-version']).toBe('2');
    expect(dataOf(res).accepts).toEqual(expect.arrayContaining(['impression', 'view', 'scroll', 'screen_capture']));
    expect(dataOf(res).sampling).toMatchObject({ scroll: 1, playback: 1, visibility: 1 });
    await h.app.close();
  });

  it('un ANCIEN client (ni contexte, ni eventId) compte exactement comme avant', async () => {
    const h = await reachHarness([{ id: POST }]);
    const res = await sendReach(h.app, [impressionEvent(POST, { source: 'feed' }), viewEvent(POST)], account);

    expect(dataOf(res)).toMatchObject({ recorded: 2, rejected: 0, ignored: 0 });
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 1, viewCount: 1 });
    expect(h.impressions).toEqual([expect.objectContaining({ postId: POST, source: 'feed' })]);
    expect(h.contentEvents).toHaveLength(0);
    await h.app.close();
  });
});

describe('contexte de listing et visibilité MRC sur l’impression (#10501)', () => {
  const listed = (viewable: boolean, eventId?: string) => impressionEvent(POST, {
    source: 'feed',
    surface: 'feed',
    ...(eventId ? { eventId } : {}),
    listing: { feedRequestId: 'fr_page1', position: 3, rankingSource: 'for_you' },
    visibility: { maxVisibleFraction: viewable ? 0.8 : 0.2, visibleMs: viewable ? 1400 : 300, viewable },
  });

  it('avec consentement, une impression en position 3, visible au sens MRC, porte son rang et sa visibilité sur sa ligne', async () => {
    const h = await reachHarness([{ id: POST }], undefined, { consentedUserIds: [READER] });
    await sendReachV2(h.app, [listed(true)], account, { platform: 'web', appSessionId: '5e1c2b9e-1d2a-4c55-9a1e-0a4b5c6d7e8f' });

    expect(h.impressions[0]).toMatchObject({
      position: 3, rankingSource: 'for_you', viewable: true, visibleFraction: 0.8, visibleMs: 1400, platform: 'web',
    });
    await h.app.close();
  });

  it('sans consentement d’analyse, la ligne garde son lecteur et sa mesure (#10785) — rien qui la relie à une page ou à une session', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReachV2(h.app, [listed(true)], account, { platform: 'web', appSessionId: '5e1c2b9e-1d2a-4c55-9a1e-0a4b5c6d7e8f' });

    const row = h.impressions[0];
    expect(row).toMatchObject({ postId: POST, source: 'feed', userId: READER, position: 3, viewable: true, platform: 'web' });
    for (const field of ['readerKey', 'feedRequestId', 'appSessionId']) {
      expect(row[field]).toBeUndefined();
    }
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 1 });
    await h.app.close();
  });

  it('avec consentement, la page et la session sont rangées aussi — par le chemin à clé comme par l’autre', async () => {
    const h = await reachHarness([{ id: POST }], undefined, { consentedUserIds: [READER] });
    await sendReachV2(h.app, [listed(true), listed(true, EVENT_A)], account, { appSessionId: '5e1c2b9e-1d2a-4c55-9a1e-0a4b5c6d7e8f' });

    expect(h.impressions).toHaveLength(2);
    h.impressions.forEach((row) => expect(row).toMatchObject({ feedRequestId: 'fr_page1', appSessionId: '5e1c2b9e-1d2a-4c55-9a1e-0a4b5c6d7e8f' }));
    await h.app.close();
  });

  it('impressionCount monte de 1 par listing, visible ou non — la règle de comptage ne change pas', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReachV2(h.app, [listed(true), listed(false)], account);

    expect(h.store.read(POST)).toMatchObject({ impressionCount: 2 });
    await h.app.close();
  });

  it('un refus déclaré par le client ne laisse que le comptage', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReachV2(h.app, [listed(true)], account, { consent: 'denied', platform: 'ios' });

    expect(h.impressions[0].position).toBeUndefined();
    expect(h.impressions[0].viewable).toBeUndefined();
    expect(h.impressions[0].platform).toBeUndefined();
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 1 });
    await h.app.close();
  });
});

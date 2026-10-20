/**
 * @jest-environment node
 *
 * #10483 — la RÈGLE DE COMPTAGE du porteur (2026-10-13).
 *
 *  - Une impression compte CHAQUE fois que le contenu est listé : aucun
 *    dédoublonnage temporel, ni pour un compte ni pour un anonyme.
 *  - `viewCount` compte le TOTAL des vues ; les vues UNIQUES par jeton
 *    s'additionnent à part (`uniqueViewCount`, dont `anonymousUniqueViewCount`).
 *  - Pas de plafond bas par adresse : une famille, une entreprise, un
 *    incubateur partagent une IP. Débit par jeton (60 événements/min), plafond
 *    ÉLEVÉ par empreinte d'adresse (600 événements/min), et un agrégat
 *    quotidien par empreinte pour le repérage manuel — jamais l'IP en clair.
 *
 * Les témoins passent par la vraie porte et lisent ce qui a été ÉCRIT.
 */
import { describe, it, expect, jest } from '@jest/globals';
import {
  reachHarness, sendReach, visitorHeader, viewEvent, impressionEvent,
} from '../../../helpers/reach-harness';
import { readAddressActivity, addressActivityDay } from '../../../../routes/social/addressActivity';
import { addressFingerprintOf } from '../../../../utils/address-fingerprint';

jest.mock('../../../../services/PostService', () => ({ PostService: jest.fn() }));
jest.mock('../../../../services/MediaService', () => ({ MediaService: jest.fn() }));

const POST = '507f1f77bcf86cd799439011';
const ROOT = '507f1f77bcf86cd799439013';
const REPOST = '507f1f77bcf86cd799439014';
const READER = '507f1f77bcf86cd7994390ff';
const account = { authorization: `Bearer ${READER}` };

const times = async (n: number, run: (i: number) => Promise<unknown>) => {
  for (let i = 0; i < n; i += 1) await run(i);
};

describe('Vues — le total compte chaque ouverture, l’unique s’enregistre à part', () => {
  it('un même jeton anonyme qui revoit 5 fois ⇒ viewCount +5, uniqueViewCount +1', async () => {
    const h = await reachHarness([{ id: POST }]);
    await times(5, () => sendReach(h.app, [viewEvent(POST)], visitorHeader(1)));

    expect(h.store.read(POST)).toMatchObject({
      viewCount: 5,
      anonymousViewCount: 5,
      uniqueViewCount: 1,
      anonymousUniqueViewCount: 1,
    });
    expect(h.opens).toHaveLength(1);
    await h.app.close();
  });

  it('un même compte qui revoit 5 fois ⇒ viewCount +5, uniqueViewCount +1, une ligne PostView', async () => {
    const h = await reachHarness([{ id: POST }]);
    await times(5, () => sendReach(h.app, [viewEvent(POST)], account));

    expect(h.store.read(POST)).toMatchObject({ viewCount: 5, uniqueViewCount: 1 });
    expect(h.store.read(POST)?.anonymousUniqueViewCount ?? 0).toBe(0);
    expect(h.postViews).toHaveLength(1);
    await h.app.close();
  });

  it('chaque vue répétée d’un repost crédite aussi la racine au total', async () => {
    const h = await reachHarness([{ id: ROOT }, { id: REPOST, repostOfId: ROOT, originalRepostOfId: ROOT }]);
    await times(3, () => sendReach(h.app, [viewEvent(REPOST)], visitorHeader(1)));

    expect(h.store.read(ROOT)).toMatchObject({ viewCount: 3, uniqueViewCount: 1 });
    await h.app.close();
  });

  it('30 jetons derrière UNE adresse, 10 ouvertures chacun ⇒ 300 vues comptées, 30 uniques', async () => {
    const h = await reachHarness([{ id: POST }]);
    const statuts: number[] = [];
    await times(300, async (i) => {
      statuts.push((await sendReach(h.app, [viewEvent(POST)], visitorHeader(i % 30), '198.51.100.23')).statusCode);
    });

    expect(statuts.every((s) => s === 200)).toBe(true);
    expect(h.store.read(POST)).toMatchObject({ viewCount: 300, uniqueViewCount: 30, anonymousUniqueViewCount: 30 });
    await h.app.close();
  });

  it('la surface d’une vue de compte est rangée sur sa ligne PostView', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [viewEvent(POST, { surface: 'reels' })], account);

    expect(h.postViews).toEqual([expect.objectContaining({ postId: POST, userId: READER, surface: 'reels' })]);
    await h.app.close();
  });
});

describe('Impressions — chaque listage compte, sans fenêtre', () => {
  it('5 impressions d’un même jeton anonyme en une minute ⇒ +5', async () => {
    const h = await reachHarness([{ id: POST }]);
    await times(5, () => sendReach(h.app, [impressionEvent(POST)], visitorHeader(1)));

    expect(h.store.read(POST)).toMatchObject({ impressionCount: 5, anonymousImpressionCount: 5 });
    await h.app.close();
  });

  it('le même post listé deux fois dans un lot anonyme ⇒ +2', async () => {
    const h = await reachHarness([{ id: POST }]);
    const res = await sendReach(h.app, [impressionEvent(POST), impressionEvent(POST)], visitorHeader(1));

    expect(JSON.parse(res.payload).data).toMatchObject({ recorded: 2, rejected: 0 });
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 2, anonymousImpressionCount: 2 });
    await h.app.close();
  });

  it('5 impressions d’un même compte en une minute ⇒ +5', async () => {
    const h = await reachHarness([{ id: POST }]);
    await times(5, () => sendReach(h.app, [impressionEvent(POST)], account));

    expect(h.store.read(POST)?.impressionCount).toBe(5);
    await h.app.close();
  });
});

describe('Impressions de l’auteur — une seule fois par contenu (#11037)', () => {
  const AUTHOR = '507f1f77bcf86cd7994390aa';
  const asAuthor = { authorization: `Bearer ${AUTHOR}` };

  it('l’auteur qui voit 5 fois son post ⇒ +1, une seule ligne', async () => {
    const h = await reachHarness([{ id: POST, authorId: AUTHOR }]);
    await times(5, () => sendReach(h.app, [impressionEvent(POST, { source: 'story', surface: 'story_rail' })], asAuthor));

    expect(h.store.read(POST)?.impressionCount).toBe(1);
    expect(h.impressions).toHaveLength(1);
    await h.app.close();
  });

  it('l’auteur qui voit son post deux fois dans un lot ⇒ +1', async () => {
    const h = await reachHarness([{ id: POST, authorId: AUTHOR }]);
    await sendReach(h.app, [impressionEvent(POST), impressionEvent(POST, { eventId: '11111111-1111-4111-8111-111111111111' })], asAuthor);

    expect(h.store.read(POST)?.impressionCount).toBe(1);
    await h.app.close();
  });

  it('l’auteur qui ouvre le détail de son post ⇒ aucune ouverture comptée', async () => {
    const h = await reachHarness([{ id: POST, authorId: AUTHOR }]);
    await sendReach(h.app, [impressionEvent(POST, { source: 'detail' })], asAuthor);

    expect(h.store.read(POST)?.postOpenCount ?? 0).toBe(0);
    await h.app.close();
  });

  it('un autre lecteur du même post compte toujours chaque affichage', async () => {
    const h = await reachHarness([{ id: POST, authorId: AUTHOR }]);
    await times(3, () => sendReach(h.app, [impressionEvent(POST)], asAuthor));
    await times(4, () => sendReach(h.app, [impressionEvent(POST)], account));

    expect(h.store.read(POST)?.impressionCount).toBe(5);
    await h.app.close();
  });
});

describe('Ouvertures — un détail compte quelle que soit la source qui l’a ouvert', () => {
  it.each([
    ['detail', {}],
    ['notification', {}],
    ['shared_link', { surface: 'detail' }],
    ['shared_link', {}],
    ['notification', { surface: 'detail' }],
  ])('impression source=%s %j ⇒ postOpenCount +1', async (source, extra) => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [impressionEvent(POST, { source, ...extra })], account);

    expect(h.store.read(POST)?.postOpenCount).toBe(1);
    await h.app.close();
  });

  it.each([
    ['shared_link', { surface: 'citation' }],
    ['feed', {}],
    ['story', { surface: 'story_rail' }],
  ])('impression source=%s %j ⇒ aucune ouverture', async (source, extra) => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [impressionEvent(POST, { source, ...extra })], account);

    expect(h.store.read(POST)?.postOpenCount ?? 0).toBe(0);
    expect(h.store.read(POST)?.impressionCount).toBe(1);
    await h.app.close();
  });
});

describe('Surface — une valeur inconnue est ignorée, le lot passe', () => {
  it('un compte : 200, impression comptée, surface non rangée', async () => {
    const h = await reachHarness([{ id: POST }]);
    const res = await sendReach(h.app, [impressionEvent(POST, { surface: 'ailleurs' }), viewEvent(POST, { surface: 'demain' })], account);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toMatchObject({ recorded: 2, rejected: 0 });
    expect(h.impressions).toHaveLength(1);
    expect(h.impressions[0].surface ?? null).toBeNull();
    expect(h.postViews[0].surface ?? null).toBeNull();
    await h.app.close();
  });

  it('un anonyme : 200, impression comptée', async () => {
    const h = await reachHarness([{ id: POST }]);
    const res = await sendReach(h.app, [impressionEvent(POST, { surface: 'ailleurs' })], visitorHeader(1));

    expect(res.statusCode).toBe(200);
    expect(h.store.read(POST)?.impressionCount).toBe(1);
    await h.app.close();
  });
});

describe('Débit — par jeton en événements, plafond élevé par adresse', () => {
  it('un lot de 61 événements d’un même jeton ⇒ 60 comptés, puis 429', async () => {
    const h = await reachHarness([{ id: POST }]);
    const lot = Array.from({ length: 61 }, () => impressionEvent(POST));
    const premier = await sendReach(h.app, lot, visitorHeader(1));
    const second = await sendReach(h.app, [impressionEvent(POST)], visitorHeader(1));

    expect(JSON.parse(premier.payload).data).toMatchObject({ recorded: 60, rejected: 1 });
    expect(second.statusCode).toBe(429);
    expect(h.store.read(POST)?.impressionCount).toBe(60);
    await h.app.close();
  });

  it('une adresse plafonne à 600 événements par minute, quel que soit le nombre de jetons', async () => {
    const h = await reachHarness([{ id: POST }]);
    const lot = Array.from({ length: 50 }, () => impressionEvent(POST));
    const statuts: number[] = [];
    await times(13, async (i) => {
      statuts.push((await sendReach(h.app, lot, visitorHeader(i), '198.51.100.99')).statusCode);
    });

    expect(statuts.slice(0, 12).every((s) => s === 200)).toBe(true);
    expect(statuts[12]).toBe(429);
    expect(h.store.read(POST)?.impressionCount).toBe(600);
    expect(JSON.stringify(h.writes)).not.toContain('198.51.100.99');
    await h.app.close();
  });

  it('l’empreinte d’adresse ne dépend pas du navigateur', async () => {
    const h = await reachHarness([{ id: POST }]);
    const lot = Array.from({ length: 50 }, () => impressionEvent(POST));
    const statuts: number[] = [];
    await times(13, async (i) => {
      const res = await h.app.inject({
        method: 'POST', url: '/social/events', remoteAddress: '198.51.100.98',
        headers: { ...visitorHeader(i), 'user-agent': `Navigateur/${i}` }, payload: { events: lot },
      });
      statuts.push(res.statusCode);
    });

    expect(statuts[12]).toBe(429);
    await h.app.close();
  });

  it('l’agrégat du jour compte les événements par empreinte, sans l’adresse en clair', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [impressionEvent(POST), viewEvent(POST)], visitorHeader(1), '198.51.100.77');
    await sendReach(h.app, [impressionEvent(POST)], visitorHeader(2), '198.51.100.77');
    await sendReach(h.app, [impressionEvent(POST)], visitorHeader(3), '198.51.100.78');

    const now = Date.now();
    const activity = await readAddressActivity(h.app, { day: addressActivityDay(now) });
    const fingerprint = addressFingerprintOf({ ip: '198.51.100.77', now });

    expect(activity).toEqual(expect.arrayContaining([{ fingerprint, events: 3 }]));
    expect(activity[0]).toEqual({ fingerprint, events: 3 });
    expect(JSON.stringify(activity)).not.toContain('198.51.100');
    await h.app.close();
  });
});

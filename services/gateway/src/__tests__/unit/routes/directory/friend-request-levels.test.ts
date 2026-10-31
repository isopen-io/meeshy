/**
 * #13933 — demander un cran : Connaissance, Ami, Proche, Sang.
 *
 * Le serveur refuse tout saut de niveau (D-5 : aucune exception d'ancien client),
 * toute demande dont les conditions ne sont pas tenues (éligibilité de
 * rel-compteurs) et toute demande pendant un cool-down. Les témoins lisent l'ÉTAT
 * obtenu (lignes de demande, lien) dans un double en mémoire.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(async (args: { op: () => unknown }) => args.op()),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';
import {
  AUTRE, DAY, MOI, NOW, buildRelationApp, demande, freezeClock, lien, semaineActive, thawClock,
  type AppOptions,
} from '../../../helpers/relation-app';

const PREFIXE = '/api/v1/directory';
const LOW = MOI < AUTRE ? MOI : AUTRE;
const HIGH = MOI < AUTRE ? AUTRE : MOI;
const MOI_EST_LOW = MOI === LOW;

const envoyer = async (body: Record<string, unknown>, options: AppOptions = {}) => {
  const app = await buildRelationApp(async (a) => { await a.register(directoryFriendRequestsRoutes, { prefix: PREFIXE }); }, options);
  const res = await app.call('POST', `${PREFIXE}/friend-requests`, { receiverId: AUTRE, ...body });
  await app.close();
  return { ...res, store: app.store, notifier: app.notifier, emissions: app.emissions };
};

const semaines = (n: number) => Array.from({ length: n }, (_, i) => semaineActive(i, LOW, HIGH));

beforeEach(() => freezeClock(NOW));
afterEach(() => thawClock());

describe('#13933 — un cran à la fois', () => {
  it('Public -> Connaissance : la demande naît, avec son niveau visé', async () => {
    const { status, store, notifier } = await envoyer({ targetLevel: 'ACQUAINTANCE' });

    expect(status).toBe(201);
    expect(store.friendRequests()).toHaveLength(1);
    expect(store.friendRequests()[0]).toMatchObject({ senderId: MOI, receiverId: AUTRE, status: 'pending', targetLevel: 'ACQUAINTANCE' });
    expect(notifier.createFriendRequestNotification).toHaveBeenCalledTimes(1);
  });

  it('Connaissance -> Ami : acceptée sans éligibilité', async () => {
    const { status, store } = await envoyer({ targetLevel: 'FRIEND' }, { liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')] });

    expect(status).toBe(201);
    expect(store.friendRequests()[0]).toMatchObject({ targetLevel: 'FRIEND' });
  });

  it('une demande SANS niveau vaut Ami et suit la même loi : depuis Public c’est un saut', async () => {
    const { status, body, store } = await envoyer({});

    expect(status).toBe(409);
    expect(body.code).toBe('RELATION_PHASE_SKIP');
    expect(store.friendRequests()).toHaveLength(0);
  });

  it('une demande SANS niveau depuis Connaissance est une demande d’Ami', async () => {
    const { status, store } = await envoyer({}, { liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')] });

    expect(status).toBe(201);
    expect(store.friendRequests()[0].targetLevel ?? 'FRIEND').toBe('FRIEND');
  });

  it.each([
    ['Connaissance -> Proche', 'CLOSE', lien('ACQUAINTANCE', 'ACQUAINTANCE')],
    ['Ami -> Sang', 'BLOOD', lien('FRIEND', 'FRIEND')],
    ['Public -> Proche', 'CLOSE', null],
    ['Public -> Sang', 'BLOOD', null],
  ])('%s : RELATION_PHASE_SKIP, aucune ligne, aucune notification', async (_nom, targetLevel, row) => {
    const { status, body, store, notifier } = await envoyer({ targetLevel }, { liens: row ? [row] : [], jours: semaines(14) });

    expect(status).toBe(409);
    expect(body.code).toBe('RELATION_PHASE_SKIP');
    expect(store.friendRequests()).toHaveLength(0);
    expect(notifier.createFriendRequestNotification).not.toHaveBeenCalled();
  });

  it('redemander un niveau déjà atteint est aussi un saut de phase', async () => {
    const { status, body } = await envoyer({ targetLevel: 'FRIEND' }, { liens: [lien('FRIEND', 'FRIEND')] });

    expect(status).toBe(409);
    expect(body.code).toBe('RELATION_PHASE_SKIP');
  });

  it.each(['ATOM', 'PUBLIC', 'COMMUNITY', 'close', 'GOD', 7])('un niveau visé illisible (%s) est refusé 400 RELATION_LEVEL_INVALID', async (targetLevel) => {
    const { status, body, store } = await envoyer({ targetLevel });

    expect(status).toBe(400);
    expect(body.code).toBe('RELATION_LEVEL_INVALID');
    expect(store.friendRequests()).toHaveLength(0);
  });
});

describe('#13933 — les conditions de Proche et de Sang', () => {
  it('Ami -> Proche sans quatre semaines actives : RELATION_NOT_ELIGIBLE', async () => {
    const { status, body, store } = await envoyer({ targetLevel: 'CLOSE' }, { liens: [lien('FRIEND', 'FRIEND')], jours: semaines(3) });

    expect(status).toBe(409);
    expect(body.code).toBe('RELATION_NOT_ELIGIBLE');
    expect(store.friendRequests()).toHaveLength(0);
  });

  it('Ami -> Proche avec quatre semaines actives d’affilée : la demande part', async () => {
    const { status, store } = await envoyer({ targetLevel: 'CLOSE' }, { liens: [lien('FRIEND', 'FRIEND')], jours: semaines(4) });

    expect(status).toBe(201);
    expect(store.friendRequests()[0]).toMatchObject({ targetLevel: 'CLOSE' });
  });

  it('une semaine manquée remet la série à zéro : trois semaines, un trou, puis une — refusé', async () => {
    const jours = [semaineActive(0, LOW, HIGH), semaineActive(2, LOW, HIGH), semaineActive(3, LOW, HIGH), semaineActive(4, LOW, HIGH)];
    const { status, body } = await envoyer({ targetLevel: 'CLOSE' }, { liens: [lien('FRIEND', 'FRIEND')], jours });

    expect(status).toBe(409);
    expect(body.code).toBe('RELATION_NOT_ELIGIBLE');
  });

  it('Proche -> Sang : douze semaines depuis l’entrée en Proche — onze refusées, douze acceptées', async () => {
    const proche = lien('CLOSE', 'CLOSE', { levelSince: new Date(NOW.getTime() - 200 * DAY) });
    const onze = await envoyer({ targetLevel: 'BLOOD' }, { liens: [proche], jours: semaines(11) });
    const douze = await envoyer({ targetLevel: 'BLOOD' }, { liens: [proche], jours: semaines(12) });

    expect(onze.status).toBe(409);
    expect(onze.body.code).toBe('RELATION_NOT_ELIGIBLE');
    expect(douze.status).toBe(201);
    expect(douze.store.friendRequests()[0]).toMatchObject({ targetLevel: 'BLOOD' });
  });

  it('les semaines d’AVANT l’entrée en Proche ne comptent pas pour le Sang', async () => {
    const proche = lien('CLOSE', 'CLOSE', { levelSince: new Date(NOW.getTime() - 14 * DAY) });
    const { status, body } = await envoyer({ targetLevel: 'BLOOD' }, { liens: [proche], jours: semaines(14) });

    expect(status).toBe(409);
    expect(body.code).toBe('RELATION_NOT_ELIGIBLE');
  });

  it('un âge déclaré mineur ne change rien : le Sang est ouvert à tous (décision porteur 2026-10-31)', async () => {
    const proche = lien('CLOSE', 'CLOSE', { levelSince: new Date(NOW.getTime() - 200 * DAY) });
    const { status } = await envoyer({ targetLevel: 'BLOOD' }, {
      liens: [proche], jours: semaines(12), naissances: { [MOI]: new Date('2012-01-01'), [AUTRE]: new Date('1990-01-01') },
    });

    expect(status).toBe(201);
  });
});

describe('#13933 — le cool-down de 30 jours', () => {
  const cooldown = (until: Date) => (MOI_EST_LOW ? { cooldownLowUntil: until } : { cooldownHighUntil: until });

  it('un cool-down de l’ÉMETTEUR en cours : RELATION_COOLDOWN', async () => {
    const { status, body, store } = await envoyer({ targetLevel: 'FRIEND' }, {
      liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE', cooldown(new Date(NOW.getTime() + 5 * DAY)))],
    });

    expect(status).toBe(409);
    expect(body.code).toBe('RELATION_COOLDOWN');
    expect(store.friendRequests()).toHaveLength(0);
  });

  it('le cool-down de l’AUTRE ne retient pas l’émetteur', async () => {
    const autre = MOI_EST_LOW ? { cooldownHighUntil: new Date(NOW.getTime() + 5 * DAY) } : { cooldownLowUntil: new Date(NOW.getTime() + 5 * DAY) };
    const { status } = await envoyer({ targetLevel: 'FRIEND' }, { liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE', autre)] });

    expect(status).toBe(201);
  });

  it('un cool-down échu ne fait pas lire le refus : la demande refusée retient la nouvelle comme une demande en attente, l’émetteur la retire pour redemander (audit #13933)', async () => {
    const ancienne = demande('cccccccccccccccccccccccc', 'rejected', MOI, AUTRE, { targetLevel: 'FRIEND' });
    const { status, store } = await envoyer({ targetLevel: 'FRIEND' }, {
      liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE', cooldown(new Date(NOW.getTime() - DAY)))], demandes: [ancienne],
    });

    expect(status).toBe(409);
    expect(store.friendRequests()).toEqual([expect.objectContaining({ id: 'cccccccccccccccccccccccc', status: 'rejected' })]);
  });
});

describe('#13933 — ce qui reste de l’ancienne loi', () => {
  it('une demande EN ATTENTE entre les deux, dans un sens ou dans l’autre, refuse la nouvelle (même message que le blocage)', async () => {
    const entrante = demande('dddddddddddddddddddddddd', 'pending', AUTRE, MOI, { targetLevel: 'FRIEND' });
    const { status, store } = await envoyer({ targetLevel: 'FRIEND' }, { liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')], demandes: [entrante] });

    expect(status).toBe(409);
    expect(store.friendRequests()).toHaveLength(1);
  });

  it('une demande ACCEPTÉE d’un cran inférieur ne retient pas la suivante', async () => {
    const acceptee = demande('eeeeeeeeeeeeeeeeeeeeeeee', 'accepted', MOI, AUTRE, { targetLevel: 'FRIEND' });
    const { status } = await envoyer({ targetLevel: 'CLOSE' }, { liens: [lien('FRIEND', 'FRIEND')], demandes: [acceptee], jours: semaines(4) });

    expect(status).toBe(201);
  });

  it('un blocage refuse comme avant, sans dire pourquoi', async () => {
    const { status, store } = await envoyer({ targetLevel: 'ACQUAINTANCE' }, { bloques: [MOI] });

    expect(status).toBe(409);
    expect(store.friendRequests()).toHaveLength(0);
  });

  it('un client sous le plancher de version reçoit 426 UPGRADE_REQUIRED, la demande n’est pas créée', async () => {
    process.env.MIN_APP_VERSION = '9.0.0';
    try {
      const { status, body, store } = await envoyer({ targetLevel: 'ACQUAINTANCE' }, {
        headers: { 'x-app-version': '1.0.0', 'x-app-platform': 'ios' },
      });

      expect(status).toBe(426);
      expect(body.code).toBe('UPGRADE_REQUIRED');
      expect(store.friendRequests()).toHaveLength(0);
    } finally {
      delete process.env.MIN_APP_VERSION;
    }
  });
});

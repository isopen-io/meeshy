/**
 * #19539 — une baisse ou une rupture qui retire la présence à un lecteur la lui
 * RETIRE aussi : l'audience de `user:status` exclut l'ancien Ami dès la baisse, donc
 * plus aucune transition ne lui parvient, et sans charge de retrait il garde la
 * pastille verte jusqu'à sa propre reconnexion.
 *
 * La charge est ce que la loi sert DÉSORMAIS, dans les deux sens de la paire :
 * sous Ami, `isOnline` faux et `lastActiveAt` nul — un passage hors ligne
 * ordinaire, rien qui nomme la baisse (RG-07) ; de Proche à Ami, « en ligne »
 * binaire, sans dernière connexion. Un lecteur qui ne perd rien ne reçoit rien,
 * un tiers non plus.
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
  withMutationLog: jest.fn(async (args: { op: () => Promise<unknown> }) => args.op()),
}));
jest.mock('../../../../services/together/togetherDeps', () => ({
  rejudgeTogetherAfter: async () => undefined,
}));

import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { relationsRoutes } from '../../../../routes/relations';
import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';
import {
  AUTRE, MOI, NOW, TIERS, buildRelationApp, demande, freezeClock, lien, thawClock, type AppOptions, type TestApp,
} from '../../../helpers/relation-app';

const REL = '/api/v1/relations';
const DIR = '/api/v1/directory';
const FR = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const VU_A = new Date('2026-10-31T11:58:00Z');

const enLigne = { isOnline: true, lastActiveAt: VU_A };
const LES_DEUX_EN_LIGNE: AppOptions['presences'] = { [MOI]: enLigne, [AUTRE]: enLigne, [TIERS]: enLigne };

const statuts = (app: TestApp) => app.emissions.filter((e) => e.event === SERVER_EVENTS.USER_STATUS);

const baisser = async (options: AppOptions, level: string) => {
  const app = await buildRelationApp(async (a) => { await a.register(relationsRoutes, { prefix: REL }); }, options);
  const res = await app.call('POST', `${REL}/${AUTRE}/level`, { level });
  await app.close();
  expect(res.status).toBe(200);
  return app;
};

beforeEach(() => freezeClock(NOW));
afterEach(() => thawClock());

describe('#19539 — une baisse sous Ami retire la pastille chez l\'autre, dans les deux sens', () => {
  it.each(['ACQUAINTANCE', 'PUBLIC'])('Ami → %s : chacun reçoit de l\'autre une présence hors ligne, sans dernière connexion', async (level) => {
    const app = await baisser({ liens: [lien('FRIEND', 'FRIEND')], presences: LES_DEUX_EN_LIGNE }, level);

    expect(statuts(app)).toEqual(expect.arrayContaining([
      { room: ROOMS.user(AUTRE), event: SERVER_EVENTS.USER_STATUS, payload: { userId: MOI, username: 'U11', isOnline: false, lastActiveAt: null } },
      { room: ROOMS.user(MOI), event: SERVER_EVENTS.USER_STATUS, payload: { userId: AUTRE, username: 'U22', isOnline: false, lastActiveAt: null } },
    ]));
    expect(statuts(app)).toHaveLength(2);
  });

  it('Proche → Ami : la dernière connexion s\'efface, « en ligne » reste servi tel que la loi le sert à un Ami', async () => {
    const app = await baisser({
      liens: [lien('CLOSE', 'CLOSE')],
      presences: { [MOI]: enLigne, [AUTRE]: { isOnline: false, lastActiveAt: VU_A } },
    }, 'FRIEND');

    expect(statuts(app)).toEqual(expect.arrayContaining([
      { room: ROOMS.user(AUTRE), event: SERVER_EVENTS.USER_STATUS, payload: { userId: MOI, username: 'U11', isOnline: true, lastActiveAt: null } },
      { room: ROOMS.user(MOI), event: SERVER_EVENTS.USER_STATUS, payload: { userId: AUTRE, username: 'U22', isOnline: false, lastActiveAt: null } },
    ]));
    expect(statuts(app)).toHaveLength(2);
  });

  it('Sang → Proche : la présence détaillée reste servie, aucune charge ne part', async () => {
    const app = await baisser({ liens: [lien('BLOOD', 'BLOOD')], presences: LES_DEUX_EN_LIGNE }, 'CLOSE');

    expect(statuts(app)).toEqual([]);
  });

  it('un lecteur qui ne voyait rien ne reçoit rien : la cible taisait déjà sa présence', async () => {
    const app = await baisser({
      liens: [lien('FRIEND', 'FRIEND')],
      presences: LES_DEUX_EN_LIGNE,
      privacy: { [MOI]: { showOnlineStatus: false } },
    }, 'PUBLIC');

    expect(statuts(app).map((e) => e.room)).toEqual([ROOMS.user(MOI)]);
  });

  it('une baisse qui ne change rien de ce qui est servi reste muette (RG-07) : l\'autre était hors ligne, sans dernière connexion', async () => {
    const app = await baisser({ liens: [lien('FRIEND', 'FRIEND')] }, 'PUBLIC');

    expect(statuts(app)).toEqual([]);
  });

  it('la présence servie est celle des sockets, pas la colonne en base qui retarde', async () => {
    const app = await baisser({
      liens: [lien('CLOSE', 'CLOSE')],
      presences: { [MOI]: { isOnline: false, lastActiveAt: VU_A }, [AUTRE]: { isOnline: true, lastActiveAt: VU_A } },
      connectes: [MOI],
    }, 'FRIEND');

    expect(statuts(app)).toEqual(expect.arrayContaining([
      { room: ROOMS.user(AUTRE), event: SERVER_EVENTS.USER_STATUS, payload: { userId: MOI, username: 'U11', isOnline: true, lastActiveAt: null } },
      { room: ROOMS.user(MOI), event: SERVER_EVENTS.USER_STATUS, payload: { userId: AUTRE, username: 'U22', isOnline: false, lastActiveAt: null } },
    ]));
    expect(statuts(app)).toHaveLength(2);
  });

  it('Ami → Public sur une colonne en retard : la socket au premier plan décide, la pastille s\'éteint', async () => {
    const app = await baisser({ liens: [lien('FRIEND', 'FRIEND')], connectes: [MOI, AUTRE] }, 'PUBLIC');

    expect(statuts(app)).toEqual(expect.arrayContaining([
      { room: ROOMS.user(AUTRE), event: SERVER_EVENTS.USER_STATUS, payload: { userId: MOI, username: 'U11', isOnline: false, lastActiveAt: null } },
    ]));
    expect(statuts(app)).toHaveLength(2);
  });

  it('aucune charge ne part vers un tiers, ni ne nomme la baisse', async () => {
    const app = await baisser({ liens: [lien('FRIEND', 'FRIEND')], presences: LES_DEUX_EN_LIGNE }, 'PUBLIC');

    expect(app.emissions.map((e) => e.room)).not.toContain(ROOMS.user(TIERS));
    expect(app.emissions.filter((e) => e.room === ROOMS.user(AUTRE)).map((e) => e.event)).toEqual([SERVER_EVENTS.USER_STATUS]);
  });
});

describe('#19539 — une rupture d\'amitié retire la pastille chez l\'autre', () => {
  it('l\'émetteur retire une amitié acceptée : les deux reçoivent la présence hors ligne de l\'autre', async () => {
    const app = await buildRelationApp(async (a) => { await a.register(directoryFriendRequestsRoutes, { prefix: DIR }); }, {
      demandes: [demande(FR, 'accepted', MOI, AUTRE, { targetLevel: 'FRIEND' })],
      liens: [lien('FRIEND', 'FRIEND')],
      presences: LES_DEUX_EN_LIGNE,
    });
    const res = await app.call('PATCH', `${DIR}/friend-requests/${FR}`, { action: 'cancel' }, MOI);
    await app.close();

    expect(res.status).toBe(200);
    expect(statuts(app)).toEqual(expect.arrayContaining([
      { room: ROOMS.user(AUTRE), event: SERVER_EVENTS.USER_STATUS, payload: { userId: MOI, username: 'U11', isOnline: false, lastActiveAt: null } },
      { room: ROOMS.user(MOI), event: SERVER_EVENTS.USER_STATUS, payload: { userId: AUTRE, username: 'U22', isOnline: false, lastActiveAt: null } },
    ]));
    expect(statuts(app)).toHaveLength(2);
  });
});

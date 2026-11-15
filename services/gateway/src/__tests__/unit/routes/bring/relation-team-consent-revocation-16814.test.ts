/**
 * #16814 — un partage accordé ENTRE COLLÈGUES de l'équipe, hors rituel (#16642), ne survit pas
 * à la perte du rôle d'équipe ou du compte de l'un des deux : sans cela, un lien Sang créé plus
 * tard le rendait lisible sans que le rituel l'ait jamais recueilli. Ce que le LIEN réel ouvre
 * (le rituel au Sang, la catégorie d'écoute dès Proche) reste intact.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ get: async () => null, set: async () => undefined, setnx: async () => true, del: async () => undefined }),
}));
jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(async (args: { op: () => Promise<unknown> }) => args.op()),
}));
jest.mock('../../../../services/PushNotificationService', () => ({
  getPushNotificationService: () => ({ sendToUser: async () => [] }),
}));

import { relationPairKey } from '@meeshy/shared/types/relation';
import { relationsRoutes } from '../../../../routes/relations';
import { relationConsentOf, RITUAL_CONSENT_FEATURES } from '../../../../services/relations/relationConsent';
import { revokeTeamSharesOf } from '../../../../services/relations/teamShareGrant';
import { freezeClock, thawClock } from '../../../helpers/relation-app';
import { AUTRE, MOI, NOW, buildBringApp, type BringAppOptions, type BringTestApp } from '../../../helpers/bring-app';

const appli = (options: BringAppOptions): Promise<BringTestApp> =>
  buildBringApp(async (a) => { await a.register(relationsRoutes, { prefix: '/api/v1/relations' }); }, options);

const TOUT = { listeningTitleShared: true, locationShared: true, locationHistoryShared: true, proximityShared: true };
const collegues = (): BringAppOptions => ({ personnes: { [MOI]: { role: 'MODERATOR' }, [AUTRE]: { role: 'ADMIN' } } });
const accorderLesDeux = async (app: BringTestApp) => {
  await app.call('PUT', `/api/v1/relations/${AUTRE}/settings`, { ...TOUT, listeningCategoryShared: true }, MOI);
  await app.call('PUT', `/api/v1/relations/${MOI}/settings`, { ...TOUT, listeningCategoryShared: true }, AUTRE);
};
const lier = (app: BringTestApp, level: string) =>
  app.prisma.userRelation.create({ data: { ...relationPairKey(MOI, AUTRE), grantedByLow: level, grantedByHigh: level, origin: 'request', transitions: [], levelSince: NOW } });
const lus = (app: BringTestApp, ownerId: string, otherId: string) =>
  Promise.all([...RITUAL_CONSENT_FEATURES, 'listening.category' as const].map((feature) => relationConsentOf(app.prisma, { ownerId, otherId, feature })));
const tousRefuses = ['refused', 'refused', 'refused', 'refused', 'refused'];

beforeEach(() => freezeClock(NOW));
afterEach(() => thawClock());

describe('#16814 — le consentement entre collègues tombe avec le rôle ou le compte', () => {
  it.each<[string, Record<string, unknown>]>([
    ['le rôle est retiré', { role: 'USER' }],
    ['le compte est désactivé', { isActive: false, deactivatedAt: NOW }],
    ['le compte est supprimé', { isActive: false, deactivatedAt: NOW, deletedAt: NOW }],
  ])('%s : les partages s\'éteignent dans les deux sens, et un lien Sang créé ensuite ne les rallume pas', async (_label, change) => {
    const app = await appli(collegues());
    await accorderLesDeux(app);
    Object.assign(app.users.get(MOI)!, change);
    await revokeTeamSharesOf(app.prisma, { userId: MOI, now: NOW });
    await lier(app, 'BLOOD');
    const [mesPartages, sesPartages] = await Promise.all([lus(app, MOI, AUTRE), lus(app, AUTRE, MOI)]);
    await app.close();

    expect(mesPartages).toEqual(tousRefuses);
    expect(sesPartages).toEqual(tousRefuses);
  });

  it('l\'extinction est datée chez chaque émetteur, comme un retrait', async () => {
    const app = await appli(collegues());
    await accorderLesDeux(app);
    app.users.get(AUTRE)!.role = 'USER';
    await revokeTeamSharesOf(app.prisma, { userId: AUTRE, now: NOW });
    await app.close();

    const attendu = { locationShared: false, locationWithdrawnAt: NOW, listeningCategoryShared: false, listeningCategoryWithdrawnAt: NOW };
    expect(app.reglages.get(`${MOI}:${AUTRE}`)).toMatchObject(attendu);
    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toMatchObject(attendu);
  });

  it('un collègue qui reste de l\'équipe (MODERATOR devenu ADMIN) garde ce qu\'il a accordé', async () => {
    const app = await appli(collegues());
    await accorderLesDeux(app);
    app.users.get(MOI)!.role = 'ADMIN';
    await revokeTeamSharesOf(app.prisma, { userId: MOI, now: NOW });
    const mesPartages = await lus(app, MOI, AUTRE);
    await app.close();

    expect(mesPartages).toEqual(['granted', 'granted', 'granted', 'granted', 'granted']);
  });

  it('ce que le LIEN réel ouvre survit : au Sang tout reste, au Proche seule la catégorie d\'écoute reste', async () => {
    const sang = await appli({ ...collegues(), liens: [] });
    await lier(sang, 'BLOOD');
    await accorderLesDeux(sang);
    sang.users.get(MOI)!.role = 'USER';
    await revokeTeamSharesOf(sang.prisma, { userId: MOI, now: NOW });
    const auSang = await lus(sang, MOI, AUTRE);
    await sang.close();

    const proche = await appli(collegues());
    await lier(proche, 'CLOSE');
    await accorderLesDeux(proche);
    proche.users.get(MOI)!.role = 'USER';
    await revokeTeamSharesOf(proche.prisma, { userId: MOI, now: NOW });
    const auProche = await lus(proche, MOI, AUTRE);
    await proche.close();

    expect(auSang.slice(0, 4)).toEqual(['granted', 'granted', 'granted', 'granted']);
    expect(auProche).toEqual(['refused', 'refused', 'refused', 'refused', 'granted']);
  });

  it('un compte sans aucun réglage ne déclenche aucune écriture', async () => {
    const app = await appli(collegues());
    app.users.get(MOI)!.role = 'USER';
    await revokeTeamSharesOf(app.prisma, { userId: MOI, now: NOW });
    await app.close();

    expect(app.prisma.relationFeatureSetting.updateMany).not.toHaveBeenCalled();
  });
});

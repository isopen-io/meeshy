/**
 * #16642 — deux comptes de l'ÉQUIPE (MODERATOR, ADMIN, BIGBOSS) consentent, puis retirent, le
 * titre écouté et la position entre eux, SANS lien (`UserRelation`) : le consentement ne
 * s'accordait qu'au rituel du Sang, qui exige un vrai lien. Les doubles lisent l'ÉTAT stocké ;
 * le consentement se relit par `relationConsentOf`, le site unique que les relais consultent.
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

import { relationsRoutes } from '../../../../routes/relations';
import { relationConsentOf, RITUAL_CONSENT_FEATURES } from '../../../../services/relations/relationConsent';
import { freezeClock, thawClock } from '../../../helpers/relation-app';
import { AUTRE, MOI, NOW, buildBringApp, lien, type BringAppOptions, type BringTestApp, type Personne } from '../../../helpers/bring-app';

const appli = (options: BringAppOptions = {}): Promise<BringTestApp> =>
  buildBringApp(async (a) => { await a.register(relationsRoutes, { prefix: '/api/v1/relations' }); }, options);

const regler = (app: BringTestApp, body: unknown, other = AUTRE, as = MOI) => app.call('PUT', `/api/v1/relations/${other}/settings`, body, as);
const consent = (app: BringTestApp, ownerId: string, otherId: string, feature: (typeof RITUAL_CONSENT_FEATURES)[number]) =>
  relationConsentOf(app.prisma, { ownerId, otherId, feature });
const equipe = (moi = 'MODERATOR', autre = 'ADMIN', extra: Personne = {}): BringAppOptions => ({
  personnes: { [MOI]: { role: moi }, [AUTRE]: { role: autre, ...extra } },
});
const TOUT = { listeningTitleShared: true, locationShared: true, locationHistoryShared: true, proximityShared: true };
const quinzeAns = new Date(NOW.getTime() - 15 * 365 * 24 * 3600 * 1000);

beforeEach(() => freezeClock(NOW));
afterEach(() => thawClock());

describe('#16642 — consentir au titre et à la position entre collègues, sans lien', () => {
  it.each([['MODERATOR', 'ADMIN'], ['ADMIN', 'BIGBOSS'], ['BIGBOSS', 'MODERATOR']])(
    '%s consent à %s : les quatre partages sont servis, lus par la loi du consentement, et aucun lien ne naît',
    async (moi, autre) => {
      const app = await appli(equipe(moi, autre));
      const res = await regler(app, TOUT);
      const lus = await Promise.all(RITUAL_CONSENT_FEATURES.map((f) => consent(app, MOI, AUTRE, f)));
      await app.close();

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ userId: AUTRE, ...TOUT });
      expect(lus).toEqual(['granted', 'granted', 'granted', 'granted']);
      expect(app.store.relations()).toHaveLength(0);
      expect(app.reglages.get(`${MOI}:${AUTRE}`)).toMatchObject({ ...TOUT, consentedAt: NOW });
    },
  );

  it('le consentement est de MON côté seulement : l\'autre n\'a rien consenti, la ligne de l\'autre n\'existe pas', async () => {
    const app = await appli(equipe());
    await regler(app, { locationShared: true });
    const sens = await consent(app, AUTRE, MOI, 'location.live');
    await app.close();

    expect(sens).toBe('refused');
    expect(app.reglages.has(`${AUTRE}:${MOI}`)).toBe(false);
  });

  it('un seul partage s\'accorde sans toucher aux autres', async () => {
    const app = await appli(equipe());
    const res = await regler(app, { locationShared: true });
    await app.close();

    expect(res.body.data).toMatchObject({ locationShared: true, listeningTitleShared: false, locationHistoryShared: false, proximityShared: false });
  });

  it('le retrait coupe tout de suite, date le geste, et un nouvel accord efface la date', async () => {
    const app = await appli(equipe());
    await regler(app, TOUT);
    const retrait = await regler(app, { locationShared: false, listeningTitleShared: false });
    const apres = await Promise.all([consent(app, MOI, AUTRE, 'location.live'), consent(app, MOI, AUTRE, 'listening.title'), consent(app, MOI, AUTRE, 'location.history')]);
    const ligneRetiree = { ...app.reglages.get(`${MOI}:${AUTRE}`) };
    const retour = await regler(app, { locationShared: true });
    await app.close();

    expect(retrait.status).toBe(200);
    expect(apres).toEqual(['refused', 'refused', 'granted']);
    expect(ligneRetiree).toMatchObject({ locationShared: false, locationWithdrawnAt: NOW, listeningTitleShared: false, listeningTitleWithdrawnAt: NOW });
    expect(retour.status).toBe(200);
    expect(app.reglages.get(`${MOI}:${AUTRE}`)).toMatchObject({ locationShared: true, locationWithdrawnAt: null });
  });

  it('retirer la catégorie d\'écoute retire le titre, même si le même corps voulait l\'accorder : refusé, rien ne s\'écrit', async () => {
    const app = await appli(equipe());
    const res = await regler(app, { listeningCategoryShared: false, listeningTitleShared: true });
    await app.close();

    expect(res.status).toBe(400);
    expect(app.reglages.has(`${MOI}:${AUTRE}`)).toBe(false);
  });

  it('un accord et un blocage du Bring partent dans la même écriture', async () => {
    const app = await appli(equipe());
    const res = await regler(app, { locationShared: true, bringBlocked: true });
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ locationShared: true, bringBlocked: true });
  });
});

describe('#16642 — tout ce qui n\'est pas deux collègues utilisables est refusé, le même refus, sans rien écrire', () => {
  it.each<[string, BringAppOptions]>([
    ['deux utilisateurs ordinaires', {}],
    ['deux utilisateurs ordinaires au Sang', { liens: [lien('BLOOD', 'BLOOD')] }],
    ['un modérateur face à un utilisateur ordinaire', { personnes: { [MOI]: { role: 'MODERATOR' } } }],
    ['un utilisateur ordinaire face à un administrateur', { personnes: { [AUTRE]: { role: 'ADMIN' } } }],
    ['un analyste', equipe('ANALYST', 'ADMIN')],
    ['un auditeur', equipe('ADMIN', 'AUDIT')],
    ['un rôle inconnu', equipe('ADMIN', 'SUPERADMIN')],
    ['un blocage que j\'ai posé', { personnes: { [MOI]: { role: 'MODERATOR', blockedUserIds: [AUTRE] }, [AUTRE]: { role: 'ADMIN' } } }],
    ['un blocage', equipe('MODERATOR', 'ADMIN', { blockedUserIds: [MOI] })],
    ['un collègue désactivé', equipe('MODERATOR', 'ADMIN', { deactivatedAt: new Date('2026-10-01T00:00:00Z') })],
    ['un collègue supprimé', equipe('MODERATOR', 'ADMIN', { deletedAt: new Date('2026-10-01T00:00:00Z') })],
    ['un collègue inactif', equipe('MODERATOR', 'ADMIN', { isActive: false })],
    ['un propriétaire mineur déclaré face à un adulte', { personnes: { [MOI]: { role: 'MODERATOR', birthDate: quinzeAns }, [AUTRE]: { role: 'ADMIN' } } }],
  ])('%s', async (_label, options) => {
    const app = await appli(options);
    const res = await regler(app, { locationShared: true });
    const reference = await (async () => { const a = await appli(); const r = await regler(a, { locationShared: true }); await a.close(); return r; })();
    await app.close();

    expect(res.status).toBe(400);
    expect(res.body).toEqual(reference.body);
    expect(app.reglages.has(`${MOI}:${AUTRE}`)).toBe(false);
    expect(app.store.relations()).toHaveLength(options.liens?.length ?? 0);
  });

  it('un seul partage refusé refuse le corps entier, retrait compris', async () => {
    const app = await appli({
      ...equipe('MODERATOR', 'ADMIN'),
      personnes: { [MOI]: { role: 'MODERATOR', birthDate: quinzeAns }, [AUTRE]: { role: 'ADMIN' } },
      reglages: [{ ownerId: MOI, otherId: AUTRE, bringBlockedAt: null, ...TOUT }],
    });
    const res = await regler(app, { proximityShared: false, locationShared: true });
    await app.close();

    expect(res.status).toBe(400);
    expect(app.reglages.get(`${MOI}:${AUTRE}`)).toMatchObject({ proximityShared: true });
  });

  it('une valeur qui n\'est pas un booléen reste refusée avant tout', async () => {
    const app = await appli(equipe());
    const statuts = await Promise.all([null, 0, 'true', 'false'].map((v) => regler(app, { locationShared: v }).then((r) => r.status)));
    await app.close();

    expect(statuts).toEqual([400, 400, 400, 400]);
    expect(app.reglages.has(`${MOI}:${AUTRE}`)).toBe(false);
  });
});

/**
 * Les réglages par personne (`/relations/:userId/settings`) : `bringBlocked` (#13936)
 * et `talkieBlocked` (#13935), des préférences de RÉCEPTION actives par défaut,
 * écrites PARTIELLEMENT ; couper le talkie de quelqu'un coupe sa voix en vol.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const cache = new Map<string, { value: string; expiresAt: number }>();
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    get: async (key: string) => {
      const hit = cache.get(key);
      return hit && hit.expiresAt > Date.now() ? hit.value : null;
    },
    set: async (key: string, value: string, ttl = 3600) => { cache.set(key, { value, expiresAt: Date.now() + ttl * 1000 }); },
    setnx: async (key: string, value: string, ttl = 3600) => {
      const hit = cache.get(key);
      if (hit && hit.expiresAt > Date.now()) return false;
      cache.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return true;
    },
    del: async (key: string) => { cache.delete(key); },
  }),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(async (args: { op: () => Promise<unknown> }) => args.op()),
}));

const pushes: Array<Record<string, any>> = [];
jest.mock('../../../../services/PushNotificationService', () => ({
  getPushNotificationService: () => ({
    sendToUser: async (options: Record<string, unknown>) => { pushes.push(options); return []; },
  }),
}));

import { relationsRoutes } from '../../../../routes/relations';
import { RELATION_BLOOD_LOCKED_CODE } from '@meeshy/shared/types/relation-person-settings';
import { BLOOD_BUNDLE_VERSION } from '@meeshy/shared/utils/blood-bundle';
import { freezeClock, thawClock } from '../../../helpers/relation-app';
import { AUTRE, MOI, NOW, buildBringApp, lien, type BringAppOptions, type BringTestApp } from '../../../helpers/bring-app';

// #20361 : la catégorie d'écoute arrive ACTIVE dès Proche ; les partages du rituel attendent l'accord au palier.
const AUCUN_PARTAGE = { bloodLocationMuted: false, listeningCategoryShared: true, lockedByLevel: false, bloodBundleAccepted: false, ritualSharesLocked: false, listeningTitleShared: false, locationShared: false, locationHistoryShared: false, proximityShared: false };

const appli = (options: BringAppOptions = { liens: [lien('CLOSE', 'CLOSE')] }): Promise<BringTestApp> =>
  buildBringApp(async (a) => { await a.register(relationsRoutes, { prefix: '/api/v1/relations' }); }, options);

const regler = (app: BringTestApp, body: unknown) => app.call('PUT', `/api/v1/relations/${MOI}/settings`, body, AUTRE);
const lire = (app: BringTestApp) => app.call('GET', `/api/v1/relations/${MOI}/settings`, undefined, AUTRE);

beforeEach(() => { cache.clear(); pushes.length = 0; freezeClock(NOW); });
afterEach(() => thawClock());

describe('#13935 — talkieBlocked', () => {
  it('par défaut, rien n’est coupé', async () => {
    const app = await appli();
    const res = await lire(app);
    await app.close();

    expect(res.body.data).toEqual({ userId: MOI, bringBlocked: false, talkieBlocked: false, togetherBlocked: false, ...AUCUN_PARTAGE });
  });

  it('se coupe et se relit, sans toucher au Bring', async () => {
    const app = await appli();
    await regler(app, { bringBlocked: true });
    const pose = await regler(app, { talkieBlocked: true });
    const relu = await lire(app);
    await app.close();

    expect(pose.body.data).toEqual({ userId: MOI, bringBlocked: true, talkieBlocked: true, togetherBlocked: false, ...AUCUN_PARTAGE });
    expect(relu.body.data).toEqual(pose.body.data);
    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toMatchObject({ bringBlockedAt: NOW, talkieBlockedAt: NOW });
  });

  it('se rouvre', async () => {
    const app = await appli();
    await regler(app, { talkieBlocked: true });
    const rouvert = await regler(app, { talkieBlocked: false });
    await app.close();

    expect(rouvert.body.data.talkieBlocked).toBe(false);
  });

  it('couper le talkie de X pose sa coupure : sa voix en vol s’arrête au fragment suivant, sur toute instance', async () => {
    const app = await appli();
    await regler(app, { talkieBlocked: true });
    await app.close();

    expect(cache.get(`talkie:cut:${MOI}:${AUTRE}`)?.value).toBe(String(NOW.getTime()));
    expect(cache.has(`talkie:cut:${AUTRE}:${MOI}`)).toBe(false);
  });

  it('un corps vide ou un réglage inconnu : 400', async () => {
    const app = await appli();
    const vide = await regler(app, {});
    const inconnu = await regler(app, { talkieBlocked: true, ghost: true });
    await app.close();

    expect(vide.status).toBe(400);
    expect(inconnu.status).toBe(400);
    expect(app.reglages.size).toBe(0);
  });
});

describe('#17023 — togetherBlocked : couper les invitations « ensemble » d\'une personne', () => {
  it('se coupe, se relit et se rouvre, sans toucher au Bring ni au talkie', async () => {
    const app = await appli();
    const pose = await regler(app, { togetherBlocked: true });
    const relu = await lire(app);
    const rouvert = await regler(app, { togetherBlocked: false });
    await app.close();

    expect(pose.body.data).toEqual({ userId: MOI, bringBlocked: false, talkieBlocked: false, togetherBlocked: true, ...AUCUN_PARTAGE });
    expect(relu.body.data).toEqual(pose.body.data);
    expect(rouvert.body.data.togetherBlocked).toBe(false);
    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toMatchObject({ togetherBlockedAt: null });
  });

  it('se date au moment de la coupure, sur MA ligne pour l\'autre', async () => {
    const app = await appli();
    await regler(app, { togetherBlocked: true });
    await app.close();

    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toMatchObject({ togetherBlockedAt: NOW });
    expect(app.reglages.has(`${MOI}:${AUTRE}`)).toBe(false);
  });

  it('sans lien, rien ne s\'écrit : le même 404 qu\'une personne inconnue', async () => {
    const app = await appli({ liens: [] });
    const res = await regler(app, { togetherBlocked: true });
    await app.close();

    expect(res.status).toBe(404);
    expect(app.reglages.size).toBe(0);
  });

  it('une valeur qui n\'est pas un booléen : 400', async () => {
    const app = await appli();
    const res = await regler(app, { togetherBlocked: 'oui' });
    await app.close();

    expect(res.status).toBe(400);
  });
});

describe('#13934 — la catégorie de mon écoute s\'accorde et se retire, personne par personne', () => {
  it('active dès Proche sans réglage (#20361), retirée sans ligne préalable, puis rendue et relue', async () => {
    const app = await appli();
    const avant = await lire(app);
    const retire = await regler(app, { listeningCategoryShared: false });
    const ecrit = app.reglages.get(`${AUTRE}:${MOI}`);
    const pose = await regler(app, { listeningCategoryShared: true });
    const relu = await lire(app);
    await app.close();

    expect(avant.body.data.listeningCategoryShared).toBe(true);
    expect(retire.body.data.listeningCategoryShared).toBe(false);
    expect(ecrit).toMatchObject({ listeningCategoryShared: false });
    expect(pose.body.data.listeningCategoryShared).toBe(true);
    expect(relu.body.data.listeningCategoryShared).toBe(true);
    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toMatchObject({ listeningCategoryShared: true });
  });

  it('sous Proche, rien ne s\'écrit : le même 404 qu\'une personne inconnue', async () => {
    const app = await appli({ liens: [lien('FRIEND', 'FRIEND')] });
    const res = await regler(app, { listeningCategoryShared: true });
    await app.close();

    expect(res.status).toBe(404);
    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toBeUndefined();
  });

  it('le retrait éteint l\'accord et le date', async () => {
    const app = await appli();
    await regler(app, { listeningCategoryShared: true });
    const retire = await regler(app, { listeningCategoryShared: false });
    await app.close();

    expect(retire.body.data.listeningCategoryShared).toBe(false);
    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toMatchObject({ listeningCategoryShared: false, listeningCategoryWithdrawnAt: NOW });
  });
});

describe('#13934 — retirer la catégorie retire aussi le titre', () => {
  it('le Sang qui avait le titre le perd avec la catégorie, et un nouvel accord efface la date de retrait', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')] });
    await regler(app, { listeningCategoryShared: true });
    app.reglages.set(`${AUTRE}:${MOI}`, { ...app.reglages.get(`${AUTRE}:${MOI}`), listeningTitleShared: true });
    const retire = await regler(app, { listeningCategoryShared: false });
    const reaccorde = await regler(app, { listeningCategoryShared: true });
    await app.close();

    expect(retire.body.data).toMatchObject({ listeningCategoryShared: false, listeningTitleShared: false });
    expect(reaccorde.body.data).toMatchObject({ listeningCategoryShared: true, listeningTitleShared: false });
    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toMatchObject({ listeningCategoryWithdrawnAt: null, listeningTitleWithdrawnAt: NOW });
  });
});

describe('#19454 — bloodLocationMuted : ne plus recevoir la position continue d\'un Sang', () => {
  it('se coupe sur MA ligne, se relit et se rouvre, sans toucher au consentement de l\'émetteur', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')] });
    app.reglages.set(`${MOI}:${AUTRE}`, { ownerId: MOI, otherId: AUTRE, locationShared: true, locationHistoryShared: true, proximityShared: true });
    const pose = await regler(app, { bloodLocationMuted: true });
    const relu = await lire(app);
    const rouvert = await regler(app, { bloodLocationMuted: false });
    await app.close();

    expect(pose.body.data).toEqual({ userId: MOI, bringBlocked: false, talkieBlocked: false, togetherBlocked: false, ...AUCUN_PARTAGE, bloodLocationMuted: true });
    expect(relu.body.data).toEqual(pose.body.data);
    expect(rouvert.body.data.bloodLocationMuted).toBe(false);
    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toMatchObject({ bloodLocationMutedAt: null });
    expect(app.reglages.get(`${MOI}:${AUTRE}`)).toMatchObject({ locationShared: true, locationHistoryShared: true, proximityShared: true });
    expect(app.reglages.get(`${MOI}:${AUTRE}`)?.bloodLocationMutedAt).toBeUndefined();
  });

  it('se date au moment de la coupure', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')] });
    await regler(app, { bloodLocationMuted: true });
    await app.close();

    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toMatchObject({ bloodLocationMutedAt: NOW });
  });

  it('sans lien, rien ne s\'écrit : le même 404 qu\'une personne inconnue', async () => {
    const app = await appli({ liens: [] });
    const res = await regler(app, { bloodLocationMuted: true });
    await app.close();

    expect(res.status).toBe(404);
    expect(app.reglages.size).toBe(0);
  });

  it('une valeur qui n\'est pas un booléen : 400', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')] });
    const res = await regler(app, { bloodLocationMuted: 'oui' });
    await app.close();

    expect(res.status).toBe(400);
    expect(app.reglages.size).toBe(0);
  });
});

describe('#20361 — de Sang à Sang, rien ne se coupe après l\'accord au palier', () => {
  const ACCORD = { ownerId: AUTRE, otherId: MOI, bringBlockedAt: null, bloodBundleAcceptedAt: NOW, bloodBundleVersion: BLOOD_BUNDLE_VERSION };

  it('toute coupure répond 409 RELATION_BLOOD_LOCKED et rien ne s\'écrit', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')], reglages: [ACCORD] });
    const corps = [{ bringBlocked: true }, { talkieBlocked: true }, { togetherBlocked: true }, { bloodLocationMuted: true }, { listeningCategoryShared: false }, { locationShared: false }];
    const reponses = [];
    for (const body of corps) reponses.push(await regler(app, body));
    await app.close();

    expect(reponses.map((r) => [r.status, r.body.code])).toEqual(corps.map(() => [409, RELATION_BLOOD_LOCKED_CODE]));
    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toEqual(ACCORD);
  });

  it('le GET dit que tout est ouvert et que les interrupteurs n\'existent plus', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')], reglages: [{ ...ACCORD, bringBlockedAt: new Date('2026-11-01T00:00:00.000Z'), locationShared: false }] });
    const res = await lire(app);
    await app.close();

    expect(res.body.data).toEqual({ userId: MOI, bringBlocked: false, talkieBlocked: false, togetherBlocked: false, bloodLocationMuted: false, listeningCategoryShared: true, listeningTitleShared: true, locationShared: true, locationHistoryShared: true, proximityShared: true, lockedByLevel: true, bloodBundleAccepted: true, ritualSharesLocked: true });
  });

  it('sans l\'accord au palier (décision B), ou à une version périmée, la coupure reste possible', async () => {
    const sansAccord = await appli({ liens: [lien('BLOOD', 'BLOOD')] });
    const avant = await regler(sansAccord, { bringBlocked: true });
    await sansAccord.close();
    const perime = await appli({ liens: [lien('BLOOD', 'BLOOD')], reglages: [{ ...ACCORD, bloodBundleVersion: '2020-01-01' }] });
    const vieux = await regler(perime, { talkieBlocked: true });
    await perime.close();

    expect(avant.status).toBe(200);
    expect(vieux.status).toBe(200);
  });

  it('rouvrir n\'est jamais refusé', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')], reglages: [ACCORD] });
    const res = await regler(app, { bringBlocked: false });
    await app.close();

    expect(res.status).toBe(200);
  });
});

describe('#20361 C7 — un mineur déclaré garde le retrait de sa position et de son titre, même après l\'accord au palier', () => {
  const ACCORD = { ownerId: AUTRE, otherId: MOI, bringBlockedAt: null, bloodBundleAcceptedAt: NOW, bloodBundleVersion: BLOOD_BUNDLE_VERSION, locationShared: true, listeningTitleShared: true };
  const MINEUR = { [AUTRE]: { birthDate: new Date('2012-01-01T00:00:00.000Z') }, [MOI]: { birthDate: new Date('1990-01-01T00:00:00.000Z') } };

  it('retirer la position ou le titre : 200, écrit, et l\'accord au palier s\'efface — le talkie n\'est alors plus verrouillé', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')], reglages: [ACCORD], personnes: MINEUR });
    const position = await regler(app, { locationShared: false });
    const titre = await regler(app, { listeningTitleShared: false });
    const talkie = await regler(app, { talkieBlocked: true });
    const lu = await lire(app);
    await app.close();

    expect([position.status, titre.status, talkie.status]).toEqual([200, 200, 200]);
    // Le refus d'un mineur ne se lève pas tout seul à sa majorité : il efface son accord au palier (retour à la carte B).
    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toMatchObject({ locationShared: false, listeningTitleShared: false, bloodBundleAcceptedAt: null, bloodBundleVersion: null });
    expect(lu.body.data).toMatchObject({ locationShared: false, listeningTitleShared: false, talkieBlocked: true, lockedByLevel: false, bloodBundleAccepted: false });
  });
});

describe('#20502 — un réglage écrit sur une paire bloquée répond EXACTEMENT comme sur un lien absent', () => {
  const MODELES = ['user', 'userRelation', 'friendRequest', 'relationFeatureSetting'] as const;
  const compte = (app: BringTestApp) => {
    let lectures = 0;
    for (const modele of MODELES) {
      const delegue = (app.prisma as unknown as Record<string, Record<string, unknown>>)[modele];
      for (const [nom, fn] of Object.entries(delegue)) {
        if (typeof fn !== 'function') continue;
        delegue[nom] = (...args: unknown[]) => { lectures += 1; return (fn as (...a: unknown[]) => unknown)(...args); };
      }
    }
    return () => lectures;
  };
  const essayer = async (options: BringAppOptions, body: Record<string, boolean>) => {
    const app = await appli(options);
    const lectures = compte(app);
    const res = await regler(app, body);
    await app.close();
    return { app, res, lectures: lectures() };
  };

  const CORPS: ReadonlyArray<Record<string, boolean>> = [
    { bringBlocked: true },
    { talkieBlocked: true },
    { togetherBlocked: true },
    { bloodLocationMuted: true },
    { listeningCategoryShared: true },
    { listeningCategoryShared: false },
  ];
  const BLOCAGES = [
    ['bloqué par l\'autre', { [MOI]: { blockedUserIds: [AUTRE] } }],
    ['bloqué par moi', { [AUTRE]: { blockedUserIds: [MOI] } }],
  ] as const;

  it.each(CORPS.flatMap((body) => BLOCAGES.flatMap(([cas, personnes]) => (['CLOSE', 'BLOOD'] as const).map((niveau) => [JSON.stringify(body), cas, niveau, body, personnes] as const))))(
    '%s, %s, resté %s : même statut, même corps, même nombre de lectures qu\'un lien absent ou retombé, et rien d\'écrit',
    async (_corps, _cas, niveau, body, personnes) => {
      const absent = await essayer({ liens: [] }, body);
      const retombe = await essayer({ liens: [lien('PUBLIC', 'PUBLIC', { transitions: [{ from: niveau, to: 'PUBLIC', at: NOW }] })] }, body);
      const bloque = await essayer({ liens: [lien(niveau, niveau)], personnes }, body);

      // Un RETRAIT ne demande aucun lien (RGPD art. 7(3)) : sur un lien absent, il répond 200 sans rien créer.
      expect(absent.res.status).toBe(body.listeningCategoryShared === false ? 200 : 404);
      expect([bloque.res.status, bloque.res.body]).toEqual([absent.res.status, absent.res.body]);
      expect([retombe.res.status, retombe.res.body]).toEqual([absent.res.status, absent.res.body]);
      expect([bloque.lectures, retombe.lectures]).toEqual([absent.lectures, absent.lectures]);
      expect(bloque.app.reglages.size).toBe(0);
    },
  );
});

describe('#20542 — retirer la proximité efface chez l’autre les alertes « un Sang s’approche » qu’il tenait de moi', () => {
  const alerte = (id: string, userId: string, actorId: string) => ({ id, userId, type: 'blood_proximity', actor: { id: actorId }, expiresAt: new Date(NOW.getTime() + 3_600_000) });

  it('mon retrait efface ses alertes qui me nomment, et laisse les miennes qui le nomment', async () => {
    const app = await buildBringApp(async (a) => { await a.register(relationsRoutes, { prefix: '/api/v1/relations' }); }, {
      liens: [lien('BLOOD', 'BLOOD')],
      reglages: [{ ownerId: MOI, otherId: AUTRE, bringBlockedAt: null, locationShared: true, locationHistoryShared: true, proximityShared: true }],
      notifications: [alerte('moi-chez-autre', AUTRE, MOI), alerte('autre-chez-moi', MOI, AUTRE)],
    });
    const res = await app.call('PUT', `/api/v1/relations/${AUTRE}/settings`, { proximityShared: false }, MOI);
    await app.close();

    expect(res.status).toBe(200);
    expect(app.notifications().map((n) => n.id)).toEqual(['autre-chez-moi']);
  });

  it('un autre retrait (la position continue) n’efface aucune alerte', async () => {
    const app = await buildBringApp(async (a) => { await a.register(relationsRoutes, { prefix: '/api/v1/relations' }); }, {
      liens: [lien('BLOOD', 'BLOOD')],
      reglages: [{ ownerId: MOI, otherId: AUTRE, bringBlockedAt: null, locationShared: true, locationHistoryShared: true, proximityShared: true }],
      notifications: [alerte('moi-chez-autre', AUTRE, MOI)],
    });
    await app.call('PUT', `/api/v1/relations/${AUTRE}/settings`, { locationShared: false }, MOI);
    await app.close();

    expect(app.notifications().map((n) => n.id)).toEqual(['moi-chez-autre']);
  });
});

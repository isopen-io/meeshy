/**
 * #13936 — le Bring (décision porteur D-3, #13945) : un son forcé pour l'urgence
 * extrême, ouvert dès Ami, compté PAR JOUR calendaire du destinataire et par paire
 * (Ami 1, Proche 3, Sang 30), disponible par défaut, bloquable par personne, qui
 * passe Ne pas déranger, et dont l'arrêt atteint tous les appareils.
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

import { bringRoutes } from '../../../../routes/bring';
import { relationsRoutes } from '../../../../routes/relations';
import { directoryBlocksRoutes } from '../../../../routes/directory/blocks';
import { freezeClock, thawClock } from '../../../helpers/relation-app';
import { AUTRE, MOI, NOW, TIERS, buildBringApp, lien, type BringAppOptions, type BringTestApp } from '../../../helpers/bring-app';

const appli = (options: BringAppOptions = {}): Promise<BringTestApp> =>
  buildBringApp(async (a) => {
    await a.register(bringRoutes, { prefix: '/api/v1/bring' });
    await a.register(relationsRoutes, { prefix: '/api/v1/relations' });
    await a.register(directoryBlocksRoutes, { prefix: '/api/v1/directory' });
  }, options);

const niveau = (level: string) => ({ liens: [lien(level, level)] });
const sonner = (app: BringTestApp, to = AUTRE, as = MOI) => app.call('POST', `/api/v1/bring/${to}`, undefined, as);
const dispo = (app: BringTestApp, to = AUTRE, as = MOI) => app.call('GET', `/api/v1/bring/${to}`, undefined, as);
const arreter = (app: BringTestApp, bringId: string, as = AUTRE) => app.call('DELETE', `/api/v1/bring/${bringId}`, undefined, as);
const reglerPour = (app: BringTestApp, other: string, body: unknown, as = AUTRE) =>
  app.call('PUT', `/api/v1/relations/${other}/settings`, body, as);
const avance = (ms: number) => jest.setSystemTime(new Date(Date.now() + ms));
const nouvellesPushes = () => pushes.splice(0);

beforeEach(() => { cache.clear(); pushes.length = 0; freezeClock(NOW); process.env.BRING_ENABLED = 'true'; });
afterEach(() => { thawClock(); delete process.env.BRING_ENABLED; });

describe('#16623 — l\'équipe a le Bring sans lien', () => {
  const equipe = { personnes: { [MOI]: { role: 'MODERATOR' }, [AUTRE]: { role: 'ADMIN' } } };

  it('deux comptes de l\'équipe sans lien : disponible, ça sonne, et la cible reçoit la sonnerie d\'un vrai Sang', async () => {
    const app = await appli(equipe);
    const disponible = await dispo(app);
    const res = await sonner(app);
    const sonneries = app.emissions.filter((e) => e.event === 'bring:ring');
    await app.close();
    expect(disponible.body.data).toMatchObject({ available: true, userId: AUTRE });
    expect(res.status).toBe(201);
    expect(sonneries.map((e) => e.room)).toContain(`user:${AUTRE}`);
  });

  it('la même chose dans l\'autre sens', async () => {
    const app = await appli(equipe);
    const res = await sonner(app, MOI, AUTRE);
    await app.close();
    expect(res.status).toBe(201);
  });

  it('un rôle ne laisse aucune trace de lien', async () => {
    const app = await appli(equipe);
    await sonner(app);
    const lignes = await app.prisma.userRelation.findMany({ where: {} });
    await app.close();
    expect(lignes).toEqual([]);
  });

  it.each([
    ['un modérateur face à un utilisateur ordinaire', { [MOI]: { role: 'MODERATOR' } }],
    ['un utilisateur ordinaire face à un administrateur', { [AUTRE]: { role: 'ADMIN' } }],
    ['un rôle de cible inconnu', { [MOI]: { role: 'ADMIN' }, [AUTRE]: { role: 'SUPERADMIN' } }],
    ['un analyste', { [MOI]: { role: 'ANALYST' }, [AUTRE]: { role: 'ADMIN' } }],
  ])('%s : le même refus qu\'à un inconnu', async (_label, personnes) => {
    const app = await appli({ personnes });
    const inconnu = await appli();
    const refus = await sonner(app);
    const reference = await sonner(inconnu);
    const disponible = await dispo(app);
    await app.close();
    await inconnu.close();
    expect(refus.status).toBe(reference.status);
    expect(refus.body).toEqual(reference.body);
    expect(disponible.body.data.available).toBe(false);
  });

  it('couper « Recevoir des Bring » ferme : le niveau s\'ouvre, la réception non', async () => {
    const app = await appli({ personnes: { [MOI]: { role: 'MODERATOR' }, [AUTRE]: { role: 'ADMIN', notification: { bringEnabled: false } } } });
    const disponible = await dispo(app);
    await app.close();
    expect(disponible.body.data.available).toBe(false);
  });

  it('un collègue mineur déclaré qui sonne peut être bloqué : le réglage se juge dans les deux sens', async () => {
    const quinzeAns = new Date(Date.now() - 15 * 365 * 24 * 3600 * 1000);
    const app = await appli({ personnes: { [MOI]: { role: 'MODERATOR', birthDate: quinzeAns }, [AUTRE]: { role: 'ADMIN' } } });
    const sonnerie = await sonner(app);
    const reglage = await reglerPour(app, MOI, { bringBlocked: true });
    await app.close();
    expect(sonnerie.status).toBe(201);
    expect(reglage.status).toBe(200);
  });

  it.each([
    ['inactif', { isActive: false }],
    ['supprimé', { deletedAt: new Date('2026-10-01T00:00:00Z') }],
  ])('un collègue %s n\'a plus le privilège : le même refus qu\'à un inconnu', async (_label, etat) => {
    const app = await appli({ personnes: { [MOI]: { role: 'MODERATOR' }, [AUTRE]: { role: 'ADMIN', ...etat } } });
    const inconnu = await appli();
    const refus = await sonner(app);
    const reference = await sonner(inconnu);
    await app.close();
    await inconnu.close();
    expect(refus.status).toBe(reference.status);
    expect(refus.body).toEqual(reference.body);
  });

  it('bloquer les Bring d\'un collègue s\'écrit sans lien, et le ferme', async () => {
    const app = await appli(equipe);
    const reglage = await reglerPour(app, MOI, { bringBlocked: true });
    const disponible = await dispo(app);
    await app.close();
    expect(reglage.status).toBe(200);
    expect(disponible.body.data.available).toBe(false);
  });

  it('le blocage d\'annuaire ferme entre deux comptes de l\'équipe', async () => {
    const app = await appli({ personnes: { [MOI]: { role: 'MODERATOR' }, [AUTRE]: { role: 'ADMIN', blockedUserIds: [MOI] } } });
    const disponible = await dispo(app);
    await app.close();
    expect(disponible.body.data.available).toBe(false);
  });

  it('bloquer un utilisateur ordinaire sans lien reste le 404 d\'un inconnu, même pour un administrateur', async () => {
    const app = await appli({ personnes: { [AUTRE]: { role: 'ADMIN' } } });
    const reglage = await reglerPour(app, MOI, { bringBlocked: true });
    await app.close();
    expect(reglage.status).toBe(404);
  });
});

describe('#13936 — qui peut faire sonner qui', () => {
  it.each(['FRIEND', 'CLOSE', 'BLOOD'])('un lien %s ouvre le Bring : 201, et le destinataire reçoit bring:ring', async (level) => {
    const app = await appli(niveau(level));
    const res = await sonner(app);
    await app.close();

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ bringId: expect.any(String), toUserId: AUTRE, sentAt: NOW.toISOString() });
    const rings = app.emissions.filter((e) => e.event === 'bring:ring');
    expect(rings.map((e) => e.room)).toEqual([`user:${AUTRE}`]);
    expect(rings[0].payload).toEqual({
      bringId: res.body.data.bringId, fromUserId: MOI, toUserId: AUTRE, sentAt: NOW.toISOString(), expiresAt: res.body.data.expiresAt,
    });
  });

  it.each(['PUBLIC', 'COMMUNITY', 'ACQUAINTANCE'])('sous Ami (%s) : 403 BRING_NOT_ALLOWED, rien ne sonne', async (level) => {
    const app = await appli(level === 'PUBLIC' ? {} : niveau(level));
    const res = await sonner(app);
    await app.close();

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BRING_NOT_ALLOWED');
    expect(app.emissions).toEqual([]);
    expect(pushes).toEqual([]);
  });

  it('le niveau effectif est le MINIMUM des deux accords : Sang d’un côté, Connaissance de l’autre ⇒ refus', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'ACQUAINTANCE')] });
    const res = await sonner(app);
    await app.close();

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BRING_NOT_ALLOWED');
  });

  it('une amitié acceptée avant le rattrapage vaut Ami : le Bring s’ouvre', async () => {
    const app = await appli({
      demandes: [{ id: 'fr0000000000000000000001', senderId: MOI, receiverId: AUTRE, status: 'accepted', updatedAt: NOW, respondedAt: NOW }],
    });
    const res = await sonner(app);
    await app.close();

    expect(res.status).toBe(201);
  });

  it.each([
    ['le destinataire m’a bloqué', { [AUTRE]: { blockedUserIds: [MOI] } }],
    ['j’ai bloqué le destinataire', { [MOI]: { blockedUserIds: [AUTRE] } }],
    ['le compte du destinataire est désactivé', { [AUTRE]: { deactivatedAt: NOW } }],
  ])('%s : 403 BRING_NOT_ALLOWED, rien ne sonne', async (_cas, personnes) => {
    const app = await appli({ ...niveau('BLOOD'), personnes });
    const res = await sonner(app);
    await app.close();

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BRING_NOT_ALLOWED');
    expect(app.emissions).toEqual([]);
    expect(pushes).toEqual([]);
  });

  it('un inconnu et un bloqué rendent EXACTEMENT la même réponse : la route n’est pas un oracle de blocage', async () => {
    const bloque = await appli({ ...niveau('BLOOD'), personnes: { [AUTRE]: { blockedUserIds: [MOI] } } });
    const inconnu = await appli();
    const [a, b] = [await sonner(bloque), await sonner(inconnu)];
    await bloque.close();
    await inconnu.close();

    expect(a).toEqual(b);
  });

  it('soi-même, ou un identifiant illisible : 400', async () => {
    const app = await appli(niveau('BLOOD'));
    const soi = await sonner(app, MOI);
    const illisible = await sonner(app, 'pas-un-id');
    await app.close();

    expect(soi.status).toBe(400);
    expect(illisible.status).toBe(400);
  });

  it('un mineur DÉCLARÉ fait sonner et peut être sonné : aucun refus d’âge (décision porteur 2026-10-31)', async () => {
    const app = await appli({ ...niveau('FRIEND'), personnes: { [AUTRE]: { birthDate: new Date('2014-01-01T00:00:00Z') } } });
    const res = await sonner(app);
    await app.close();

    expect(res.status).toBe(201);
  });
});

describe('#13936 — le quota par jour et par paire, selon le niveau effectif', () => {
  it.each([['FRIEND', 1], ['CLOSE', 3], ['BLOOD', 30]])('%s : %i Bring par jour, puis 429 BRING_QUOTA_EXCEEDED', async (level, perDay) => {
    const app = await appli(niveau(level));
    const statuses: number[] = [];
    for (let i = 0; i < perDay; i += 1) {
      const res = await sonner(app);
      statuses.push(res.status);
      await arreter(app, res.body.data.bringId);
    }
    const deTrop = await sonner(app);
    await app.close();

    expect(statuses).toEqual(Array(perDay).fill(201));
    expect(deTrop.status).toBe(429);
    expect(deTrop.body.code).toBe('BRING_QUOTA_EXCEEDED');
  });

  it('la réponse dit ce qui reste aujourd’hui, et le GET le relit sans rien consommer', async () => {
    const app = await appli(niveau('CLOSE'));
    const avant = await dispo(app);
    const relu = await dispo(app);
    const envoi = await sonner(app);
    const apres = await dispo(app);
    await app.close();

    expect(avant.body.data).toMatchObject({ userId: AUTRE, available: true, perDay: 3, remainingToday: 3 });
    expect(relu.body.data.remainingToday).toBe(3);
    expect(envoi.body.data).toMatchObject({ perDay: 3, remainingToday: 2 });
    expect(apres.body.data.remainingToday).toBe(2);
  });

  it('le quota est par paire ORIENTÉE : celui de B vers A ne consomme pas celui de A vers B', async () => {
    const app = await appli(niveau('FRIEND'));
    const aVersB = await sonner(app, AUTRE, MOI);
    const bVersA = await sonner(app, MOI, AUTRE);
    await app.close();

    expect(aVersB.status).toBe(201);
    expect(bVersA.status).toBe(201);
  });

  it('le jour est celui du DESTINATAIRE : à son minuit local, le quota repart', async () => {
    // NOW = 2026-10-31T12:00Z ; à Tokyo (UTC+9) le jour change à 15:00Z.
    const app = await appli({ ...niveau('FRIEND'), personnes: { [AUTRE]: { timezone: 'Asia/Tokyo' } } });
    const premier = await sonner(app);
    await arreter(app, premier.body.data.bringId);
    const lecture = await dispo(app);
    avance(3 * 3_600_000 + 1_000);
    const demain = await sonner(app);
    await app.close();

    expect(lecture.body.data).toMatchObject({ remainingToday: 0, resetsAt: '2026-10-31T15:00:00.000Z' });
    expect(demain.status).toBe(201);
  });

  it('un fuseau illisible retombe sur le jour UTC', async () => {
    const app = await appli({ ...niveau('FRIEND'), personnes: { [AUTRE]: { timezone: 'Mars/Olympus' } } });
    const lecture = await dispo(app);
    await app.close();

    expect(lecture.body.data.resetsAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('un refus (bloqué, sous Ami) ne consomme RIEN du quota', async () => {
    const app = await appli({ ...niveau('FRIEND'), reglages: [{ ownerId: AUTRE, otherId: MOI, bringBlockedAt: NOW }] });
    await sonner(app);
    await reglerPour(app, MOI, { bringBlocked: false });
    const res = await sonner(app);
    await app.close();

    expect(res.status).toBe(201);
  });

  it('un second Bring pendant que le premier sonne rend LE MÊME, sans consommer ni resonner', async () => {
    const app = await appli(niveau('CLOSE'));
    const premier = await sonner(app);
    nouvellesPushes();
    const second = await sonner(app);
    await app.close();

    expect(second.status).toBe(200);
    expect(second.body.data.bringId).toBe(premier.body.data.bringId);
    expect(second.body.data.remainingToday).toBe(2);
    expect(app.emissions.filter((e) => e.event === 'bring:ring')).toHaveLength(1);
    expect(pushes).toEqual([]);
  });

  it('passé la fenêtre de sonnerie, un nouveau Bring est un NOUVEAU Bring', async () => {
    const app = await appli(niveau('CLOSE'));
    const premier = await sonner(app);
    avance(121_000);
    const second = await sonner(app);
    await app.close();

    expect(second.status).toBe(201);
    expect(second.body.data.bringId).not.toBe(premier.body.data.bringId);
  });
});

describe('#13936 — le blocage du Bring, par personne', () => {
  it('disponible par défaut : aucun réglage ⇒ le Bring s’ouvre, et le réglage se lit « non bloqué »', async () => {
    const app = await appli(niveau('FRIEND'));
    const reglage = await app.call('GET', `/api/v1/relations/${MOI}/settings`, undefined, AUTRE);
    await app.close();

    expect(reglage.status).toBe(200);
    expect(reglage.body.data).toEqual({ userId: MOI, bringBlocked: false, talkieBlocked: false, listeningTitleShared: false, locationShared: false, locationHistoryShared: false, proximityShared: false });
  });

  it('bloqué par le destinataire : 403 BRING_BLOCKED, et le bouton disparaît (available: false, 0 restant)', async () => {
    const app = await appli(niveau('BLOOD'));
    const pose = await reglerPour(app, MOI, { bringBlocked: true });
    const res = await sonner(app);
    const lecture = await dispo(app);
    await app.close();

    expect(pose.status).toBe(200);
    expect(pose.body.data).toEqual({ userId: MOI, bringBlocked: true, talkieBlocked: false, listeningTitleShared: false, locationShared: false, locationHistoryShared: false, proximityShared: false });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BRING_BLOCKED');
    expect(lecture.body.data).toMatchObject({ available: false, remainingToday: 0 });
    expect(app.emissions.filter((e) => e.event === 'bring:ring')).toEqual([]);
  });

  it('l’interrupteur GLOBAL « Recevoir des Bring » coupé : personne ne sonne, BRING_BLOCKED, bouton absent', async () => {
    const app = await appli({ ...niveau('BLOOD'), personnes: { [AUTRE]: { notification: { bringEnabled: false } } } });
    const res = await sonner(app);
    const lecture = await dispo(app);
    await app.close();

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BRING_BLOCKED');
    expect(lecture.body.data).toMatchObject({ available: false, remainingToday: 0 });
    expect(pushes).toEqual([]);
  });

  it('le blocage n’est notifié à PERSONNE : aucun événement, aucun push vers celui qu’on bloque', async () => {
    const app = await appli(niveau('BLOOD'));
    await reglerPour(app, MOI, { bringBlocked: true });
    await app.close();

    expect(app.emissions.filter((e) => e.room === `user:${MOI}`)).toEqual([]);
    expect(pushes.filter((p) => p.userId === MOI)).toEqual([]);
  });

  it('le blocage est PAR PERSONNE : bloquer le Bring de A ne ferme pas celui de B', async () => {
    const app = await appli({ liens: [lien('FRIEND', 'FRIEND')], demandes: [{ id: 'fr0000000000000000000002', senderId: AUTRE, receiverId: TIERS, status: 'accepted', updatedAt: NOW, respondedAt: NOW }] });
    const pose = await reglerPour(app, TIERS, { bringBlocked: true });
    const res = await sonner(app);
    await app.close();

    expect(pose.status).toBe(200);
    expect(res.status).toBe(201);
  });

  it('un réglage ne s’écrit que pour une personne liée qui existe : sinon 404, et aucune ligne', async () => {
    const app = await appli(niveau('FRIEND'));
    const sansLien = await reglerPour(app, TIERS, { bringBlocked: true });
    const inconnu = await reglerPour(app, 'c'.repeat(24), { bringBlocked: true });
    await app.close();

    expect(sansLien.status).toBe(404);
    expect(inconnu).toEqual(sansLien);
    expect(app.reglages.size).toBe(0);
  });

  it('son propre identifiant, en MAJUSCULES : 400, aucune ligne soi → soi', async () => {
    const app = await appli(niveau('FRIEND'));
    const res = await reglerPour(app, AUTRE.toUpperCase(), { bringBlocked: true });
    const bring = await sonner(app, MOI.toUpperCase());
    await app.close();

    expect(res.status).toBe(400);
    expect(bring.status).toBe(400);
    expect(app.reglages.size).toBe(0);
  });

  it('débloquer rouvre le Bring', async () => {
    const app = await appli(niveau('FRIEND'));
    await reglerPour(app, MOI, { bringBlocked: true });
    await reglerPour(app, MOI, { bringBlocked: false });
    const res = await sonner(app);
    await app.close();

    expect(res.status).toBe(201);
  });

  it('bloquer le Bring de X pendant qu’il sonne l’arrête sur MES appareils, sans rien dire à X', async () => {
    const app = await appli(niveau('BLOOD'));
    const envoi = await sonner(app);
    app.emissions.length = 0;
    nouvellesPushes();
    await reglerPour(app, MOI, { bringBlocked: true });
    await app.close();

    const stops = app.emissions.filter((e) => e.event === 'bring:stopped');
    expect(stops.map((e) => e.room)).toEqual([`user:${AUTRE}`]);
    expect(stops[0].payload).toMatchObject({ bringId: envoi.body.data.bringId, reason: 'recipient' });
    expect(pushes.every((p) => p.userId === AUTRE)).toBe(true);
    expect(pushes.map((p) => p.payload.data.type)).toContain('bring_stopped');
  });

  it.each([
    [{}, 400],
    [{ bringBlocked: 'oui' }, 400],
    [{ bringBlocked: true, talkieDirect: false }, 400],
  ])('un corps de réglage illisible (%j) : %i, rien n’est écrit', async (body, status) => {
    const app = await appli(niveau('FRIEND'));
    const res = await reglerPour(app, MOI, body);
    await app.close();

    expect(res.status).toBe(status);
    expect(app.reglages.size).toBe(0);
  });

  it('un réglage écrit pour le Bring ne vaut AUCUN consentement du rituel', async () => {
    const app = await appli(niveau('FRIEND'));
    await reglerPour(app, MOI, { bringBlocked: true });
    await app.close();

    const ligne = app.reglages.get(`${AUTRE}:${MOI}`)!;
    expect(ligne).toMatchObject({ ownerId: AUTRE, otherId: MOI, bringBlockedAt: NOW });
    expect(['listeningTitleShared', 'locationShared', 'locationHistoryShared', 'proximityShared'].some((k) => ligne[k] === true)).toBe(false);
  });
});

describe('#13936 — arrêter, et que l’arrêt atteigne tous les appareils', () => {
  it('le destinataire arrête d’un geste : bring:stopped aux DEUX, et un push silencieux à ses appareils', async () => {
    const app = await appli(niveau('CLOSE'));
    const envoi = await sonner(app);
    nouvellesPushes();
    const res = await arreter(app, envoi.body.data.bringId, AUTRE);
    await app.close();

    expect(res.status).toBe(200);
    const stops = app.emissions.filter((e) => e.event === 'bring:stopped');
    expect(stops.map((e) => e.room).sort()).toEqual([`user:${AUTRE}`, `user:${MOI}`].sort());
    expect(stops[0].payload).toMatchObject({ bringId: envoi.body.data.bringId, fromUserId: MOI, toUserId: AUTRE, reason: 'recipient' });
    expect(pushes.map((p) => [p.userId, p.payload.silent, p.payload.data])).toEqual(
      expect.arrayContaining([[AUTRE, true, { type: 'bring_stopped', bringId: envoi.body.data.bringId, reason: 'recipient' }]]),
    );
    expect(pushes.every((p) => p.userId === AUTRE)).toBe(true);
  });

  it('l’expéditeur annule : raison « sender »', async () => {
    const app = await appli(niveau('CLOSE'));
    const envoi = await sonner(app);
    const res = await arreter(app, envoi.body.data.bringId, MOI);
    await app.close();

    expect(res.status).toBe(200);
    expect(app.emissions.find((e) => e.event === 'bring:stopped')!.payload.reason).toBe('sender');
  });

  it('un tiers ne peut ni arrêter ni apprendre qu’un Bring existe : 404 BRING_NOT_FOUND, comme un id inconnu', async () => {
    const app = await appli(niveau('CLOSE'));
    const envoi = await sonner(app);
    const tiers = await arreter(app, envoi.body.data.bringId, TIERS);
    const inconnu = await arreter(app, 'f'.repeat(24), TIERS);
    await app.close();

    expect(tiers.status).toBe(404);
    expect(tiers.body.code).toBe('BRING_NOT_FOUND');
    expect(tiers).toEqual(inconnu);
  });

  it('arrêter deux fois : la seconde rend 404, rien n’est réémis', async () => {
    const app = await appli(niveau('CLOSE'));
    const envoi = await sonner(app);
    await arreter(app, envoi.body.data.bringId);
    const avant = app.emissions.length;
    const encore = await arreter(app, envoi.body.data.bringId);
    await app.close();

    expect(encore.status).toBe(404);
    expect(app.emissions.length).toBe(avant);
  });

  it('un Bring arrêté libère la paire : le suivant est un nouveau Bring (s’il reste du quota)', async () => {
    const app = await appli(niveau('CLOSE'));
    const premier = await sonner(app);
    await arreter(app, premier.body.data.bringId);
    const second = await sonner(app);
    await app.close();

    expect(second.status).toBe(201);
    expect(second.body.data.bringId).not.toBe(premier.body.data.bringId);
  });
});

describe('#13936 — un blocage utilisateur coupe le Bring en vol', () => {
  it('le destinataire bloque l’expéditeur pendant la sonnerie : ses appareils s’arrêtent, l’expéditeur n’apprend rien', async () => {
    const app = await appli(niveau('BLOOD'));
    const envoi = await sonner(app);
    app.emissions.length = 0;
    nouvellesPushes();
    const blocage = await app.call('PUT', `/api/v1/directory/blocks/${MOI}`, undefined, AUTRE);
    await new Promise((r) => setImmediate(r));
    await app.close();

    expect(blocage.status).toBe(200);
    const stops = app.emissions.filter((e) => e.event === 'bring:stopped');
    expect(stops.map((e) => e.room)).toEqual([`user:${AUTRE}`]);
    expect(stops[0].payload).toMatchObject({ bringId: envoi.body.data.bringId, reason: 'recipient' });
    expect(pushes.every((p) => p.userId === AUTRE)).toBe(true);
  });

  it('l’expéditeur bloque le destinataire : la sonnerie s’arrête chez l’autre, raison « sender »', async () => {
    const app = await appli(niveau('BLOOD'));
    await sonner(app);
    app.emissions.length = 0;
    await app.call('PUT', `/api/v1/directory/blocks/${AUTRE}`, undefined, MOI);
    await new Promise((r) => setImmediate(r));
    await app.close();

    const stops = app.emissions.filter((e) => e.event === 'bring:stopped');
    expect(stops.map((e) => e.room).sort()).toEqual([`user:${AUTRE}`, `user:${MOI}`].sort());
    expect(stops[0].payload.reason).toBe('sender');
  });
});

describe('#13935 — un blocage utilisateur coupe aussi le talkie, dans les deux sens', () => {
  it('les deux coupures sont posées à l’instant du blocage', async () => {
    const app = await appli(niveau('BLOOD'));
    await app.call('PUT', `/api/v1/directory/blocks/${MOI}`, undefined, AUTRE);
    await new Promise((r) => setImmediate(r));
    await app.close();

    expect(cache.get(`talkie:cut:${MOI}:${AUTRE}`)?.value).toBe(String(NOW.getTime()));
    expect(cache.get(`talkie:cut:${AUTRE}:${MOI}`)?.value).toBe(String(NOW.getTime()));
  });
});

describe('#14441 (B2) — l’interrupteur du service, éteint par défaut', () => {
  it('éteint : POST 403 BRING_DISABLED, rien ne sonne ; GET rend le bouton absent ; la config le dit', async () => {
    delete process.env.BRING_ENABLED;
    const app = await appli(niveau('BLOOD'));
    const res = await sonner(app);
    const lecture = await dispo(app);
    const config = await app.call('GET', '/api/v1/relations/config');
    await app.close();

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BRING_DISABLED');
    expect(lecture.body.data).toMatchObject({ available: false, remainingToday: 0 });
    expect(config.body.data.services).toEqual({ bring: false });
    expect(app.emissions).toEqual([]);
    expect(pushes).toEqual([]);
  });

  it('allumé (staging) : la config le dit', async () => {
    const app = await appli(niveau('BLOOD'));
    const config = await app.call('GET', '/api/v1/relations/config');
    await app.close();

    expect(config.body.data.services).toEqual({ bring: true });
  });

  it('éteint, un Bring déjà en vol s’arrête toujours', async () => {
    const app = await appli(niveau('CLOSE'));
    const envoi = await sonner(app);
    delete process.env.BRING_ENABLED;
    const res = await arreter(app, envoi.body.data.bringId);
    await app.close();

    expect(res.status).toBe(200);
  });
});

describe('#14441 (M1) — un double appui rend le même Bring, jamais 503', () => {
  it('deux POST simultanés : 201 et 200, le même bringId, une seule sonnerie', async () => {
    const app = await appli(niveau('CLOSE'));
    const [a, b] = await Promise.all([sonner(app), sonner(app)]);
    await app.close();

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.bringId).toBe(b.body.data.bringId);
    expect(app.emissions.filter((e) => e.event === 'bring:ring')).toHaveLength(1);
  });
});

describe('#14441 (M3) — « Masquer le nom de l’expéditeur » vaut aussi pour le Bring', () => {
  it('showSenderName:false : titre neutre, ni nom ni avatar dans la charge', async () => {
    const app = await appli({ ...niveau('CLOSE'), personnes: { [AUTRE]: { notification: { showSenderName: false } } } });
    await sonner(app);
    await app.close();

    for (const push of pushes) {
      expect(push.payload.title).toBe("Quelqu'un fait sonner votre téléphone");
      expect(push.payload.data).toMatchObject({ fromName: '', fromAvatar: '', fromUserId: MOI });
    }
    expect(pushes).toHaveLength(2);
  });
});

describe('#14441 (M6) — l’arrêt retire la bannière même app tuée', () => {
  it('iOS : une alerte PASSIVE de même collapse-id remplace la bannière ; Android : data-only', async () => {
    const app = await appli(niveau('CLOSE'));
    const envoi = await sonner(app);
    pushes.length = 0;
    await arreter(app, envoi.body.data.bringId);
    await app.close();

    const ios = pushes.find((p) => p.types?.includes('apns'))!;
    expect(ios.payload).toMatchObject({ title: 'Bring arrêté', interruptionLevel: 'passive', collapseId: `bring-${envoi.body.data.bringId}` });
    expect(ios.payload.silent).toBeUndefined();
    const android = pushes.find((p) => p.types?.includes('fcm'))!;
    expect(android.payload).toMatchObject({ silent: true, data: { type: 'bring_stopped' } });
  });
});

describe('#13936 — la charge push vers iOS et Android', () => {
  it('iOS : alerte time-sensitive, sonnerie d’appel, catégorie BRING, qui passe Ne pas déranger et expire avec la fenêtre', async () => {
    const app = await appli({ ...niveau('FRIEND'), personnes: { [AUTRE]: { systemLanguage: 'en' } } });
    const envoi = await sonner(app);
    await app.close();

    const ios = pushes.find((p) => p.types?.includes('apns'))!;
    expect(ios).toMatchObject({ userId: AUTRE, bypassDnd: true, types: ['apns'], platforms: ['ios'] });
    expect(ios.payload).toMatchObject({
      title: 'U11 is ringing your phone',
      body: 'Emergency — tap to stop the ringing',
      sound: 'Ringtone.caf',
      interruptionLevel: 'time-sensitive',
      category: 'BRING',
      collapseId: `bring-${envoi.body.data.bringId}`,
      ttlMs: 120_000,
    });
    expect(ios.payload.criticalSound).toBeUndefined();
  });

  it('Android : FCM DATA-ONLY haute priorité, libellés localisés DANS data, TTL = la fenêtre', async () => {
    const app = await appli({ ...niveau('FRIEND'), personnes: { [AUTRE]: { systemLanguage: 'fr' } } });
    const envoi = await sonner(app);
    await app.close();

    const android = pushes.find((p) => p.types?.includes('fcm'))!;
    expect(android).toMatchObject({ userId: AUTRE, bypassDnd: true, types: ['fcm'], platforms: ['android'] });
    expect(android.payload).toMatchObject({ dataOnlyOnAndroid: true, ttlMs: 120_000 });
    expect(android.payload.data).toEqual({
      type: 'bring',
      bringId: envoi.body.data.bringId,
      fromUserId: MOI,
      fromName: 'U11',
      fromAvatar: '',
      sentAt: NOW.toISOString(),
      expiresAt: envoi.body.data.expiresAt,
      title: 'U11 fait sonner votre téléphone',
      body: 'Urgence — touchez pour arrêter la sonnerie',
      stopLabel: 'Arrêter',
    });
  });

  it('Critical Alerts accordé (APNS_CRITICAL_ALERTS_ENABLED) : niveau critical et son critique au volume plein', async () => {
    process.env.APNS_CRITICAL_ALERTS_ENABLED = 'true';
    try {
      const app = await appli(niveau('FRIEND'));
      await sonner(app);
      await app.close();
    } finally {
      delete process.env.APNS_CRITICAL_ALERTS_ENABLED;
    }

    const ios = pushes.find((p) => p.types?.includes('apns'))!;
    expect(ios.payload).toMatchObject({ interruptionLevel: 'critical', criticalSound: { volume: 1 } });
  });

  it('aucun push ne part vers le web : le Bring y sonne onglet ouvert, par la socket', async () => {
    const app = await appli(niveau('FRIEND'));
    await sonner(app);
    await app.close();

    expect(pushes.some((p) => (p.platforms ?? []).includes('web'))).toBe(false);
  });
});

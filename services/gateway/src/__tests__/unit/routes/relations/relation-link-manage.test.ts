/**
 * #14910 — gérer un lien depuis le profil : `GET /relations/:userId` sert la vue
 * complète du lien, `canRaise` et `raiseBlockedUntil` ; une baisse sous le Sang
 * retire les partages du rituel ; « Annuler le lien » (PUBLIC) ne laisse aucune
 * amitié servie nulle part.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const cacheDel = jest.fn(async (_key: string) => undefined);

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../services/CacheStore', () => ({
  ...(jest.requireActual('../../../../services/CacheStore') as object),
  getCacheStore: () => ({ del: (key: string) => cacheDel(key) }),
}));

const rejudgeTogetherAfter = jest.fn(async (_params: unknown, _pair: unknown) => undefined);
jest.mock('../../../../services/together/togetherDeps', () => ({
  rejudgeTogetherAfter: (params: unknown, pair: unknown) => rejudgeTogetherAfter(params, pair),
}));

import { relationLevelResponseSchema } from '@meeshy/shared/types/relation-level-response';
import { relationsRoutes } from '../../../../routes/relations';
import { relationsLevelRoutes } from '../../../../routes/relations/level';
import { amisAcceptes, niveauEffectif } from '../../../../services/friendship';
import {
  AUTRE, DAY, MOI, NOW, buildRelationApp, demande, freezeClock, lien, semaineActive, thawClock,
  type AppOptions,
} from '../../../helpers/relation-app';

const LOW = MOI < AUTRE ? MOI : AUTRE;
const HIGH = MOI < AUTRE ? AUTRE : MOI;
const PREFIXE = '/api/v1/relations';
const INCONNU = '507f1f77bcf86cd799439abc';

const appli = (options: AppOptions = {}) => buildRelationApp(async (a) => {
  await a.register(relationsRoutes, { prefix: PREFIXE });
  await a.register(relationsLevelRoutes, { prefix: PREFIXE });
}, options);

const cooldownPour = (userId: string, until: Date): Record<string, Date> =>
  userId === LOW ? { cooldownLowUntil: until } : { cooldownHighUntil: until };

const lire = async (options: AppOptions, cible: string = AUTRE) => {
  const app = await appli(options);
  const res = await app.call('GET', `${PREFIXE}/${cible}`);
  await app.close();
  return res;
};

const DANS_DIX_JOURS = new Date(NOW.getTime() + 10 * DAY);

beforeEach(() => { freezeClock(NOW); cacheDel.mockClear(); });
afterEach(() => thawClock());

describe('#14910 — GET /relations/:userId sert la vue complète du lien', () => {
  it('sert, en plus de effectiveLevel, la vue de GET /relations, canRaise et raiseBlockedUntil', async () => {
    const res = await lire({ liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')] });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      userId: AUTRE,
      effectiveLevel: 'ACQUAINTANCE',
      grantedByMe: 'ACQUAINTANCE',
      since: null,
      progress: { activeWeeks: 0, needed: null, missing: [] },
      eligibleFor: null,
      canRaise: true,
      raiseBlockedUntil: null,
      accessLevel: 'ACQUAINTANCE',
    });
    expect(relationLevelResponseSchema.parse(res.body.data)).toEqual(res.body.data);
  });

  it('la vue servie est celle de GET /relations pour le même lien', async () => {
    const app = await appli({ liens: [lien('CLOSE', 'FRIEND')], jours: [semaineActive(0, LOW, HIGH), semaineActive(1, LOW, HIGH)] });
    const un = await app.call('GET', `${PREFIXE}/${AUTRE}`);
    const tous = await app.call('GET', PREFIXE);
    await app.close();

    const { canRaise: _c, raiseBlockedUntil: _r, accessLevel: _a, ...vue } = un.body.data;
    expect(vue).toEqual(tous.body.data.find((l: { userId: string }) => l.userId === AUTRE));
  });

  it('Ami sans la série : canRaise faux (Proche exige ses semaines), aucun cool-down', async () => {
    const res = await lire({ liens: [lien('FRIEND', 'FRIEND')] });

    expect(res.body.data).toMatchObject({ effectiveLevel: 'FRIEND', canRaise: false, raiseBlockedUntil: null });
  });

  it('Ami avec quatre semaines actives : canRaise vrai vers Proche', async () => {
    const jours = [0, 1, 2, 3, 4].map((w) => semaineActive(w, LOW, HIGH));
    const res = await lire({ liens: [lien('FRIEND', 'FRIEND')], jours });

    expect(res.body.data).toMatchObject({ effectiveLevel: 'FRIEND', eligibleFor: 'CLOSE', canRaise: true, raiseBlockedUntil: null });
  });

  it('Sang : aucun cran suivant, canRaise faux', async () => {
    const res = await lire({ liens: [lien('BLOOD', 'BLOOD')] });

    expect(res.body.data).toMatchObject({ effectiveLevel: 'BLOOD', canRaise: false, raiseBlockedUntil: null });
  });

  it('MON cool-down (RG-08) n’est jamais servi : canRaise vrai, raiseBlockedUntil nul — il ne se dit qu’à la demande (RG-07)', async () => {
    const libre = await lire({ liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')] });
    const retenu = await lire({ liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE', cooldownPour(MOI, DANS_DIX_JOURS))] });

    expect(retenu.body.data).toEqual(libre.body.data);
    expect(retenu.body.data).toMatchObject({ canRaise: true, raiseBlockedUntil: null });
  });

  it('une baisse SANS effet visible ne se lit pas : l’autre baisse son accord au-dessus du niveau effectif, ma réponse ne change pas', async () => {
    const app = await appli({ liens: [lien(MOI === LOW ? 'FRIEND' : 'CLOSE', MOI === LOW ? 'CLOSE' : 'FRIEND')] });
    const avant = await app.call('GET', `${PREFIXE}/${AUTRE}`);
    await app.call('POST', `${PREFIXE}/${MOI}/level`, { level: 'FRIEND' }, AUTRE);
    const apres = await app.call('GET', `${PREFIXE}/${AUTRE}`);
    await app.close();

    expect(apres.body.data).toEqual(avant.body.data);
  });

  it('une demande refusée puis annulée par son émetteur se lit comme une demande annulée sans refus', async () => {
    const annuleeSansRefus = await lire({ liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')] });
    const annuleeApresRefus = await lire({ liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE', cooldownPour(MOI, DANS_DIX_JOURS))] });

    expect(annuleeApresRefus.body.data).toEqual(annuleeSansRefus.body.data);
  });

  it.each([
    ['ma demande en attente', demande('cc0000000000000000000001', 'pending', MOI, AUTRE, { targetLevel: 'FRIEND' })],
    ['sa demande en attente', demande('cc0000000000000000000001', 'pending', AUTRE, MOI, { targetLevel: 'FRIEND' })],
  ])('%s : canRaise faux', async (_cas, enAttente) => {
    const res = await lire({ liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')], demandes: [enAttente] });

    expect(res.body.data).toMatchObject({ canRaise: false, raiseBlockedUntil: null });
  });

  it('ma demande REFUSÉE se lit comme une demande en attente : le cool-down qu’elle a posé ne fuit pas (RG-07)', async () => {
    const enAttente = await lire({
      liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')],
      demandes: [demande('cc0000000000000000000001', 'pending', MOI, AUTRE, { targetLevel: 'FRIEND' })],
    });
    const refusee = await lire({
      liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE', cooldownPour(MOI, DANS_DIX_JOURS))],
      demandes: [demande('cc0000000000000000000001', 'rejected', MOI, AUTRE, { targetLevel: 'FRIEND' })],
    });

    expect(refusee.body.data).toEqual(enAttente.body.data);
  });

  it('sous Connaissance, la réponse ne dit que l’absence de lien : un bloqué, un inconnu, un lien quitté et un cool-down se lisent pareil', async () => {
    const sansLien = (await lire({})).body.data;
    const bloque = (await lire({ liens: [lien('CLOSE', 'CLOSE')], bloques: [MOI] })).body.data;
    const inconnu = (await lire({}, INCONNU)).body.data;
    const quitte = (await lire({ liens: [lien('PUBLIC', 'PUBLIC', cooldownPour(MOI, DANS_DIX_JOURS))] })).body.data;
    const accordeSeul = (await lire({ liens: [lien(MOI === LOW ? 'FRIEND' : 'PUBLIC', MOI === LOW ? 'PUBLIC' : 'FRIEND')] })).body.data;

    const attendu = {
      userId: AUTRE, effectiveLevel: 'PUBLIC', grantedByMe: 'PUBLIC', since: null,
      progress: { activeWeeks: 0, needed: null, missing: [] }, eligibleFor: null, canRaise: false, raiseBlockedUntil: null,
      accessLevel: 'PUBLIC',
    };
    expect(sansLien).toEqual(attendu);
    expect(bloque).toEqual(attendu);
    expect(quitte).toEqual(attendu);
    expect(accordeSeul).toEqual(attendu);
    expect(inconnu).toEqual({ ...attendu, userId: INCONNU });
  });

  it('GET /relations ne sert toujours aucun cool-down', async () => {
    const app = await appli({ liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE', cooldownPour(MOI, DANS_DIX_JOURS))] });
    const res = await app.call('GET', PREFIXE);
    await app.close();

    expect(JSON.stringify(res.body)).not.toMatch(/cooldown|raiseBlockedUntil|canRaise/i);
  });
});

const PARTAGES_ALLUMES = {
  listeningTitleShared: true, locationShared: true, locationHistoryShared: true, proximityShared: true,
};
const PARTAGES_ETEINTS = {
  listeningTitleShared: false, locationShared: false, locationHistoryShared: false, proximityShared: false,
};
const DATES_DE_RETRAIT = {
  listeningTitleWithdrawnAt: NOW, locationWithdrawnAt: NOW, locationHistoryWithdrawnAt: NOW, proximityWithdrawnAt: NOW,
};
const reglagesDuSang = () => [
  { ownerId: MOI, otherId: AUTRE, ...PARTAGES_ALLUMES },
  { ownerId: AUTRE, otherId: MOI, ...PARTAGES_ALLUMES },
];

const ligneDe = (app: { reglages: () => Record<string, unknown>[] }, ownerId: string) =>
  app.reglages().find((r) => r.ownerId === ownerId)!;

describe('#14910 — une baisse sous le Sang retire les partages du rituel, des deux côtés', () => {
  it.each(['CLOSE', 'FRIEND', 'ACQUAINTANCE', 'PUBLIC'])('Sang → %s : plus aucun partage allumé ; daté chez moi, SANS date chez l’autre (RG-07)', async (level) => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')], reglages: reglagesDuSang() });
    const res = await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level });
    await app.close();

    expect(res.status).toBe(200);
    expect(ligneDe(app, MOI)).toMatchObject({ ...PARTAGES_ETEINTS, ...DATES_DE_RETRAIT });
    expect(ligneDe(app, AUTRE)).toMatchObject(PARTAGES_ETEINTS);
    Object.keys(DATES_DE_RETRAIT).forEach((cle) => expect(ligneDe(app, AUTRE)[cle]).toBeUndefined());
  });

  it('une baisse rejuge la séance « ensemble » de la paire (#17012)', async () => {
    rejudgeTogetherAfter.mockClear();
    const app = await appli({ liens: [lien('CLOSE', 'CLOSE')] });
    await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'FRIEND' });
    await app.close();

    expect(rejudgeTogetherAfter).toHaveBeenCalledWith(expect.anything(), { userA: MOI, userB: AUTRE });
  });

  it('un partage déjà retiré garde sa date de retrait', async () => {
    const avant = new Date(NOW.getTime() - 5 * DAY);
    const app = await appli({
      liens: [lien('BLOOD', 'BLOOD')],
      reglages: [{ ownerId: MOI, otherId: AUTRE, ...PARTAGES_ALLUMES, locationShared: false, locationWithdrawnAt: avant }],
    });
    await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'CLOSE' });
    await app.close();

    expect(app.reglages()[0]).toMatchObject({ locationShared: false, locationWithdrawnAt: avant, proximityWithdrawnAt: NOW });
  });

  it('les blocages de réception (Bring, talkie) ne sont pas des partages : ils restent', async () => {
    const bloqueLe = new Date(NOW.getTime() - DAY);
    const app = await appli({
      liens: [lien('BLOOD', 'BLOOD')],
      reglages: [{ ownerId: MOI, otherId: AUTRE, ...PARTAGES_ALLUMES, bringBlockedAt: bloqueLe, talkieBlockedAt: bloqueLe }],
    });
    await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'FRIEND' });
    await app.close();

    expect(app.reglages()[0]).toMatchObject({ bringBlockedAt: bloqueLe, talkieBlockedAt: bloqueLe });
  });

  it('un lien déjà sous le Sang qui baisse encore retire aussi les partages restés allumés', async () => {
    const app = await appli({ liens: [lien('CLOSE', 'CLOSE')], reglages: reglagesDuSang() });
    await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'FRIEND' });
    await app.close();

    app.reglages().forEach((ligne) => expect(ligne).toMatchObject(PARTAGES_ETEINTS));
  });

  it('un niveau égal (Sang → Sang) laisse le lien au Sang : aucun partage n’est touché', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')], reglages: reglagesDuSang() });
    const res = await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'BLOOD' });
    await app.close();

    expect(res.status).toBe(200);
    app.reglages().forEach((ligne) => expect(ligne).toMatchObject(PARTAGES_ALLUMES));
  });
});

describe('#14910 — Annuler le lien (PUBLIC) : plus aucune amitié servie nulle part', () => {
  it('je ne baisse que MON accord, mais le niveau effectif tombe à PUBLIC pour LES DEUX, et aucune liste ne nous relie plus', async () => {
    const app = await appli({
      liens: [lien('FRIEND', 'FRIEND')],
      demandes: [demande('cc0000000000000000000001', 'accepted', AUTRE, MOI, { targetLevel: 'FRIEND' })],
    });
    await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'PUBLIC' });
    const vuParMoi = await app.call('GET', `${PREFIXE}/${AUTRE}`);
    const vuParLui = await app.call('GET', `${PREFIXE}/${MOI}`, undefined, AUTRE);
    const mesCercles = await app.call('GET', PREFIXE);
    const sesCercles = await app.call('GET', PREFIXE, undefined, AUTRE);
    await app.close();

    const row = app.store.relations()[0];
    expect(MOI === LOW ? row.grantedByLow : row.grantedByHigh).toBe('PUBLIC');
    expect(MOI === LOW ? row.grantedByHigh : row.grantedByLow).toBe('FRIEND');
    expect(vuParMoi.body.data.effectiveLevel).toBe('PUBLIC');
    expect(vuParLui.body.data.effectiveLevel).toBe('PUBLIC');
    expect(mesCercles.body.data).toEqual([]);
    expect(sesCercles.body.data).toEqual([]);
    expect(app.store.friendRequests()).toEqual([]);
  });

  it('la loi d’accès (présence, fil, audiences) ne lit plus d’amitié, et les caches d’amis des deux sont oubliés', async () => {
    const app = await appli({
      liens: [lien('CLOSE', 'CLOSE')],
      demandes: [demande('cc0000000000000000000001', 'accepted', MOI, AUTRE, { targetLevel: 'FRIEND' })],
    });
    await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'PUBLIC' });
    await app.close();

    const db = app.store.prisma as never;
    expect(await niveauEffectif(db, MOI, AUTRE)).toBe('PUBLIC');
    expect(await niveauEffectif(db, AUTRE, MOI)).toBe('PUBLIC');
    expect(await amisAcceptes(db, MOI)).not.toContain(AUTRE);
    expect(await amisAcceptes(db, AUTRE)).not.toContain(MOI);
    const cles = cacheDel.mock.calls.map(([key]) => key);
    expect(cles).toEqual(expect.arrayContaining([`feed:friends:${MOI}`, `feed:friends:${AUTRE}`]));
  });
});

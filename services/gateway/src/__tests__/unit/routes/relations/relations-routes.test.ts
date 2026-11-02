/**
 * #13933 — lire ses cercles, baisser ou sortir en silence.
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
jest.mock('../../../../services/CacheStore', () => ({
  ...(jest.requireActual('../../../../services/CacheStore') as object),
  getCacheStore: () => ({ del: async () => undefined }),
}));

import { relationsRoutes } from '../../../../routes/relations';
import { relationsLevelRoutes } from '../../../../routes/relations/level';
import {
  AUTRE, DAY, MOI, NOW, TIERS, buildRelationApp, demande, freezeClock, lien, semaineActive, thawClock,
  type AppOptions,
} from '../../../helpers/relation-app';

const LOW = MOI < AUTRE ? MOI : AUTRE;
const HIGH = MOI < AUTRE ? AUTRE : MOI;
const PREFIXE = '/api/v1/relations';

const appli = (options: AppOptions = {}) => buildRelationApp(async (a) => { await a.register(relationsRoutes, { prefix: PREFIXE }); await a.register(relationsLevelRoutes, { prefix: PREFIXE }); }, options);
const cooldownOf = (row: Record<string, unknown> | undefined, userId: string): Date | undefined =>
  (userId === LOW ? row?.cooldownLowUntil : row?.cooldownHighUntil) as Date | undefined;

beforeEach(() => freezeClock(NOW));
afterEach(() => thawClock());

describe('#13933 — GET /relations/config', () => {
  it('sert les niveaux (clé i18n, icône, sept langues), les seuils et la matrice des features', async () => {
    const app = await appli();
    const res = await app.call('GET', `${PREFIXE}/config`);
    await app.close();

    expect(res.status).toBe(200);
    const levels = res.body.data.levels as Array<{ level: string; labelKey: string; icon: string; labels: Record<string, string> }>;
    expect(levels.map((l) => l.level)).toEqual(['PUBLIC', 'COMMUNITY', 'ACQUAINTANCE', 'FRIEND', 'CLOSE', 'BLOOD']);
    expect(levels.find((l) => l.level === 'BLOOD')).toMatchObject({ labelKey: 'relation.level.BLOOD', icon: '🩸' });
    expect(Object.keys(levels[0].labels).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'pt-BR']);
    expect(res.body.data.thresholds).toMatchObject({ cooldownDays: 30, blood: { activeWeeks: 12 }, close: { activeWeeks: 4 } });
    expect(res.body.data.features['presence.detailed']).toBe('CLOSE');
  });
});

describe('#13933 — GET /relations', () => {
  it('liste les liens d’au moins Connaissance, avec le niveau effectif, ce que J’accorde et la progression', async () => {
    const app = await appli({
      liens: [lien('CLOSE', 'FRIEND'), { ...lien('FRIEND', 'FRIEND'), id: 'aa0000000000000000000098', userLowId: MOI < TIERS ? MOI : TIERS, userHighId: MOI < TIERS ? TIERS : MOI }],
      jours: [semaineActive(0, LOW, HIGH), semaineActive(1, LOW, HIGH)],
    });
    const res = await app.call('GET', PREFIXE);
    await app.close();

    expect(res.status).toBe(200);
    const items = res.body.data as Array<Record<string, any>>;
    const avecAutre = items.find((i) => i.userId === AUTRE)!;
    expect(avecAutre).toMatchObject({ effectiveLevel: 'FRIEND', grantedByMe: MOI === LOW ? 'CLOSE' : 'FRIEND' });
    expect(avecAutre.progress).toMatchObject({ activeWeeks: 2, needed: 4 });
    expect(avecAutre.progress.missing).toEqual(expect.any(Array));
    expect(avecAutre.eligibleFor).toBeNull();
    expect(items.map((i) => i.userId).sort()).toEqual([AUTRE, TIERS].sort());
  });

  it('écarte les liens redevenus Public (cool-down seul) et les personnes bloquées', async () => {
    const app = await appli({
      liens: [lien('PUBLIC', 'PUBLIC', MOI === LOW ? { cooldownLowUntil: new Date(NOW.getTime() + DAY) } : { cooldownHighUntil: new Date(NOW.getTime() + DAY) })],
    });
    const res = await app.call('GET', PREFIXE);
    await app.close();

    expect(res.body.data).toEqual([]);
  });

  it('ne sert ni présence, ni nom, ni cool-down — l’état d’un refus ne fuit pas', async () => {
    const app = await appli({ liens: [lien('FRIEND', 'FRIEND', MOI === LOW ? { cooldownLowUntil: new Date(NOW.getTime() + DAY) } : { cooldownHighUntil: new Date(NOW.getTime() + DAY) })] });
    const res = await app.call('GET', PREFIXE);
    await app.close();

    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toMatch(/cooldown|isOnline|lastActiveAt|username|displayName/i);
  });

  it('une baisse ne se lit jamais dans `since` : la date servie est celle d’une MONTÉE visible', async () => {
    const montee = new Date(NOW.getTime() - 40 * DAY);
    const baisse = new Date(NOW.getTime() - 20 * DAY);
    const app = await appli({
      liens: [lien('FRIEND', 'FRIEND', {
        levelSince: baisse,
        transitions: [
          { actorId: MOI, from: 'PUBLIC', to: 'FRIEND', at: montee },
          { actorId: AUTRE, from: 'PUBLIC', to: 'FRIEND', at: montee },
          { actorId: MOI, from: 'FRIEND', to: 'ACQUAINTANCE', at: new Date(NOW.getTime() - 30 * DAY) },
          { actorId: MOI, from: 'ACQUAINTANCE', to: 'FRIEND', at: baisse },
        ],
      })],
    });
    const res = await app.call('GET', PREFIXE);
    await app.close();

    expect(new Date(res.body.data[0].since).getTime()).toBe(montee.getTime());
  });
});

describe('#13933 — POST /relations/:userId/level — baisser ou sortir', () => {
  it('baisse MON accord : le niveau effectif suit, l’accord de l’autre est intact', async () => {
    const app = await appli({ liens: [lien('CLOSE', 'CLOSE')] });
    const res = await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'FRIEND' });
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ userId: AUTRE, effectiveLevel: 'FRIEND', grantedByMe: 'FRIEND' });
    const row = app.store.relations()[0];
    expect(MOI === LOW ? row.grantedByLow : row.grantedByHigh).toBe('FRIEND');
    expect(MOI === LOW ? row.grantedByHigh : row.grantedByLow).toBe('CLOSE');
  });

  it('sortir (Public) est une baisse comme une autre', async () => {
    const app = await appli({ liens: [lien('FRIEND', 'FRIEND')] });
    const res = await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'PUBLIC' });
    await app.close();

    expect(res.body.data.effectiveLevel).toBe('PUBLIC');
  });

  it('est SILENCIEUX : aucune notification, aucun événement, vers personne', async () => {
    const app = await appli({ liens: [lien('CLOSE', 'CLOSE')] });
    await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'ACQUAINTANCE' });
    await app.close();

    expect(app.emissions).toEqual([]);
    expect(Object.values(app.notifier).flatMap((fn) => fn.mock.calls)).toEqual([]);
  });

  it('pose le cool-down de 30 jours sur l’AUTRE (RG-08), pas sur celui qui baisse', async () => {
    const app = await appli({ liens: [lien('CLOSE', 'CLOSE')] });
    await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'FRIEND' });
    await app.close();

    const row = app.store.relations()[0];
    expect(cooldownOf(row, AUTRE)?.getTime()).toBe(NOW.getTime() + 30 * DAY);
    expect(cooldownOf(row, MOI)).toBeUndefined();
  });

  it('grave la baisse dans l’historique, qui ne la sert jamais', async () => {
    const app = await appli({ liens: [lien('CLOSE', 'CLOSE')] });
    await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'FRIEND' });
    await app.close();

    expect(app.store.relations()[0].transitions).toEqual([{ actorId: MOI, from: 'CLOSE', to: 'FRIEND', at: NOW }]);
  });

  it('refuse de MONTER par cette route : 400 RELATION_NOT_A_DROP, et un niveau égal ne change rien', async () => {
    const app = await appli({ liens: [lien('FRIEND', 'FRIEND')] });
    const haut = await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'CLOSE' });
    const egal = await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'FRIEND' });
    await app.close();

    expect(haut.status).toBe(400);
    expect(haut.body.code).toBe('RELATION_NOT_A_DROP');
    expect(egal.status).toBe(200);
    expect(app.store.relations()[0]).toMatchObject({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' });
    expect(cooldownOf(app.store.relations()[0], AUTRE)).toBeUndefined();
  });

  it.each(['COMMUNITY', 'ATOM', 'nope', 3])('un niveau %s est refusé 400 RELATION_LEVEL_INVALID', async (level) => {
    const app = await appli({ liens: [lien('FRIEND', 'FRIEND')] });
    const res = await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level });
    await app.close();

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RELATION_LEVEL_INVALID');
  });

  it('une baisse sous Ami retire les demandes acceptées de la paire : aucun lecteur historique de FriendRequest ne la lit encore comme une amitié', async () => {
    const app = await appli({
      liens: [lien('FRIEND', 'FRIEND')],
      demandes: [
        demande('cc0000000000000000000001', 'accepted', MOI, AUTRE),
        demande('cc0000000000000000000002', 'accepted', AUTRE, MOI, { targetLevel: 'FRIEND' }),
        demande('cc0000000000000000000003', 'accepted', MOI, TIERS),
      ],
    });
    await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'ACQUAINTANCE' });
    await app.close();

    expect(app.store.friendRequests().map((d) => d.id)).toEqual(['cc0000000000000000000003']);
  });

  it('un ami d’avant les cercles (demande acceptée, aucune ligne de lien encore) peut baisser : le lien naît à Ami puis baisse', async () => {
    const app = await appli({ demandes: [demande('cc0000000000000000000001', 'accepted', AUTRE, MOI)] });
    const res = await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'ACQUAINTANCE' });
    const lu = await app.call('GET', `${PREFIXE}/${AUTRE}`);
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ effectiveLevel: 'ACQUAINTANCE', grantedByMe: 'ACQUAINTANCE' });
    expect(lu.body.data.effectiveLevel).toBe('ACQUAINTANCE');
    expect(cooldownOf(app.store.relations()[0], AUTRE)?.getTime()).toBe(NOW.getTime() + 30 * DAY);
    expect(app.store.friendRequests()).toEqual([]);
  });

  it('une baisse de Sang à Ami retire les demandes de Proche et de Sang, garde celle d’Ami', async () => {
    const app = await appli({
      liens: [lien('BLOOD', 'BLOOD')],
      demandes: [
        demande('cc0000000000000000000001', 'accepted', MOI, AUTRE, { targetLevel: 'FRIEND' }),
        demande('cc0000000000000000000002', 'accepted', AUTRE, MOI, { targetLevel: 'CLOSE' }),
        demande('cc0000000000000000000003', 'accepted', MOI, AUTRE, { targetLevel: 'BLOOD' }),
      ],
    });
    const res = await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'FRIEND' });
    await app.close();

    expect(res.body.data.effectiveLevel).toBe('FRIEND');
    expect(app.store.friendRequests().map((d) => d.id)).toEqual(['cc0000000000000000000001']);
  });

  it('la demande acceptée qui fondait le lien ne le relève pas : le lien baissé reste baissé au prochain GET', async () => {
    const app = await appli({ liens: [lien('FRIEND', 'FRIEND')] });
    await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'PUBLIC' });
    const lu = await app.call('GET', `${PREFIXE}/${AUTRE}`);
    await app.close();

    expect(lu.body.data.effectiveLevel).toBe('PUBLIC');
  });
});

describe('#13933 — le plancher de version couvre toutes les routes de cercles', () => {
  it.each([
    ['GET', '', undefined],
    ['GET', '/config', undefined],
    ['GET', `/${AUTRE}`, undefined],
    ['POST', `/${AUTRE}/level`, { level: 'PUBLIC' }],
    ['POST', `/${AUTRE}/ritual`, { phase: 'start' }],
  ] as const)('%s %s : 426 UPGRADE_REQUIRED sous le plancher, le web n’est jamais bloqué', async (method, suffixe, body) => {
    process.env.MIN_APP_VERSION = '9.0.0';
    try {
      const vieux = await appli({ headers: { 'x-app-version': '1.0.0', 'x-app-platform': 'ios' }, liens: [lien('FRIEND', 'FRIEND')] });
      const web = await appli({ liens: [lien('FRIEND', 'FRIEND')] });
      const refuse = await vieux.call(method, `${PREFIXE}${suffixe}`, body);
      const passe = await web.call(method, `${PREFIXE}${suffixe}`, body);
      await vieux.close();
      await web.close();

      expect(refuse.status).toBe(426);
      expect(refuse.body.code).toBe('UPGRADE_REQUIRED');
      expect(passe.status).not.toBe(426);
    } finally {
      delete process.env.MIN_APP_VERSION;
    }
  });
});

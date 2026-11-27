/**
 * #19571 — un compte suspendu ou supprimé disparaît de « Mes cercles », et son
 * lien ne promet plus aucun outil de cercle.
 *
 * Le lien n'est ni effacé ni baissé : un compte réactivé retrouve le niveau
 * d'avant. Tant qu'il est inutilisable, ses trois lectures — la liste, la fiche
 * d'un lien et la réponse d'une baisse — le servent comme un inconnu.
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
jest.mock('../../../../services/together/togetherDeps', () => ({
  rejudgeTogetherAfter: async () => undefined,
}));

import { relationsRoutes } from '../../../../routes/relations';
import { relationsLevelRoutes } from '../../../../routes/relations/level';
import {
  AUTRE, DAY, MOI, NOW, buildRelationApp, freezeClock, lien, thawClock, type AppOptions,
} from '../../../helpers/relation-app';

const PREFIXE = '/api/v1/relations';
const INCONNU = '507f1f77bcf86cd799439abc';

const appli = (options: AppOptions = {}) => buildRelationApp(async (a) => {
  await a.register(relationsRoutes, { prefix: PREFIXE });
  await a.register(relationsLevelRoutes, { prefix: PREFIXE });
}, options);

const SUSPENDU = { isActive: false, deactivatedAt: new Date(NOW.getTime() - DAY) };
const SUPPRIME = { isActive: false, deletedAt: new Date(NOW.getTime() - DAY) };
const DESACTIVE_SEUL = { deactivatedAt: new Date(NOW.getTime() - DAY) };

const VUE_FERMEE = {
  effectiveLevel: 'PUBLIC', grantedByMe: 'PUBLIC', since: null,
  progress: { activeWeeks: 0, needed: null, missing: [] }, eligibleFor: null,
};

beforeEach(() => freezeClock(NOW));
afterEach(() => thawClock());

describe.each([
  ['suspendu', SUSPENDU],
  ['supprimé en attente de purge', SUPPRIME],
  ['désactivé (isActive encore vrai)', DESACTIVE_SEUL],
])('#19571 — un compte %s', (_cas, etat) => {
  it('GET /relations ne le liste pas, et le lien vivant d’à côté reste', async () => {
    const app = await appli({ liens: [lien('CLOSE', 'CLOSE')], comptes: { [AUTRE]: etat } });
    const res = await app.call('GET', PREFIXE);
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data.map((l: { userId: string }) => l.userId)).not.toContain(AUTRE);
  });

  it('GET /relations/:userId le sert exactement comme un inconnu : PUBLIC, canRaise faux, aucun outil', async () => {
    const app = await appli({ liens: [lien('CLOSE', 'CLOSE')], comptes: { [AUTRE]: etat } });
    const lui = (await app.call('GET', `${PREFIXE}/${AUTRE}`)).body.data;
    const inconnu = (await app.call('GET', `${PREFIXE}/${INCONNU}`)).body.data;
    await app.close();

    expect(lui).toEqual({ ...inconnu, userId: AUTRE });
    expect(lui).toEqual({ userId: AUTRE, ...VUE_FERMEE, canRaise: false, raiseBlockedUntil: null, accessLevel: 'PUBLIC' });
  });

  it('POST /relations/:userId/level rend la même vue fermée, et la baisse est quand même écrite', async () => {
    const app = await appli({ liens: [lien('CLOSE', 'CLOSE')], comptes: { [AUTRE]: etat } });
    const res = await app.call('POST', `${PREFIXE}/${AUTRE}/level`, { level: 'FRIEND' });
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ userId: AUTRE, ...VUE_FERMEE });
    const [ligne] = app.store.relations();
    expect(MOI < AUTRE ? ligne.grantedByLow : ligne.grantedByHigh).toBe('FRIEND');
  });
});

describe('#19571 — à la réactivation, le lien revient à son niveau d’avant', () => {
  it('le même lien, suspendu puis réactivé : absent, puis Proche avec ses outils', async () => {
    const suspendu = await appli({ liens: [lien('CLOSE', 'CLOSE')], comptes: { [AUTRE]: SUSPENDU } });
    const avant = (await suspendu.call('GET', PREFIXE)).body.data;
    await suspendu.close();

    const reactive = await appli({ liens: [lien('CLOSE', 'CLOSE')], comptes: { [AUTRE]: { isActive: true, deactivatedAt: null } } });
    const liste = (await reactive.call('GET', PREFIXE)).body.data;
    const fiche = (await reactive.call('GET', `${PREFIXE}/${AUTRE}`)).body.data;
    await reactive.close();

    expect(avant).toEqual([]);
    expect(liste).toEqual([expect.objectContaining({ userId: AUTRE, effectiveLevel: 'CLOSE' })]);
    expect(fiche).toMatchObject({ userId: AUTRE, effectiveLevel: 'CLOSE', accessLevel: 'CLOSE' });
  });
});

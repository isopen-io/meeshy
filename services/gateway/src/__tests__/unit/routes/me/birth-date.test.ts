/**
 * `PUT /api/v1/me/birth-date` (#9927) — la date de naissance se déclare UNE
 * fois, à l'onboarding, facultativement. Sous 13 ans révolus : refus, rien
 * n'est écrit. De 13 à 17 ans : Meeshy Global passe en lecture seule. Une
 * seconde déclaration est refusée — un mineur ne se redéclare pas majeur ;
 * une correction passe par le support.
 *
 * Et l'état d'onboarding (`GET`/`PATCH /me/onboarding`) le dit au client qui
 * annonce `X-Meeshy-Capabilities: onboarding-age` : `viewerWriteRestriction`
 * (`'minor-global'` ou `null`) et l'étape `age`. Sans l'en-tête, l'état est
 * EXACTEMENT celui d'avant le lot (#9223).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { meBirthDateRoutes } from '../../../../routes/me/birth-date';
import { meOnboardingRoutes } from '../../../../routes/me/onboarding';
import { OnboardingStateSchema } from '@meeshy/shared/types/onboarding';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const USER_ID = '68a000000000000000000001';
const NOW = new Date('2026-10-10T12:00:00.000Z');

/** `birthDate` : `undefined` = clé ABSENTE du document, `null` = présente et nulle (deux formes du connecteur Mongo). */
type Row = { birthDate: Date | null | undefined; onboardingSteps: string[] };

type BirthDateClause = { birthDate: null } | { birthDate: { isSet: false } };

/** Évalue `where.OR` comme le connecteur Mongo : `null` ne matche que présent-et-nul, `isSet: false` que l'absence. */
const matchesClause = (value: Date | null | undefined, clause: BirthDateClause): boolean =>
  clause.birthDate === null ? value === null : value === undefined;

function makePrisma(initial: Partial<Row> = {}, options: { readonly staleReads?: boolean } = {}) {
  const state: Row = { birthDate: null, onboardingSteps: ['languages'], ...initial };
  const row = () => ({
    id: USER_ID,
    createdAt: new Date('2026-10-09T09:00:00.000Z'),
    systemLanguage: 'fr',
    regionalLanguage: null,
    blockedUserIds: [],
    onboardingCompletedAt: null,
    emailVerifiedAt: null,
    phoneNumber: null,
    emailReleasedAt: null,
    engagementScore: 0,
    ...state,
    birthDate: options.staleReads ? null : state.birthDate ?? null,
  });
  const updateMany = jest.fn(async (args: { where: { id: string; OR: BirthDateClause[] }; data: Partial<Row> }) => {
    const matches = args.where.id === USER_ID && args.where.OR.some((clause) => matchesClause(state.birthDate, clause));
    if (!matches) return { count: 0 };
    Object.assign(state, args.data);
    return { count: 1 };
  });
  return {
    state,
    user: {
      findUnique: jest.fn(async () => row()),
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => row()),
      updateMany,
    },
    conversation: { findUnique: jest.fn(async () => ({ id: 'global-1' })) },
    message: { findMany: jest.fn(async () => []) },
    participant: { findMany: jest.fn(async () => []) },
    friendRequest: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    post: { findFirst: jest.fn(async () => null) },
    engagementCounter: { findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    engagementMilestone: { findMany: jest.fn(async () => []) },
    engagementConversationCredit: { findFirst: jest.fn(async () => null) },
    engagementScaleConfig: { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null) },
  };
}

const revokeAllSessions = jest.fn(async (_userId: string) => undefined);

async function buildApp(prisma: ReturnType<typeof makePrisma>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    const userId = req.headers['x-test-user-id'] as string | undefined;
    (req as { auth?: unknown }).auth = userId ? { userId, isAuthenticated: true } : undefined;
  });
  await app.register(meBirthDateRoutes, { prefix: '/api/v1/me', now: () => NOW, revokeAllSessions });
  await app.register(meOnboardingRoutes, { prefix: '/api/v1/me', now: () => NOW });
  await app.ready();
  return app;
}

const headers = { 'x-test-user-id': USER_ID };
const declare = (app: FastifyInstance, birthDate: string) =>
  app.inject({ method: 'PUT', url: '/api/v1/me/birth-date', headers, payload: { birthDate } });

describe('PUT /me/birth-date (#9927)', () => {
  it('401 sans authentification', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'PUT', url: '/api/v1/me/birth-date', payload: { birthDate: '2000-01-01' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('12 ans : 422 AGE_BELOW_MINIMUM, la date est ÉCRITE (refus définitif) et les sessions révoquées', async () => {
    revokeAllSessions.mockClear();
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await declare(app, '2013-10-11');
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ success: false, code: 'AGE_BELOW_MINIMUM' });
    expect(prisma.state.birthDate?.toISOString()).toBe('2013-10-11T00:00:00.000Z');
    expect(revokeAllSessions).toHaveBeenCalledWith(USER_ID);
    await app.close();
  });

  it('12 ans puis 2000-01-01 aussitôt : la redéclaration est refusée (409), la date de 12 ans reste', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await declare(app, '2013-10-11');
    const res = await declare(app, '2000-01-01');
    expect(res.statusCode).toBe(409);
    expect(prisma.state.birthDate?.toISOString()).toBe('2013-10-11T00:00:00.000Z');
    await app.close();
  });

  it('une date absente du document (clé non posée) s’écrit aussi', async () => {
    const prisma = makePrisma({ birthDate: undefined });
    const app = await buildApp(prisma);
    const res = await declare(app, '1990-05-05');
    expect(res.statusCode).toBe(200);
    expect(prisma.state.birthDate?.toISOString()).toBe('1990-05-05T00:00:00.000Z');
    await app.close();
  });

  it('course de deux PUT : la relecture voit « aucune date » des deux côtés, un seul gagne', async () => {
    const prisma = makePrisma({}, { staleReads: true });
    const app = await buildApp(prisma);
    const [a, b] = await Promise.all([declare(app, '2011-03-03'), declare(app, '1990-03-03')]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const winner = a.statusCode === 200 ? '2011-03-03' : '1990-03-03';
    expect(prisma.state.birthDate?.toISOString()).toBe(`${winner}T00:00:00.000Z`);
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('13 ans le jour même : mineur, Global fermée en écriture, l’étape age faite', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await declare(app, '2013-10-10');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { ageClass: 'minor', viewerWriteRestrictionGlobal: true } });
    expect(prisma.state.birthDate?.toISOString()).toBe('2013-10-10T00:00:00.000Z');
    expect(prisma.state.onboardingSteps).toEqual(['languages', 'age']);
    await app.close();
  });

  it('18 ans le jour même : majeur, Global ouverte', async () => {
    const app = await buildApp(makePrisma());
    const res = await declare(app, '2008-10-10');
    expect(res.json().data).toEqual({ ageClass: 'adult', viewerWriteRestrictionGlobal: false });
    await app.close();
  });

  it('une seconde déclaration est refusée : 409 BIRTH_DATE_ALREADY_SET, la première reste', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await declare(app, '2011-03-03');
    const res = await declare(app, '1990-03-03');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: 'BIRTH_DATE_ALREADY_SET' });
    expect(prisma.state.birthDate?.toISOString()).toBe('2011-03-03T00:00:00.000Z');
    await app.close();
  });

  it('une date déjà posée par un autre chemin compte aussi : 409', async () => {
    const app = await buildApp(makePrisma({ birthDate: new Date('2011-03-03T00:00:00.000Z') }));
    const res = await declare(app, '1990-03-03');
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it.each([
    ['une date future', '2026-10-11'],
    ['plus de 120 ans', '1905-10-10'],
    ['un jour qui n’existe pas', '2009-02-29'],
    ['une autre forme', '10/10/2000'],
  ])('%s : 400, rien n’est écrit', async (_label, birthDate) => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await declare(app, birthDate);
    expect(res.statusCode).toBe(400);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('ne garde rien d’autre que la date : un champ de plus est refusé', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'PUT', url: '/api/v1/me/birth-date', headers, payload: { birthDate: '2000-01-01', role: 'ADMIN' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

const aware = { ...headers, 'x-meeshy-capabilities': 'onboarding-age' };

/** Les clés de l'état d'onboarding AVANT #9927 — ce qu'un client antérieur sait décoder. */
const PRE_9927_KEYS = [
  'canPublishStory', 'completedAt', 'eligible', 'emailVerified', 'globalConversationId', 'pendingFriendRequests',
  'prefilledSteps', 'protectedRegime', 'seenSteps', 'stepRewards', 'storyDefaultVisibility', 'suggestions',
];
const PRE_9927_STEPS = ['languages', 'email', 'global', 'story', 'friends', 'notifications'];

describe('GET /me/onboarding — la restriction de Global, au client qui l’annonce (#9927)', () => {
  it('mineur déclaré : viewerWriteRestriction minor-global, l’étape age, conforme au contrat', async () => {
    const app = await buildApp(makePrisma({ birthDate: new Date('2011-03-03T00:00:00.000Z'), onboardingSteps: ['languages', 'age'] }));
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding', headers: aware });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.viewerWriteRestriction).toBe('minor-global');
    expect(res.json().data.seenSteps).toEqual(['languages', 'age']);
    expect(OnboardingStateSchema.safeParse(res.json().data).success).toBe(true);
    expect(String(res.headers.vary).toLowerCase()).toContain('x-meeshy-capabilities');
    await app.close();
  });

  it.each([
    ['âge inconnu', null],
    ['majeur', new Date('1990-01-01T00:00:00.000Z')],
    ['18 ans le jour même', new Date('2008-10-10T00:00:00.000Z')],
  ])('%s : le champ est servi, à null — sa présence annonce l’étape age', async (_label, birthDate) => {
    const app = await buildApp(makePrisma({ birthDate }));
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding', headers: aware });
    expect(res.json().data).toHaveProperty('viewerWriteRestriction', null);
    expect(OnboardingStateSchema.safeParse(res.json().data).success).toBe(true);
    await app.close();
  });

  it.each(['onboarding-age', 'ONBOARDING-AGE', 'other-cap, Onboarding-Age ,x'])('le jeton se lit dans une liste, sans casse : « %s »', async (value) => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding', headers: { ...headers, 'x-meeshy-capabilities': value } });
    expect(res.json().data).toHaveProperty('viewerWriteRestriction', null);
    await app.close();
  });
});

describe('GET/PATCH /me/onboarding — un client antérieur reçoit EXACTEMENT l’état d’avant (#9927, #9223)', () => {
  it.each([
    ['sans en-tête', headers],
    ['avec une autre capacité', { ...headers, 'x-meeshy-capabilities': 'something-else' }],
  ])('%s : mêmes clés qu’avant, ni étape age ni viewerWriteRestriction — même pour un mineur', async (_label, h) => {
    const app = await buildApp(makePrisma({ birthDate: new Date('2011-03-03T00:00:00.000Z'), onboardingSteps: ['languages', 'age', 'global'] }));
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding', headers: h });
    const data = res.json().data;
    expect(Object.keys(data).sort()).toEqual(PRE_9927_KEYS);
    expect(data.seenSteps).toEqual(['languages', 'global']);
    expect([...data.seenSteps, ...data.prefilledSteps].every((step: string) => PRE_9927_STEPS.includes(step))).toBe(true);
    await app.close();
  });

  it('PATCH sans en-tête : même forme d’avant', async () => {
    const app = await buildApp(makePrisma({ birthDate: new Date('2011-03-03T00:00:00.000Z'), onboardingSteps: ['languages', 'age'] }));
    const res = await app.inject({ method: 'PATCH', url: '/api/v1/me/onboarding', headers, payload: { step: 'global', outcome: 'done' } });
    expect(Object.keys(res.json().data).sort()).toEqual(PRE_9927_KEYS);
    expect(res.json().data.seenSteps).not.toContain('age');
    await app.close();
  });

  it('PATCH avec l’en-tête : l’étape age et la restriction reviennent', async () => {
    const app = await buildApp(makePrisma({ birthDate: new Date('2011-03-03T00:00:00.000Z'), onboardingSteps: ['languages', 'age'] }));
    const res = await app.inject({ method: 'PATCH', url: '/api/v1/me/onboarding', headers: aware, payload: { step: 'global', outcome: 'done' } });
    expect(res.json().data.seenSteps).toContain('age');
    expect(res.json().data.viewerWriteRestriction).toBe('minor-global');
    await app.close();
  });
});

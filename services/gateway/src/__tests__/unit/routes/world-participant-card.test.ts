/**
 * #10102 — `GET /api/v1/world/participants/:participantId` : la fiche d'un
 * participant de World Wide, invité compris, lue par l'ÉQUIPE (rôle au-delà
 * de USER) pour modérer.
 *
 * Le VRAI module de route est monté, le VRAI schéma de réponse traverse
 * fast-json-stringify. Le double Prisma rend des lignes COMPLÈTES — adresse IP,
 * ville, User-Agent brut, empreinte, e-mail, présence — quel que soit le
 * `select` : ce qui ne sort pas est retenu par la PROJECTION de la route, pas
 * par la chance d'un `select`. Et il REFUSE ce que la base refuserait : un
 * participant ne se trouve que dans SA conversation.
 *
 * @jest-environment node
 */

import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';
import {
  WORLD_PARTICIPANT_CARD_ERRORS,
  mayReadWorldParticipantCard,
  worldParticipantCardSchema,
} from '@meeshy/shared/types/world-participant-card';
import { participantsByParticipantId } from '@meeshy/shared/api/endpoints/world';
import { worldParticipantCardRoutes } from '../../../routes/world-participant-card';

const WORLD_ID = '507f1f77bcf86cd799439001';
const OTHER_CONV_ID = '507f1f77bcf86cd799439002';
const GUEST_ID = '507f1f77bcf86cd799439011';
const MEMBER_ID = '507f1f77bcf86cd799439012';
const ELSEWHERE_ID = '507f1f77bcf86cd799439013';
const MEMBER_USER_ID = '507f1f77bcf86cd799439021';
const READER_ID = '507f1f77bcf86cd799439031';
const LINK_ID = '507f1f77bcf86cd799439041';

const LEAKY_IP = '203.0.113.77';
const RAW_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 Version/17.4.1 Mobile/15E148 Safari/604.1';

const guestRow = () => ({
  id: GUEST_ID,
  conversationId: WORLD_ID,
  type: 'anonymous',
  userId: null,
  displayName: 'nova_anon',
  nickname: null,
  avatar: null,
  role: 'member',
  language: 'pt',
  isActive: true,
  isOnline: true,
  lastActiveAt: new Date('2026-10-11T08:00:00Z'),
  joinedAt: new Date('2026-10-11T07:30:00Z'),
  leftAt: null,
  bannedAt: null,
  sessionTokenHash: 'hash-secret-token',
  shareLinkId: LINK_ID,
  joinCountry: 'BR',
  anonymousSession: {
    shareLinkId: LINK_ID,
    session: {
      sessionTokenHash: 'hash-secret-token',
      country: null,
      deviceFingerprint: 'fp-secret',
      connectedAt: new Date('2026-10-11T07:30:00Z'),
      ipAddress: LEAKY_IP,
      client: { browser: 'Mobile Safari', browserVersion: '17', os: 'iOS', osVersion: '17', deviceType: 'mobile' },
    },
    profile: { firstName: 'Nova', lastName: '', username: 'nova_anon', email: 'nova@example.com', birthday: new Date('2000-01-01') },
    rights: null,
  },
});

const memberRow = (joinCountry: string | null = null) => ({
  id: MEMBER_ID,
  conversationId: WORLD_ID,
  type: 'user',
  userId: MEMBER_USER_ID,
  displayName: 'Awa',
  nickname: null,
  avatar: null,
  role: 'moderator',
  language: 'fr',
  isActive: false,
  isOnline: false,
  lastActiveAt: new Date('2026-10-10T08:00:00Z'),
  joinedAt: new Date('2026-10-01T10:00:00Z'),
  leftAt: new Date('2026-10-09T10:00:00Z'),
  bannedAt: null,
  sessionTokenHash: null,
  shareLinkId: null,
  joinCountry,
  anonymousSession: null,
});

const elsewhereRow = () => ({ ...guestRow(), id: ELSEWHERE_ID, conversationId: OTHER_CONV_ID });

const memberUser = (role = 'USER') => ({
  id: MEMBER_USER_ID,
  username: 'awa',
  email: 'awa@example.com',
  phoneNumber: '+221770000000',
  role,
  systemLanguage: 'fr',
  regionalLanguage: 'wo',
  customDestinationLanguage: null,
  deviceLocale: 'en',
  isOnline: true,
  lastActiveAt: new Date('2026-10-11T08:00:00Z'),
  registrationCountry: 'SN',
});

const memberSession = () => ({
  id: 'session-1',
  userId: MEMBER_USER_ID,
  ipAddress: LEAKY_IP,
  city: 'Dakar',
  location: 'Dakar, Senegal',
  country: 'SN',
  userAgent: RAW_UA,
  deviceType: 'desktop',
  deviceVendor: 'Apple',
  deviceModel: 'Macintosh',
  osName: 'macOS',
  osVersion: '14.5.0',
  browserName: 'Chrome',
  browserVersion: '129.0.6668.90',
  platform: 'web',
  appVersion: '2.0.14',
  deviceFingerprint: 'fp-session-secret',
  lastActivityAt: new Date('2026-10-11T07:00:00Z'),
});

const shareLinkRow = () => ({ id: LINK_ID, linkId: 'mshy_abc123', identifier: 'mshy_world', name: 'World Wide', createdBy: 'x' });

type ReaderHeader = 'none' | 'guest' | string;

type FixtureOptions = {
  readonly world?: boolean;
  readonly auditFails?: boolean;
  /** Le rôle GLOBAL du compte lu — `USER` par défaut. */
  readonly memberRole?: string;
  /** Le pays d'arrivée par lien du compte lu — `null` par défaut. */
  readonly memberJoinCountry?: string | null;
  /** L'identifiant du LECTEUR — `READER_ID` par défaut. */
  readonly readerId?: string;
};

function fakePrisma(options: FixtureOptions = {}) {
  const rows = [guestRow(), memberRow(options.memberJoinCountry ?? null), elsewhereRow()];
  return {
    conversation: {
      findFirst: jest.fn(async ({ where }: { where: { identifier?: string } }) =>
        options.world === false || where.identifier !== 'world' ? null : { id: WORLD_ID }),
    },
    participant: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string; conversationId?: string } }) =>
        rows.find((row) => row.id === where.id && row.conversationId === where.conversationId) ?? null),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        (where.id === MEMBER_USER_ID ? memberUser(options.memberRole) : null)),
    },
    userSession: {
      findFirst: jest.fn(async ({ where }: { where: { userId: string } }) => (where.userId === MEMBER_USER_ID ? memberSession() : null)),
    },
    conversationShareLink: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (where.id === LINK_ID ? shareLinkRow() : null)),
    },
    adminAuditLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (options.auditFails) throw new Error('mongo down');
        return { id: 'audit-1', ...data };
      }),
    },
  };
}

async function authenticateStub(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  const header = (request.headers['x-test-reader'] as ReaderHeader | undefined) ?? 'none';
  if (header === 'none') {
    return reply.status(401).send({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }
  const readerId = (request.headers['x-test-reader-id'] as string | undefined) ?? READER_ID;
  const authContext = header === 'guest'
    ? { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: GUEST_ID, participantId: GUEST_ID }
    : { type: 'user', isAuthenticated: true, isAnonymous: false, userId: readerId, registeredUser: { id: readerId, role: header } };
  (request as FastifyRequest & { authContext: unknown }).authContext = authContext;
  return undefined;
}

async function buildApp(options: FixtureOptions = {}) {
  const prisma = fakePrisma(options);
  const app = Fastify();
  app.decorate('prisma', prisma as never);
  await app.register(worldParticipantCardRoutes, { prefix: '/api/v1', authenticate: authenticateStub });
  await app.ready();
  return { app, prisma };
}

async function read(participantId: string, reader: ReaderHeader, options: FixtureOptions = {}) {
  const { app, prisma } = await buildApp(options);
  const res = await app.inject({
    method: 'GET',
    url: participantsByParticipantId(participantId),
    headers: {
      'x-test-reader': reader,
      'user-agent': 'moderator-browser/1.0',
      ...(options.readerId ? { 'x-test-reader-id': options.readerId } : {}),
    },
  });
  await app.close();
  return { res, body: JSON.parse(res.body || '{}'), prisma };
}

describe('la loi d’accès — un rôle AU-DELÀ de USER, et rien d’autre', () => {
  it.each(['ANALYST', 'AUDIT', 'MODERATOR', 'ADMIN', 'BIGBOSS', 'analyst'])('%s lit la fiche', (role) => {
    expect(mayReadWorldParticipantCard(role)).toBe(true);
  });

  it.each([['USER'], ['AGENT'], ['SUPERUSER'], [''], [null], [undefined]])('%p ne la lit pas', (role) => {
    expect(mayReadWorldParticipantCard(role as string | null | undefined)).toBe(false);
  });
});

describe('GET /api/v1/world/participants/:participantId — qui lit', () => {
  it.each(['ANALYST', 'AUDIT', 'MODERATOR', 'ADMIN', 'BIGBOSS'])('%s ouvre la fiche d’un invité', async (role) => {
    const { res, body } = await read(GUEST_ID, role);

    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(worldParticipantCardSchema.parse(body.data).participantId).toBe(GUEST_ID);
  });

  it.each(['USER', 'AGENT', 'SUPERUSER'])('%s est refusé (403) — et rien n’est lu ni tracé avant le refus', async (role) => {
    const { res, body, prisma } = await read(GUEST_ID, role);

    expect(res.statusCode).toBe(403);
    expect(body).toMatchObject({ success: false, code: WORLD_PARTICIPANT_CARD_ERRORS.forbidden });
    expect(body.data).toBeUndefined();
    expect(prisma.participant.findFirst).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('un invité de lien partagé est refusé (403), même sur sa propre fiche', async () => {
    const { res, body, prisma } = await read(GUEST_ID, 'guest');

    expect(res.statusCode).toBe(403);
    expect(body.code).toBe(WORLD_PARTICIPANT_CARD_ERRORS.forbidden);
    expect(prisma.participant.findFirst).not.toHaveBeenCalled();
  });

  it('sans créance : 401', async () => {
    const { res } = await read(GUEST_ID, 'none');

    expect(res.statusCode).toBe(401);
  });

  it('un identifiant qui n’est pas un ObjectId : 400, sans lecture', async () => {
    const { res, prisma } = await read('not-an-id', 'ADMIN');

    expect(res.statusCode).toBe(400);
    expect(prisma.participant.findFirst).not.toHaveBeenCalled();
  });
});

describe('le périmètre — World Wide, et lui seul', () => {
  it('le participant d’une AUTRE conversation est hors périmètre : 404, sans trace', async () => {
    const { res, body, prisma } = await read(ELSEWHERE_ID, 'BIGBOSS');

    expect(res.statusCode).toBe(404);
    expect(body.code).toBe(WORLD_PARTICIPANT_CARD_ERRORS.notFound);
    expect(body.data).toBeUndefined();
    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ELSEWHERE_ID, conversationId: WORLD_ID } }),
    );
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('sans World Wide semée : 404', async () => {
    const { res, body } = await read(GUEST_ID, 'ADMIN', { world: false });

    expect(res.statusCode).toBe(404);
    expect(body.code).toBe(WORLD_PARTICIPANT_CARD_ERRORS.notFound);
  });
});

describe('ce que la fiche dit', () => {
  it('d’un invité : nom, langue de session, pays d’arrivée, poste réduit, entrée, lien, rang', async () => {
    const { body } = await read(GUEST_ID, 'MODERATOR');

    expect(body.data).toEqual({
      participantId: GUEST_ID,
      participantType: 'anonymous',
      displayName: 'nova_anon',
      username: 'nova_anon',
      conversationRole: 'member',
      accountRole: null,
      languages: { conversation: 'pt', system: null, regional: null, customDestination: null, deviceLocale: null },
      country: 'BR',
      client: { browser: 'Mobile Safari', browserVersion: '17', os: 'iOS', osVersion: '17', deviceType: 'mobile', platform: null, appVersion: null },
      joinedAt: '2026-10-11T07:30:00.000Z',
      shareLink: { identifier: 'mshy_world', linkId: 'mshy_abc123', name: 'World Wide' },
      status: 'active',
      accountDetailsWithheld: false,
    });
  });

  it('d’un compte : les rangs du Prisme, le rôle global, le poste de sa dernière session (versions majeures), son pays', async () => {
    const { body } = await read(MEMBER_ID, 'ANALYST');

    expect(body.data).toEqual({
      participantId: MEMBER_ID,
      participantType: 'user',
      displayName: 'Awa',
      username: 'awa',
      conversationRole: 'moderator',
      accountRole: 'USER',
      languages: { conversation: 'fr', system: 'fr', regional: 'wo', customDestination: null, deviceLocale: 'en' },
      country: 'SN',
      client: { browser: 'Chrome', browserVersion: '129', os: 'macOS', osVersion: '14', deviceType: 'desktop', platform: 'web', appVersion: '2.0.14' },
      joinedAt: '2026-10-01T10:00:00.000Z',
      shareLink: null,
      status: 'left',
      accountDetailsWithheld: false,
    });
  });

  it.each([
    ['un invité', GUEST_ID],
    ['un compte', MEMBER_ID],
  ])('%s : ni IP, ni ville, ni User-Agent brut, ni empreinte, ni jeton, ni e-mail, ni téléphone, ni présence', async (_label, id) => {
    const { res } = await read(id, 'BIGBOSS');

    expect(res.statusCode).toBe(200);
    for (const secret of [LEAKY_IP, 'Dakar', RAW_UA, 'fp-secret', 'fp-session-secret', 'hash-secret-token', '@example.com', '+221', 'isOnline', 'lastActiveAt', 'birthday', 'ipAddress']) {
      expect(res.body).not.toContain(secret);
    }
  });

  it('ne se met pas en cache : la réponse est privée et non stockable', async () => {
    const { res } = await read(GUEST_ID, 'ADMIN');

    expect(res.headers['cache-control']).toBe('private, no-store');
  });
});

describe('la trace — aucune fiche ne sort sans elle', () => {
  it('chaque lecture est tracée au journal d’audit, au nom du lecteur, sur le participant lu', async () => {
    const { prisma } = await read(GUEST_ID, 'AUDIT');

    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.adminAuditLog.create.mock.calls[0][0];
    expect(data).toMatchObject({
      adminId: READER_ID,
      userId: GUEST_ID,
      action: 'WORLD_PARTICIPANT_CARD_VIEWED',
      entity: 'Participant',
      entityId: GUEST_ID,
    });
    expect(JSON.parse(data.metadata as string)).toEqual({
      conversationId: WORLD_ID,
      participantType: 'anonymous',
      readerRole: 'AUDIT',
      accountDetailsWithheld: false,
    });
  });

  it('la trace d’un compte lu porte son User.id', async () => {
    const { prisma } = await read(MEMBER_ID, 'ADMIN');

    expect(prisma.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({ userId: MEMBER_USER_ID, entityId: MEMBER_ID });
  });

  it('une trace qui ne s’écrit pas REFUSE la lecture (503) — fail-closed', async () => {
    const { res, body } = await read(GUEST_ID, 'ADMIN', { auditFails: true });

    expect(res.statusCode).toBe(503);
    expect(body.code).toBe(WORLD_PARTICIPANT_CARD_ERRORS.auditUnavailable);
    expect(body.data).toBeUndefined();
    expect(res.body).not.toContain('nova_anon');
  });
});

describe('la hiérarchie — un lecteur ne lit le COMPTE que de qui il SURCLASSE (la règle de requireHierarchy)', () => {
  const WITHHELD = {
    accountRole: null,
    languages: { conversation: 'fr', system: null, regional: null, customDestination: null, deviceLocale: null },
    country: null,
    client: null,
    accountDetailsWithheld: true,
  };

  it.each([
    ['ANALYST', 'BIGBOSS'],
    ['AUDIT', 'BIGBOSS'],
    ['MODERATOR', 'BIGBOSS'],
    ['MODERATOR', 'ADMIN'],
    ['ANALYST', 'AUDIT'],
    ['ADMIN', 'BIGBOSS'],
  ])('%s sur un compte %s : ni rôle global, ni rangs du Prisme, ni poste, ni pays de session — et la session n’est pas lue', async (reader, target) => {
    const { res, body, prisma } = await read(MEMBER_ID, reader, { memberRole: target });

    expect(res.statusCode).toBe(200);
    expect(body.data).toMatchObject({ participantId: MEMBER_ID, displayName: 'Awa', conversationRole: 'moderator', ...WITHHELD });
    expect(prisma.userSession.findFirst).not.toHaveBeenCalled();
    for (const leak of [target, 'Chrome', 'macOS', '2.0.14', '"SN"', '"wo"']) {
      expect(res.body).not.toContain(leak);
    }
  });

  it('à rang ÉGAL, rien du compte non plus — surclasser est strict', async () => {
    const { body, prisma } = await read(MEMBER_ID, 'ADMIN', { memberRole: 'ADMIN' });

    expect(body.data).toMatchObject(WITHHELD);
    expect(prisma.userSession.findFirst).not.toHaveBeenCalled();
  });

  it('un rôle cible INCONNU ne se laisse pas comparer : retenu, même pour BIGBOSS (fail-closed)', async () => {
    const { body, prisma } = await read(MEMBER_ID, 'BIGBOSS', { memberRole: 'SUPERUSER' });

    expect(body.data).toMatchObject(WITHHELD);
    expect(prisma.userSession.findFirst).not.toHaveBeenCalled();
  });

  it('BIGBOSS sur un compte ADMIN : tout le compte, poste et pays de session compris', async () => {
    const { body } = await read(MEMBER_ID, 'BIGBOSS', { memberRole: 'ADMIN' });

    expect(body.data).toMatchObject({
      accountRole: 'ADMIN',
      languages: { conversation: 'fr', system: 'fr', regional: 'wo', customDestination: null, deviceLocale: 'en' },
      country: 'SN',
      client: { browser: 'Chrome', browserVersion: '129', os: 'macOS', osVersion: '14', deviceType: 'desktop', platform: 'web', appVersion: '2.0.14' },
      accountDetailsWithheld: false,
    });
  });

  it('sa PROPRE fiche se lit en entier, quel que soit le rang', async () => {
    const { body } = await read(MEMBER_ID, 'ANALYST', { memberRole: 'ANALYST', readerId: MEMBER_USER_ID });

    expect(body.data).toMatchObject({ accountRole: 'ANALYST', country: 'SN', accountDetailsWithheld: false });
    expect(body.data.client).not.toBeNull();
  });

  it('le pays d’ARRIVÉE par lien reste dit : il vient de l’entrée, pas de la session', async () => {
    const { body } = await read(MEMBER_ID, 'ANALYST', { memberRole: 'BIGBOSS', memberJoinCountry: 'CI' });

    expect(body.data).toMatchObject({ country: 'CI', client: null, accountRole: null, accountDetailsWithheld: true });
  });

  it('la trace dit que le compte a été RETENU', async () => {
    const { prisma } = await read(MEMBER_ID, 'ANALYST', { memberRole: 'BIGBOSS' });

    expect(JSON.parse(prisma.adminAuditLog.create.mock.calls[0][0].data.metadata as string)).toMatchObject({
      readerRole: 'ANALYST',
      accountDetailsWithheld: true,
    });
  });

  it('le contrat partagé décrit la fiche retenue', async () => {
    const { body } = await read(MEMBER_ID, 'ANALYST', { memberRole: 'BIGBOSS' });

    expect(worldParticipantCardSchema.parse(body.data).accountDetailsWithheld).toBe(true);
  });
});

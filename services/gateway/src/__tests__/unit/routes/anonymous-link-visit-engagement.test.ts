/**
 * `GET /anonymous/link/:identifier` — la visite d'un lien d'invitation crédite
 * son auteur (#8959, `social.link_visit`), avec un visiteur établi par le
 * SERVEUR : son compte s'il est connecté, sinon l'empreinte de son adresse et
 * de son navigateur.
 *
 * @jest-environment node
 */

import { createHash } from 'crypto';
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

import { anonymousRoutes } from '../../../routes/anonymous';
import type { LinkVisitRecorder } from '../../../routes/links/utils/link-visitor';
import { executeurImmediat } from '../../helpers/after-response';

const LINK_ID = 'mshy_link_abc123';
const SHARE_LINK_DB_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const CREATOR_ID = '507f1f77bcf86cd799439044';
const VISITOR_ID = '507f1f77bcf86cd799439055';

const shareLinkRow = (link: Record<string, unknown> = {}) => ({
  id: SHARE_LINK_DB_ID, linkId: LINK_ID, name: 'Invitation', description: null,
  isActive: true, expiresAt: null, maxUses: null, currentUses: 0,
  maxConcurrentUsers: null, currentConcurrentUsers: 0,
  requireAccount: false, requireNickname: false, requireEmail: false, requireBirthday: false,
  allowedLanguages: [], allowAnonymousMessages: true, allowAnonymousFiles: false,
  allowAnonymousImages: true, allowViewHistory: true,
  conversation: {
    id: CONV_ID, title: 'Équipe', description: null, type: 'group',
    avatar: null, banner: null, createdAt: new Date('2026-09-01T10:00:00.000Z'),
  },
  creator: { id: CREATOR_ID, username: 'alice', firstName: 'Alice', lastName: 'Martin', displayName: 'Alice', avatar: null },
  ...link,
});

async function fakeOptionalAuth(request: FastifyRequest): Promise<void> {
  const userId = request.headers['x-test-user'];
  (request as unknown as { authContext: unknown }).authContext =
    typeof userId === 'string'
      ? { type: 'user', isAuthenticated: true, isAnonymous: false, userId }
      : { type: 'anonymous', isAuthenticated: false, isAnonymous: true };
}

type RecordLinkVisit = LinkVisitRecorder['recordLinkVisit'];

async function buildApp(row: unknown, recordLinkVisit = jest.fn<RecordLinkVisit>(async () => 2)) {
  const executeur = executeurImmediat();
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    conversationShareLink: { findFirst: jest.fn(async () => row), findUnique: jest.fn(async () => row) },
    participant: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    $runCommandRaw: jest.fn(async () => ({ ok: 1, n: 1, nModified: 1 })),
  } as never);
  await anonymousRoutes(app, {
    afterResponse: executeur.afterResponse,
    optionalAuth: fakeOptionalAuth,
    linkVisits: { recordLinkVisit },
  });
  await app.ready();
  return { app, executeur, recordLinkVisit };
}

describe('aperçu d’un lien d’invitation — crédit de la visite', () => {
  it('crédite l’auteur quand un compte connecté ouvre l’aperçu', async () => {
    const { app, executeur, recordLinkVisit } = await buildApp(shareLinkRow());

    await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}`, headers: { 'x-test-user': VISITOR_ID } });
    await executeur.settle();

    expect(recordLinkVisit).toHaveBeenCalledWith({
      creatorId: CREATOR_ID,
      linkKey: `conversation:${LINK_ID}`,
      visitorKey: `user:${VISITOR_ID}`,
      visitorUserId: VISITOR_ID,
    });
    await app.close();
  });

  it('reconnaît un anonyme par l’empreinte de son adresse et de son navigateur', async () => {
    const { app, executeur, recordLinkVisit } = await buildApp(shareLinkRow());

    await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}`, headers: { 'user-agent': 'UA-test' } });
    await executeur.settle();

    const expected = createHash('sha256').update('127.0.0.1|UA-test').digest('hex');
    expect(recordLinkVisit).toHaveBeenCalledWith(expect.objectContaining({
      visitorKey: `anon:${expected}`,
      visitorUserId: null,
    }));
    await app.close();
  });

  it('ne crédite rien quand l’auteur regarde son propre aperçu', async () => {
    const { app, executeur, recordLinkVisit } = await buildApp(shareLinkRow());

    await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}`, headers: { 'x-test-user': CREATOR_ID } });
    await executeur.settle();

    expect(recordLinkVisit).not.toHaveBeenCalled();
    await app.close();
  });

  it('ne crédite rien pour un lien refusé', async () => {
    const { app, executeur, recordLinkVisit } = await buildApp(shareLinkRow({ isActive: false }));

    await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}` });
    await executeur.settle();

    expect(recordLinkVisit).not.toHaveBeenCalled();
    await app.close();
  });

  it('un crédit en panne ne fait jamais échouer l’aperçu', async () => {
    const enPanne = jest.fn<RecordLinkVisit>(async () => { throw new Error('engagement down'); });
    const { app, executeur } = await buildApp(shareLinkRow(), enPanne);

    const res = await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}` });
    await executeur.settle();

    expect(res.statusCode).toBe(200);
    expect(enPanne).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

/**
 * #19688 — LA COURSE, pas la lecture.
 *
 * `resolveConversationEntry` refuse un banni, et les suites qui l'attestent
 * sont vertes. Elles posent toutes la même question : *la LECTURE voit-elle le
 * bannissement ?* Celle-ci pose l'autre : **un bannissement commis APRÈS la
 * décision et AVANT l'écriture est-il refusé ?**
 *
 * Le pari de `REJOIN_PARTICIPANT_STATE` — « une rentrée ne débannit personne,
 * et les trois portes refusent un banni EN AMONT » — ne tient pas contre cette
 * fenêtre : `resolveBanWrite` n'écrit QUE `bannedAt` quand la cible est déjà
 * inactive, si bien que l'écriture de rentrée rallume ensuite
 * `isActive: true` sur une ligne BANNIE. C'est l'état que #19525, #19604 et
 * #19676 refusent de lire, produit par du code vivant.
 *
 * Le double est ce qui rend ce témoin capable de tomber : `updateIn` ÉVALUE la
 * clause `where` contre la ligne et lève `P2025` quand elle ne s'apparie plus,
 * comme le vrai client. Un `mockResolvedValue` rendrait la ligne quelle que
 * soit la clause — il accepterait l'écriture que la production doit refuser, et
 * aucune des trois portes ne pourrait rougir.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() })) },
}));
jest.mock('../../../../utils/sanitize', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((s: string) => s), sanitizeUsername: jest.fn((s: string) => s) },
}));
jest.mock('../../../../services/relations/pairAccess', () => ({
  pairAccessAmong: jest.fn(async (_p: unknown, params: { otherIds: string[]; feature: string }) =>
    new Map(params.otherIds.map((id) => [id, { allowed: true, effectiveLevel: 'CLOSE', reason: 'level' }]))),
}));
// `decideDirectOpening` n'est pas le sujet : la boîte de demandes décide d'un
// RÉGIME d'arrivée, pas de l'admission. Prolongé plutôt que remplacé —
// `requestRecipientFields`, que la porte appelle juste après, reste le VRAI.
jest.mock('../../../../services/messaging/messageRequests', () => ({
  ...(jest.requireActual('../../../../services/messaging/messageRequests') as object),
  decideDirectOpening: jest.fn(async () => ({ kind: 'direct' as const })),
}));
jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn(async (id: string) => id),
  invalidateParticipantLookup: jest.fn(),
}));

import { findFirstIn, findManyIn, updateIn, type MongoDocument } from '../../../helpers/mongo-where';
import { admitConversationMember } from '../../../../services/conversations/memberAdmission';
import { performLinkJoin } from '../../../../routes/conversations/link-admission';
import { registerSharingRoutes } from '../../../../routes/conversations/sharing';

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR_ID = '507f1f77bcf86cd799439022';
const TARGET_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const LINK_KEY = 'mshy_link_race';
const SHARE_LINK_ID = '507f1f77bcf86cd799439055';

const LIVE_CONVERSATION = { id: CONV_ID, title: 'Groupe', type: 'group', isActive: true, closedAt: null, communityId: null, encryptionMode: null };

/**
 * La ligne de l'ancien membre, telle que la base la porte au moment de la
 * décision : partie, PAS bannie — donc `outcome: 'rejoin'`. `bannedAt` est
 * ABSENT de l'objet, pas nul : c'est l'état d'une colonne que personne n'a
 * jamais écrite, et le double honore la différence.
 */
const departedRow = (): MongoDocument => ({
  id: PARTICIPANT_ID,
  conversationId: CONV_ID,
  userId: TARGET_ID,
  isActive: false,
  leftAt: new Date('2026-11-01T10:00:00Z'),
  joinedAt: new Date('2026-10-01T10:00:00Z'),
  role: 'member',
  displayName: 'Bob',
  avatar: null,
  type: 'user',
});

/**
 * Le bannissement COMMET entre la décision et l'écriture : il pose `bannedAt`
 * sur la ligne, et — la cible étant déjà inactive — ne touche pas à
 * `isActive`. C'est exactement ce que `resolveBanWrite` écrit dans ce cas.
 */
function rowsWhereBanLandsAfterTheDecision() {
  const rows = [departedRow()];
  const { findMany } = findManyIn(rows);
  const decisionRead = jest.fn(async (args: never) => {
    const answer = await findMany(args);
    rows[0].bannedAt = new Date('2026-11-18T12:00:00Z');
    return answer;
  });
  return { rows, decisionRead, ...updateIn(rows), findFirst: findFirstIn(rows) };
}

describe('#19688 — une rentrée ne rallume pas une ligne bannie dans sa fenêtre', () => {
  it("porte « ajouter un membre » : le verdict est `banned`, et `isActive` n'est pas rallumé", async () => {
    const race = rowsWhereBanLandsAfterTheDecision();
    const prisma = {
      user: {
        findFirst: jest.fn(async () => ({ id: TARGET_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B', systemLanguage: 'fr' })),
        findUnique: jest.fn(async () => ({ id: TARGET_ID, username: 'bob', displayName: 'Bob', createdAt: new Date('2025-01-01') })),
      },
      participant: {
        findMany: race.decisionRead,
        findFirst: jest.fn(race.findFirst),
        update: jest.fn(race.update),
        create: jest.fn(async () => { throw new Error('aucune ligne ne doit être CRÉÉE sur un rejoin'); }),
      },
      communityMember: { findFirst: jest.fn(async () => null) },
    } as never;

    const verdict = await admitConversationMember(
      { prisma, io: undefined as never, joinRoom: null, notificationService: null, engagement: { recordActivity: jest.fn(async () => undefined) } as never },
      { conversationId: CONV_ID, conversation: LIVE_CONVERSATION, userId: TARGET_ID, currentUserId: ACTOR_ID, addedBy: { id: ACTOR_ID, displayName: 'Ana' } as never, community: null }
    );

    expect({ outcome: verdict.outcome, isActive: race.rows[0].isActive }).toEqual({ outcome: 'banned', isActive: false });
  });

  it("porte « lien de partage » : le refus est 403 BANNED, et `isActive` n'est pas rallumé", async () => {
    const race = rowsWhereBanLandsAfterTheDecision();
    const shareLink = {
      id: SHARE_LINK_ID, linkId: LINK_KEY, identifier: 'race-link', conversationId: CONV_ID,
      isActive: true, expiresAt: null, maxUses: null, currentUses: 0,
      maxConcurrentUsers: null, currentConcurrentUsers: 0, maxUniqueSessions: null, currentUniqueSessions: 0,
      requireAccount: false, requireNickname: false, requireEmail: false, requireBirthday: false,
      allowedCountries: [], allowedLanguages: [], allowedIpRanges: [],
      allowAnonymousMessages: true, allowAnonymousFiles: false, allowAnonymousImages: false,
      allowViewHistory: false, createdBy: ACTOR_ID, conversation: LIVE_CONVERSATION,
    };
    const prisma = {
      conversationShareLink: {
        findFirst: jest.fn(async () => shareLink),
        findUnique: jest.fn(async () => ({ ...shareLink })),
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      user: { findUnique: jest.fn(async () => ({ displayName: 'Bob', username: 'bob', systemLanguage: 'fr' })) },
      participant: {
        findMany: race.decisionRead,
        findFirst: jest.fn(race.findFirst),
        findUnique: jest.fn(async () => null),
        update: jest.fn(race.update),
        updateMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn(async () => { throw new Error('aucune ligne ne doit être CRÉÉE sur un rejoin'); }),
      },
      message: { create: jest.fn(async () => ({ id: 'msg-1' })) },
      communityMember: { findFirst: jest.fn(async () => null) },
    } as never;

    const outcome = await performLinkJoin({
      prisma, key: LINK_KEY, requestIp: '203.0.113.7',
      authContext: { type: 'user', isAuthenticated: true, isAnonymous: false, userId: TARGET_ID, hasFullAccess: true } as never,
      profile: { firstName: 'Bob', lastName: 'B', language: 'fr' },
    });

    expect({
      kind: outcome.kind,
      status: outcome.kind === 'refused' ? outcome.refusal.status : undefined,
      code: outcome.kind === 'refused' ? outcome.refusal.code : undefined,
      isActive: race.rows[0].isActive,
    }).toEqual({ kind: 'refused', status: 403, code: 'BANNED', isActive: false });
  });

  it("porte « invitation » : la réponse refuse, et `isActive` n'est pas rallumé", async () => {
    const race = rowsWhereBanLandsAfterTheDecision();
    const routes: Array<{ method: string; path: string; handler: (req: unknown, reply: unknown) => Promise<unknown> }> = [];
    const register = (method: string) => jest.fn((path: string, _o: unknown, handler: never) => { routes.push({ method, path, handler: handler as never }); });
    const prisma = {
      conversation: {
        findUnique: jest.fn(async () => ({
          ...LIVE_CONVERSATION,
          participants: [{ id: 'p-actor', userId: ACTOR_ID, role: 'admin', displayName: 'Ana', user: { id: ACTOR_ID, username: 'ana', role: 'USER' } }],
        })),
        update: jest.fn(async () => undefined),
      },
      user: {
        findMany: jest.fn(async () => [{ id: TARGET_ID, birthDate: new Date('1990-01-01') }]),
        findUnique: jest.fn(async () => ({ id: TARGET_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B', deactivatedAt: null, createdAt: new Date('2025-01-01'), systemLanguage: 'fr' })),
      },
      participant: {
        findMany: race.decisionRead,
        findFirst: jest.fn(race.findFirst),
        count: jest.fn(async () => 0),
        update: jest.fn(race.update),
        create: jest.fn(async () => { throw new Error('aucune ligne ne doit être CRÉÉE sur un rejoin'); }),
      },
      message: { create: jest.fn(async ({ data }: { data: object }) => ({ id: 'sys-1', createdAt: new Date(), ...data })) },
      communityMember: { findFirst: jest.fn(async () => null) },
    };
    const fastify = {
      prisma,
      notificationService: { createConversationInviteNotification: jest.fn(async () => undefined), createMemberJoinedNotificationsBatch: jest.fn(async () => 0) },
      socketIOHandler: { getManager: jest.fn(() => ({ joinUserToConversationRoom: jest.fn(async () => undefined), broadcastMessage: jest.fn(async () => undefined) })) },
      get: register('GET'), post: register('POST'), patch: register('PATCH'), delete: register('DELETE'), put: register('PUT'),
    };
    registerSharingRoutes(fastify as never, prisma as never, jest.fn() as never);

    const invite = routes.find((r) => r.method === 'POST' && r.path.includes('invite'));
    const sent: unknown[] = [];
    const reply: Record<string, unknown> = { statusCode: 200 };
    reply.status = jest.fn((code: number) => { reply.statusCode = code; return reply; });
    reply.code = reply.status;
    reply.send = jest.fn((body: unknown) => { sent.push(body); return reply; });

    await invite!.handler(
      { params: { id: CONV_ID }, body: { userId: TARGET_ID }, authContext: { type: 'user', userId: ACTOR_ID, isAuthenticated: true, registeredUser: { id: ACTOR_ID, role: 'USER' } } },
      reply
    );

    expect({ status: reply.statusCode, success: (sent[0] as { success?: boolean } | undefined)?.success, isActive: race.rows[0].isActive })
      .toEqual({ status: 403, success: false, isActive: false });
  });
});

/**
 * Un INSCRIT banni dont la ligne `Participant` est restée active ne lit plus la
 * conversation (#7389).
 *
 * Un bannissement écrit `bannedAt` ET `isActive: false` (`resolveBanWrite`),
 * mais une restauration de compte rallume `isActive` sans regarder `bannedAt`
 * (`routes/me/delete-account.ts`). Les portes d'accès ne lisaient `bannedAt`
 * que pour un INVITÉ (branche `participantId`) : l'inscrit restauré relisait le
 * fil, la recherche, les épinglés — et, par socket, rejoignait la room à la
 * connexion et passait `resolveParticipant`.
 *
 * Jugé sur des DOCUMENTS Mongo (`findFirstIn`) : la colonne `bannedAt` est
 * ABSENTE de tout participant jamais banni, et un filtre `{ bannedAt: null }`
 * fermerait la conversation à toute la population — le témoin « jamais banni »
 * garde ce flanc.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  canAccessConversation,
  callerParticipantWhere,
  resolveCallerParticipant,
} from '../../../routes/conversations/utils/access-control';
import { resolveParticipant } from '../../../socketio/utils/participant-resolver';
import type { SocketUser } from '../../../socketio/utils/socket-helpers';
import { findFirstIn, matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439033';
const BANNED_AT = new Date('2026-09-01T00:00:00Z');

/** La ligne d'un inscrit banni puis restauré : `bannedAt` posé, `isActive` rallumé. */
const restoredAfterBan = (overrides: MongoDocument = {}): MongoDocument => ({
  id: PARTICIPANT_ID,
  conversationId: CONVERSATION_ID,
  userId: USER_ID,
  type: 'user',
  isActive: true,
  bannedAt: BANNED_AT,
  ...overrides,
});

/** La ligne d'un membre jamais banni : la colonne est ABSENTE, pas nulle. */
const neverBanned = (): MongoDocument => {
  const { bannedAt: _absent, ...row } = restoredAfterBan();
  return row;
};

const registered = () => ({ isAuthenticated: true, isAnonymous: false, userId: USER_ID, participantId: undefined });

const prismaOver = (rows: readonly MongoDocument[]) =>
  ({
    participant: { findFirst: findFirstIn(rows) },
    conversation: { findFirst: jest.fn<any>().mockResolvedValue({ id: CONVERSATION_ID }) },
  }) as any;

describe('#7389 — porte REST : un inscrit banni resté actif est refusé', () => {
  const identifiers = [
    ['conversation ordinaire', 'regular-identifier'],
    ['identifiant mshy_', 'mshy_abc123'],
    ['salon global meeshy', 'meeshy'],
  ] as const;

  it.each(identifiers)('refuse le banni restauré — %s', async (_label, identifier) => {
    await expect(
      canAccessConversation(prismaOver([restoredAfterBan()]), registered(), CONVERSATION_ID, identifier),
    ).resolves.toBe(false);
  });

  it.each(identifiers)('admet le membre jamais banni (colonne ABSENTE) — %s', async (_label, identifier) => {
    await expect(
      canAccessConversation(prismaOver([neverBanned()]), registered(), CONVERSATION_ID, identifier),
    ).resolves.toBe(true);
  });

  it.each(identifiers)('admet le membre débanni (bannedAt: null) — %s', async (_label, identifier) => {
    await expect(
      canAccessConversation(prismaOver([restoredAfterBan({ bannedAt: null })]), registered(), CONVERSATION_ID, identifier),
    ).resolves.toBe(true);
  });

  it("resolveCallerParticipant ne rend pas la ligne d'un inscrit banni resté actif", async () => {
    await expect(
      resolveCallerParticipant(prismaOver([restoredAfterBan()]), { userId: USER_ID }, CONVERSATION_ID),
    ).resolves.toBeNull();
    await expect(
      resolveCallerParticipant(prismaOver([neverBanned()]), { userId: USER_ID }, CONVERSATION_ID),
    ).resolves.toEqual(expect.objectContaining({ id: PARTICIPANT_ID }));
  });

  it("callerParticipantWhere n'apparie pas un inscrit banni resté actif", () => {
    const where = { conversationId: CONVERSATION_ID, ...callerParticipantWhere({ userId: USER_ID }) };

    expect(matchesMongoWhere(restoredAfterBan(), where)).toBe(false);
    expect(matchesMongoWhere(neverBanned(), where)).toBe(true);
  });
});

describe('#7389 — porte socket : resolveParticipant refuse un inscrit banni resté actif', () => {
  const connected = (): Map<string, SocketUser> =>
    new Map([
      [
        USER_ID,
        { id: USER_ID, socketId: 'socket-1', isAnonymous: false, userId: USER_ID, language: 'fr', resolvedLanguages: ['fr'] },
      ],
    ]);

  it('refuse le banni restauré', async () => {
    await expect(
      resolveParticipant({
        prisma: prismaOver([restoredAfterBan()]),
        userIdOrToken: USER_ID,
        conversationId: CONVERSATION_ID,
        connectedUsers: connected(),
      }),
    ).resolves.toBeNull();
  });

  it('admet le membre jamais banni', async () => {
    await expect(
      resolveParticipant({
        prisma: prismaOver([neverBanned()]),
        userIdOrToken: USER_ID,
        conversationId: CONVERSATION_ID,
        connectedUsers: connected(),
      }),
    ).resolves.toEqual(expect.objectContaining({ participantId: PARTICIPANT_ID }));
  });
});

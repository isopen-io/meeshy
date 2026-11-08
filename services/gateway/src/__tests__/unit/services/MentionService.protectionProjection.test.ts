/**
 * `GET /mentions/me` sert `Message.content` — il doit donc le bloc de
 * protection, ou dire pourquoi non (#4885 critère 4, énoncé par
 * `messageProtectionProjection.ts` : « Toute route qui sert `Message.content`
 * doit ce bloc »).
 *
 * Son `select` ne lisait AUCUNE des quatre familles de protection. Un message
 * à vue unique ou flouté qui mentionne quelqu'un lui était donc servi EN CLAIR
 * par cette porte, sans un seul drapeau : le client n'a rien pour le voiler ni
 * pour refuser son transfert (sa garde lit `isViewOnce`, absent de la réponse).
 *
 * Ce témoin assert sur la REQUÊTE, jamais sur le rendu : un double Prisma rend
 * ce qu'on lui dit quel que soit le `select`, donc un témoin posé sur la
 * réponse passerait au VERT sur un site dont la requête ne ramène pas les
 * colonnes. Et il lit les clés attendues DEPUIS la constante partagée — une
 * seconde liste écrite ici dériverait d'elle en silence.
 *
 * @jest-environment node
 */

jest.mock('../../../services/CacheStore', () => {
  const cache = {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    del: jest.fn(async () => undefined),
    keys: jest.fn(async () => []),
    isAvailable: jest.fn(() => true),
  };
  return { getCacheStore: jest.fn(() => cache) };
});

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

import { describe, it, expect, jest } from '@jest/globals';
import { MentionService } from '../../../services/MentionService';
import { MESSAGE_PROTECTION_SELECT } from '../../../routes/conversations/messageProtectionProjection';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = '507f1f77bcf86cd799439013';

function build() {
  const findMany = jest.fn<any>().mockResolvedValue([]);
  const prisma = { mention: { findMany } };
  return { findMany, service: new MentionService(prisma as unknown as PrismaClient) };
}

describe('MentionService.getRecentMentionsForUser — le bloc de protection est DEMANDÉ', () => {
  it('lit les quatre familles de protection du message mentionnant', async () => {
    const { findMany, service } = build();

    await service.getRecentMentionsForUser(USER_ID, 50);

    const [args] = findMany.mock.calls[0] as [any];
    const messageSelect = args.include.message.select;

    for (const field of Object.keys(MESSAGE_PROTECTION_SELECT)) {
      expect(messageSelect).toHaveProperty(field, true);
    }
  });
});

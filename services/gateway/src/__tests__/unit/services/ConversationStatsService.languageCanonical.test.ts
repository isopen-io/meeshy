/**
 * LA CANONICALISATION DES CODES LANGUE DE `ConversationStatsService` — sortie
 * de `ConversationStatsService.test.ts` le 2026-09-05 parce que #5262 l'y avait
 * fait passer de 1 408 à 1 511 lignes, au-dessus de la dette héritée que le
 * cliquet #4531 refuse de voir monter.
 *
 * Découpe par RESPONSABILITÉ : ces témoins ne mesurent qu'UNE chose — que les
 * variantes région-taguées et en casse mixte d'un même code se replient sur un
 * seul bucket canonique, et que les comptes qui convergent s'ADDITIONNENT. Le
 * fichier hôte garde le reste du service (singleton, cache, calcul, mises à
 * jour incrémentales, cas limites).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { ConversationStatsService } from '../../../services/ConversationStatsService';

/**
 * Le double Prisma MINIMAL que ces témoins peuplent — la même forme que celle
 * du fichier hôte (`makeBasePrisma`), recopiée ici plutôt qu'exportée : quatre
 * `jest.fn()` sans logique, dont la duplication ne peut pas DIVERGER en
 * silence (un champ manquant fait tomber le témoin qui le peuple).
 */
const testConversationId = '507f1f77bcf86cd799439011';
const testUserId1 = '507f1f77bcf86cd799439022';
const testUserId2 = '507f1f77bcf86cd799439033';

function makeBasePrisma() {
  return {
    conversation: { findFirst: jest.fn(), findUnique: jest.fn() },
    message: { groupBy: jest.fn() },
    user: { findMany: jest.fn() },
    participant: { findMany: jest.fn() },
  };
}

describe('language-code canonicalization', () => {
  const convObj = {
    id: testConversationId,
    identifier: `conv_${testConversationId.slice(-4)}`,
    type: 'private',
  };

  beforeEach(() => {
    const service = ConversationStatsService.getInstance();
    service.getActiveConversationIds().forEach(id => service.invalidate(id));
  });

  it('should merge region-tagged/mixed-case message language variants into one canonical bucket (summing counts)', async () => {
    const service = ConversationStatsService.getInstance();
    const mockPrisma: any = makeBasePrisma();
    mockPrisma.conversation.findFirst.mockResolvedValue(convObj);
    mockPrisma.message.groupBy.mockResolvedValue([
      { originalLanguage: 'en', _count: { _all: 3 } },
      { originalLanguage: 'en-US', _count: { _all: 4 } },
      { originalLanguage: 'EN', _count: { _all: 2 } },
      { originalLanguage: 'fr-FR', _count: { _all: 5 } }
    ]);
    mockPrisma.participant.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const stats = await service.getOrCompute(mockPrisma as any, testConversationId, () => []);

    // 3 + 4 + 2 collapse into a single 'en' bucket; region stripped for 'fr'.
    expect(stats.messagesPerLanguage).toEqual({ en: 9, fr: 5 });
  });

  it('should merge region-tagged/mixed-case participant language variants into one canonical bucket', async () => {
    const service = ConversationStatsService.getInstance();
    const mockPrisma: any = makeBasePrisma();
    mockPrisma.conversation.findFirst.mockResolvedValue(convObj);
    mockPrisma.message.groupBy.mockResolvedValue([]);
    mockPrisma.participant.findMany.mockResolvedValue([
      { user: { id: '507f1f77bcf86cd799439201', systemLanguage: 'en-US' } },
      { user: { id: '507f1f77bcf86cd799439202', systemLanguage: 'EN' } },
      { user: { id: '507f1f77bcf86cd799439203', systemLanguage: 'pt-BR' } }
    ]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const stats = await service.getOrCompute(mockPrisma as any, testConversationId, () => []);

    expect(stats.participantsPerLanguage).toEqual({ en: 2, pt: 1 });
    expect(stats.participantCount).toBe(3);
  });

  it('should canonicalize the incremental message-language bucket (updateOnNewMessage)', async () => {
    const service = ConversationStatsService.getInstance();
    const mockPrisma: any = makeBasePrisma();
    mockPrisma.conversation.findFirst.mockResolvedValue(convObj);
    mockPrisma.message.groupBy.mockResolvedValue([
      { originalLanguage: 'en', _count: { _all: 1 } }
    ]);
    mockPrisma.participant.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    await service.getOrCompute(mockPrisma as any, testConversationId, () => []);

    // A region-tagged incoming message must land on the SAME 'en' bucket,
    // not create a distinct 'en-us' one.
    const stats = await service.updateOnNewMessage(
      mockPrisma as any,
      testConversationId,
      'en-US',
      () => []
    );

    expect(stats.messagesPerLanguage).toEqual({ en: 2 });
  });

  it('should canonicalize global-conversation participant languages (user.findMany branch)', async () => {
    const service = ConversationStatsService.getInstance();
    service.getActiveConversationIds().forEach(id => service.invalidate(id));
    const globalConvId = '507f1f77bcf86cd799439098';
    const mockPrisma: any = makeBasePrisma();
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: globalConvId, identifier: 'meeshy' });
    mockPrisma.message.groupBy.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: '507f1f77bcf86cd799439211', systemLanguage: 'fr' },
      { id: '507f1f77bcf86cd799439212', systemLanguage: 'fr-FR' },
      { id: '507f1f77bcf86cd799439213', systemLanguage: 'FR' }
    ]);
    mockPrisma.participant.findMany.mockResolvedValue([]);

    const stats = await service.getOrCompute(mockPrisma as any, 'meeshy', () => []);

    expect(stats.participantsPerLanguage).toEqual({ fr: 3 });
  });
});

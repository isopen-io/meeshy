/**
 * @jest-environment node
 *
 * #9244 — la galerie listait les métadonnées d'un média dont le message
 * porteur avait EXPIRÉ ou BRÛLÉ.
 *
 * Le prédicat de cycle de vie existait déjà (`carrierMessageStillServesBytes`,
 * cycle 92 / #7578) et le DÉTAIL l'appliquait depuis #4923. La LISTE, elle, ne
 * bornait que `deletedAt` : l'émetteur d'un éphémère ou d'une vue unique avait
 * voulu que son média disparaisse, et la galerie continuait d'annoncer qu'il
 * avait existé — nom d'origine, dimensions, auteur, date, `messageId`.
 *
 * CE TÉMOIN COMPTE LA REQUÊTE, PAS LA RÉPONSE — comme son voisin
 * `conversation-attachments-select.test.ts`. Un double Prisma rend ce qu'on lui
 * dit quel que soit le `where` : une assertion sur les lignes RENDUES serait
 * verte avant comme après la correction. Le seul fait mesurable est l'ARGUMENT
 * passé à `findMany`, puisque c'est lui qui décide de ce que la base renvoie.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  CARRIER_DEADLINE_COLUMNS,
  carrierMessageStillServesWhere,
} from '../../../../services/attachments/carrierMessageLifecycle';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
  performanceLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { AttachmentService } from '../../../../services/attachments';

const CONVERSATION_ID = '507f1f77bcf86cd799439022';

/**
 * L'instant est PASSÉ, jamais capturé : la route `GET /attachments/:id/metadata`
 * fait déjà `carrierMessageStillServesBytes(message, new Date())` à son site
 * d'appel. Un service qui lirait l'horloge lui-même rendrait ce témoin
 * approximatif — et une borne qu'on ne peut pas épingler n'est pas une borne
 * qu'on peut éprouver.
 */
const NOW = new Date('2026-10-03T12:00:00.000Z');

function makeService() {
  const findMany = jest.fn(async () => []) as jest.Mock<any>;
  const prisma = { messageAttachment: { findMany } } as unknown as PrismaClient;
  return { service: new AttachmentService(prisma), findMany };
}

const messageWhereOf = (findMany: jest.Mock<any>) =>
  (findMany.mock.calls[0]?.[0] as { where?: { message?: Record<string, unknown> } })?.where
    ?.message ?? {};

describe('AttachmentService.getConversationAttachments — le cycle de vie du porteur (#9244)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('borne la lecture par CHAQUE échéance du porteur, pas seulement `deletedAt`', async () => {
    const { service, findMany } = makeService();

    await service.getConversationAttachments(CONVERSATION_ID, { limit: 50, now: NOW });

    const message = messageWhereOf(findMany);
    expect(message).toMatchObject({ deletedAt: null });
    for (const column of CARRIER_DEADLINE_COLUMNS) {
      expect(JSON.stringify(message.AND ?? [])).toContain(column);
    }
  });

  /**
   * La loi n'est pas recopiée ici : la requête porte la forme que la SSOT
   * rend. Si les deux écritures divergeaient un jour, ce témoin le dirait
   * avant que la galerie ne recommence à servir un média brûlé.
   */
  it('porte la forme que la SSOT rend, et non une copie locale', async () => {
    const { service, findMany } = makeService();

    await service.getConversationAttachments(CONVERSATION_ID, { limit: 50, now: NOW });

    const message = messageWhereOf(findMany);
    const expected = carrierMessageStillServesWhere(NOW);
    expect(message.AND).toEqual(expected.AND);
  });

  /**
   * L'exclusion entre dans le `where`, PAS dans une boucle après coup — même
   * forme que l'opt-out d'accusés de lecture (#3907). La galerie pagine : un
   * filtrage post-requête ferait rétrécir la page sans corriger ce qui la
   * borne.
   */
  it('laisse la pagination au `where` : le `take`/`skip` demandé est intact', async () => {
    const { service, findMany } = makeService();

    await service.getConversationAttachments(CONVERSATION_ID, { limit: 25, offset: 50, now: NOW });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ take: 25, skip: 50 });
  });

  /** Le filtre de l'appelant survit à l'ajout — la garde borne, elle ne remplace pas. */
  it("conserve le `messageFilter` de l'appelant", async () => {
    const { service, findMany } = makeService();
    const createdAt = { gte: new Date('2026-09-01T00:00:00.000Z') };

    await service.getConversationAttachments(CONVERSATION_ID, {
      limit: 50,
      messageFilter: { createdAt },
      now: NOW,
    });

    expect(messageWhereOf(findMany)).toMatchObject({ createdAt, conversationId: CONVERSATION_ID });
  });

  /**
   * Sans instant fourni, le service prend l'heure courante — la galerie
   * appelée en production n'a pas à connaître cette borne pour en bénéficier.
   * Un défaut qui n'est actif que si l'appelant pense à l'activer est un
   * demi-correctif.
   */
  it("borne aussi quand l'appelant ne fournit pas d'instant", async () => {
    const { service, findMany } = makeService();

    await service.getConversationAttachments(CONVERSATION_ID, { limit: 50 });

    const message = messageWhereOf(findMany);
    expect(message).toMatchObject({ deletedAt: null });
    expect(Array.isArray(message.AND)).toBe(true);
    expect(message.AND as unknown[]).toHaveLength(CARRIER_DEADLINE_COLUMNS.length);
  });
});

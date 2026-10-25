/**
 * @jest-environment node
 *
 * #10789 — la galerie d'une conversation ne liste pas les blobs chiffrés de
 * bout en bout. Le serveur n'en sait que l'octet opaque : un client qui les
 * lirait dans cet index montrerait un « fichier » illisible, et l'ouverture
 * passe par le pointeur du message déchiffré sur l'appareil, jamais par ici.
 *
 * Même méthode que `conversation-attachments-carrier-lifecycle.test.ts` : on
 * mesure l'ARGUMENT passé à `findMany`, puisque c'est lui qui décide.
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
  performanceLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { AttachmentService } from '../../../../services/attachments';

describe('AttachmentService.getConversationAttachments — aucun blob chiffré de bout en bout (#10789)', () => {
  it.each([undefined, 'image'] as const)('écarte les pièces e2ee de la requête (filtre de type : %s)', async (type) => {
    const findMany = jest.fn(async () => []) as jest.Mock<any>;
    const service = new AttachmentService({ messageAttachment: { findMany } } as unknown as PrismaClient);

    await service.getConversationAttachments('507f1f77bcf86cd799439022', { limit: 50, ...(type ? { type } : {}) });

    const where = (findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(where.NOT).toEqual([{ encryptionMode: 'e2ee' }]);
  });
});

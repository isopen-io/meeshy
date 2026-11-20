/** @jest-environment node */
import { describe, it, expect, jest } from '@jest/globals';
import { AttachmentService } from '../../attachments';
import { discardMessageAfterLinkFailure, type AttachmentFailurePrisma } from '../attachmentFailureOutcome';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })), warn: jest.fn() },
  performanceLogger: { withTiming: jest.fn((_n: unknown, f: () => unknown) => f()) },
}));

const MSG = '507f1f77bcf86cd799439033';

describe('AUDIT — straggler de Promise.all vs libération', () => {
  it('une écriture encore en vol RE-LIE une pièce APRÈS la libération, et le message supprimé l’emporte', async () => {
    // Journal de l'état réel des pièces (ce que la base porterait)
    const state: Record<string, string | null> = { a: null, b: null, c: null };
    let deleted = false;

    let releaseC: () => void = () => {};
    const cLanded = new Promise<void>((r) => { releaseC = r; });

    const updateMany = jest.fn(async (args: any) => {
      // libération : where { messageId }
      if (args.where?.messageId !== undefined && args.data?.messageId === null) {
        Object.keys(state).forEach((k) => { if (state[k] === args.where.messageId) state[k] = null; });
        return { count: 1 };
      }
      const id = args.where.id.in[0];
      if (id === 'b') throw new Error('not primary'); // la 2e écriture échoue
      if (id === 'c') { await cLanded; }              // la 3e est encore EN VOL
      state[id] = args.data.messageId;
      return { count: 1 };
    });

    const prisma = {
      messageAttachment: { updateMany, findMany: jest.fn(async () => []) },
      // Cascade ÉMULÉE de Prisma/MongoDB (`onDelete: Cascade` sur MessageAttachment.message)
      message: { delete: jest.fn(async () => {
        Object.keys(state).forEach((k) => { if (state[k] === MSG) delete state[k]; });
        deleted = true; return { id: MSG };
      }) },
    };

    const svc = new AttachmentService(prisma as never);
    const link = svc.associateAttachmentsToMessage(['a', 'b', 'c'], MSG).catch((e) => e);

    await expect(link).resolves.toBeInstanceOf(Error);
    await discardMessageAfterLinkFailure(prisma as unknown as AttachmentFailurePrisma, { messageId: MSG });
    expect(deleted).toBe(true);

    releaseC();                 // la 3e écriture atterrit MAINTENANT
    await new Promise((r) => setImmediate(r));

    // La pièce `c` est RE-LIÉE à un message qui n'existe plus :
    // `unsetOrNull` ne la matchera plus jamais, et `admitMessageAttachments`
    // la refusera en ATTACHMENT_NOT_FOUND au rejeu.
    expect(state.c).toBe(MSG);
    expect(state.a).toBeNull();
  });
});

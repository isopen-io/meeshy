/**
 * #12333 (audit A3) — la description d'une pièce se règle quand elle REJOINT
 * son message : effacée en conversation chiffrée (fail-closed, #9224), et
 * seulement alors confiée au traducteur sinon.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { settleLinkedDescriptions } from '../linkedDescriptions';

function harness(message: Record<string, unknown> | null) {
  const updateMany = jest.fn(async () => ({ count: 1 }));
  const prisma = {
    messageAttachment: { findMany: jest.fn(async () => [{ id: 'a1' }]), updateMany },
    message: { findUnique: jest.fn(async () => message) },
  };
  const trigger = jest.fn();
  return { prisma, updateMany, trigger };
}

describe('settleLinkedDescriptions', () => {
  it('conversation E2EE : la description en clair est EFFACÉE, rien ne part au traducteur', async () => {
    const { prisma, updateMany, trigger } = harness({ isEncrypted: false, encryptionMode: null, conversation: { encryptionMode: 'e2ee' } });
    await settleLinkedDescriptions(prisma as never, ['a1'], 'm1', trigger);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ['a1'] } }, data: { alt: null, altLanguage: null, altTranslations: null } });
    expect(trigger).not.toHaveBeenCalled();
  });

  it('message chiffré : même chose', async () => {
    const { prisma, updateMany, trigger } = harness({ isEncrypted: true, encryptionMode: 'e2ee', conversation: { encryptionMode: null } });
    await settleLinkedDescriptions(prisma as never, ['a1'], 'm1', trigger);
    expect(updateMany).toHaveBeenCalled();
    expect(trigger).not.toHaveBeenCalled();
  });

  it('message introuvable : fail-closed, effacée', async () => {
    const { prisma, updateMany, trigger } = harness(null);
    await settleLinkedDescriptions(prisma as never, ['a1'], 'm1', trigger);
    expect(updateMany).toHaveBeenCalled();
    expect(trigger).not.toHaveBeenCalled();
  });

  it('conversation en clair : la traduction est déclenchée (sa garde relit la protection)', async () => {
    const { prisma, updateMany, trigger } = harness({ isEncrypted: false, encryptionMode: null, conversation: { encryptionMode: null } });
    await settleLinkedDescriptions(prisma as never, ['a1'], 'm1', trigger);
    expect(updateMany).not.toHaveBeenCalled();
    expect(trigger).toHaveBeenCalledWith('a1');
  });
});

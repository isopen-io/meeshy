/**
 * #14107 (audit M4) — `mention:created` ne part pas vers le destinataire d'une
 * demande de message en attente ; une lecture qui échoue n'émet rien.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { withoutPendingMessageRequests } from '../../../services/MentionService';

describe('withoutPendingMessageRequests', () => {
  it('retire le destinataire d\'une demande en attente, garde les autres', async () => {
    const prisma = { participant: { findMany: jest.fn(async () => [{ userId: 'dest' }]) } };
    await expect(withoutPendingMessageRequests(prisma as never, 'conv', ['dest', 'membre'])).resolves.toEqual(['membre']);
  });

  it('une lecture qui échoue n\'émet rien', async () => {
    const prisma = { participant: { findMany: jest.fn(async () => { throw new Error('db down'); }) } };
    await expect(withoutPendingMessageRequests(prisma as never, 'conv', ['dest'])).resolves.toEqual([]);
  });
});

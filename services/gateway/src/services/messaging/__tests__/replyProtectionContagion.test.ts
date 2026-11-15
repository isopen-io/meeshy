/**
 * La passerelle IMPOSE la contagion d'une réponse (#8557) : quoi que déclare
 * le client, citer un message flou ou éphémère rend la réponse floue ou
 * éphémère sur le même mode.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { declaredReplyProtection, type ReplyContagionPrisma } from '../replyProtectionContagion';

const { EPHEMERAL, BLURRED, EPHEMERAL_AFTER_READ } = MESSAGE_EFFECT_FLAGS;
const AFTER_READ = EPHEMERAL | EPHEMERAL_AFTER_READ;

function prismaWith(quoted: { effectFlags?: number; isBlurred?: boolean; ephemeralDuration?: number | null } | null) {
  const calls: unknown[] = [];
  const prisma = {
    message: {
      findFirst: async (args: unknown) => {
        calls.push(args);
        return quoted;
      },
    },
  } as unknown as ReplyContagionPrisma;
  return { prisma, calls };
}

describe('declaredReplyProtection', () => {
  it('sans citation : aucune lecture, la déclaration passe telle quelle', async () => {
    const { prisma, calls } = prismaWith(null);
    const declared = { conversationId: 'c', isBlurred: true, ephemeralDuration: 60 };
    expect(await declaredReplyProtection(prisma, declared)).toEqual(declared);
    expect(calls).toHaveLength(0);
  });

  it('une réponse nue à un message flou + flamme-œil devient floue + flamme-œil', async () => {
    const { prisma, calls } = prismaWith({ effectFlags: AFTER_READ | BLURRED, isBlurred: true, ephemeralDuration: null });
    const out = await declaredReplyProtection(prisma, { conversationId: 'c', replyToId: 'q' });
    expect(out).toMatchObject({ effectFlags: AFTER_READ | BLURRED, isBlurred: true, ephemeralDuration: undefined, expiresAt: undefined });
    expect(calls[0]).toMatchObject({ where: { id: 'q', conversationId: 'c' } });
  });

  it('le mode imposé REMPLACE la durée et l’échéance héritée que le client envoyait', async () => {
    const { prisma } = prismaWith({ effectFlags: EPHEMERAL, isBlurred: false, ephemeralDuration: 30 });
    const out = await declaredReplyProtection(prisma, {
      conversationId: 'c',
      replyToId: 'q',
      ephemeralDuration: 86_400,
      expiresAt: new Date('2026-10-01T00:00:00Z'),
    });
    expect(out).toMatchObject({ effectFlags: EPHEMERAL, ephemeralDuration: 30, expiresAt: undefined });
  });

  it('un message cité introuvable ne contamine rien', async () => {
    const { prisma } = prismaWith(null);
    const declared = { conversationId: 'c', replyToId: 'q', isBlurred: false };
    expect(await declaredReplyProtection(prisma, declared)).toEqual(declared);
  });

  it('une réponse contaminée par le flou garde l’éphémère qu’elle ajoute', async () => {
    const { prisma } = prismaWith({ effectFlags: BLURRED, isBlurred: true, ephemeralDuration: null });
    const out = await declaredReplyProtection(prisma, { conversationId: 'c', replyToId: 'q', ephemeralDuration: 60 });
    expect(out).toMatchObject({ effectFlags: BLURRED | EPHEMERAL, isBlurred: true, ephemeralDuration: 60 });
  });
});

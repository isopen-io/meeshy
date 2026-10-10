/**
 * #9848 — un son RETIRÉ de la bibliothèque par son auteur ne qualifie plus un
 * réel : il ne s'emprunte plus dans un nouveau post, il ne fait donc pas d'une
 * story sans vidéo un réel.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { borrowedSoundReelEntries } from '../storyReelCompanion';

const SOUND = '64d000000000000000000001';
const AUTHOR = '64b000000000000000000001';

function prismaWith(sound: Record<string, unknown>) {
  return {
    sound: {
      findMany: jest.fn(async () => [sound]),
    },
  } as unknown as Parameters<typeof borrowedSoundReelEntries>[0];
}

const storyEffects = {
  audioPlayerObjects: [{ id: 't1', soundId: SOUND, isBackground: true }],
};

describe('borrowedSoundReelEntries — son retiré (#9848)', () => {
  it('test_removedSound_qualifiesNothing', async () => {
    const prisma = prismaWith({ durationMs: 30000, isPublic: true, uploaderId: 'autrui', mutedAt: null,
      deletedAt: new Date() });
    expect(await borrowedSoundReelEntries(prisma, storyEffects, AUTHOR)).toEqual([]);
  });

  it('test_liveSound_stillQualifies', async () => {
    const prisma = prismaWith({ durationMs: 30000, isPublic: true, uploaderId: 'autrui', mutedAt: null,
      deletedAt: null });
    const entries = await borrowedSoundReelEntries(prisma, storyEffects, AUTHOR);
    expect(entries).toHaveLength(1);
  });

  it('test_lookup_readsDeletedAt', async () => {
    const prisma = prismaWith({ durationMs: 30000, isPublic: true, uploaderId: 'autrui', mutedAt: null,
      deletedAt: null });
    await borrowedSoundReelEntries(prisma, storyEffects, AUTHOR);
    const args = (prisma.sound.findMany as unknown as jest.Mock).mock.calls[0][0] as { select: Record<string, boolean> };
    expect(args.select.deletedAt).toBe(true);
  });
});

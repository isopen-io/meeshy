/**
 * Le `post:updated` émis à la fin du pipeline audio porte la MÊME forme que
 * toutes les autres sorties : la clé exposée est `mentions`, jamais le nom de la
 * relation Prisma.
 *
 * Ce broadcast recharge le post avec `postInclude` — donc avec la relation — et
 * un client qui le reçoit remplace son exemplaire en cache par ce qu'il décode.
 * Servi sous `postMentions`, il efface les références du post au premier
 * enregistrement vocal traduit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstanceSync: jest.fn<any>().mockReturnValue(null) },
}));

import { PostAudioService } from '../../../../services/posts/PostAudioService';

const MENTION_ROW = {
  display: 'PINNED' as const,
  mentionedUser: { id: 'u-alice', username: 'alice', displayName: 'Alice B.', avatar: null },
};

describe('PostAudioService — le broadcast de fin de pipeline', () => {
  it('aplatit la relation en clé exposée', async () => {
    const prisma = {
      postMedia: {
        update: jest.fn<any>().mockResolvedValue({ commentId: null }),
      },
      post: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: 'p-1', authorId: 'u-author', type: 'POST', postMentions: [MENTION_ROW],
        }),
      },
    } as any;
    const broadcastPostUpdated = jest.fn<any>().mockResolvedValue(undefined);
    const socialEvents = { broadcastPostUpdated } as any;

    await PostAudioService.init(prisma, socialEvents).handleAudioTranslationsReady({
      postId: 'p-1',
      postMediaId: 'pm-1',
      translations: {},
    });

    const payload = broadcastPostUpdated.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('postMentions');
    expect(payload.mentions).toEqual([
      { userId: 'u-alice', username: 'alice', displayName: 'Alice B.', avatar: null, display: 'PINNED' },
    ]);
  });
});

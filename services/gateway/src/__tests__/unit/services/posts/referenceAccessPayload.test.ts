/**
 * Le verdict d'accès voyage AVEC le contenu — le client ne le déduit pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { attachReferenceAccess } from '../../../../services/posts/referenceAccess';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const HOUR = 3600_000;

describe('attachReferenceAccess', () => {
  it('pose "none" quand le lecteur n\'est pas référencé', async () => {
    const prisma = { postMention: { findUnique: jest.fn<any>().mockResolvedValue(null) } } as any;
    const post = { id: 'p1', type: 'STORY', expiresAt: new Date(NOW.getTime() - HOUR) };

    const result = await attachReferenceAccess({ prisma, post, viewerId: 'u-bob', now: NOW });

    expect(result).toEqual({ ...post, referenceAccess: 'none' });
  });

  it('pose "granted" sur un contenu expiré dont le droit est intact', async () => {
    const prisma = {
      postMention: { findUnique: jest.fn<any>().mockResolvedValue({ expiredViewAt: null }) },
    } as any;
    const post = { id: 'p1', type: 'STORY', expiresAt: new Date(NOW.getTime() - HOUR) };

    const result = await attachReferenceAccess({ prisma, post, viewerId: 'u-bob', now: NOW });

    expect(result.referenceAccess).toBe('granted');
  });

  it('préserve tous les autres champs du post', async () => {
    const prisma = { postMention: { findUnique: jest.fn<any>().mockResolvedValue(null) } } as any;
    const post = { id: 'p1', type: 'STORY', expiresAt: null, content: 'coucou', authorId: 'u-a' };

    const result = await attachReferenceAccess({ prisma, post, viewerId: 'u-bob', now: NOW });

    expect(result.content).toBe('coucou');
    expect(result.authorId).toBe('u-a');
  });
});

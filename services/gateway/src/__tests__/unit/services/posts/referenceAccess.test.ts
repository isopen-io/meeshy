/**
 * `resolveReferenceAccess` — le droit qu'une référence ouvre.
 *
 * Contenu vivant : illimité. Contenu expiré : une fenêtre de 24 h, ouverte par
 * la première vue et jamais rafraîchie. Passé la fenêtre, plus rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { resolveReferenceAccess } from '../../../../services/posts/referenceAccess';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const HOUR = 3600_000;

function makePrisma(row: unknown) {
  return {
    postMention: { findUnique: jest.fn<any>().mockResolvedValue(row) },
  } as any;
}

const LIVE = { id: 'p1', type: 'STORY', expiresAt: new Date(NOW.getTime() + HOUR) };
const EXPIRED = { id: 'p1', type: 'STORY', expiresAt: new Date(NOW.getTime() - HOUR) };

describe('resolveReferenceAccess', () => {
  it('rend "none" pour un lecteur anonyme', async () => {
    const prisma = makePrisma(null);
    expect(await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: undefined, now: NOW }))
      .toBe('none');
    expect(prisma.postMention.findUnique).not.toHaveBeenCalled();
  });

  it('rend "none" quand le lecteur n\'est pas référencé', async () => {
    const prisma = makePrisma(null);
    expect(await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW }))
      .toBe('none');
  });

  it('rend "granted" sur un contenu VIVANT, droit intact', async () => {
    const prisma = makePrisma({ expiredViewAt: null });
    expect(await resolveReferenceAccess({ prisma, post: LIVE, viewerId: 'u-bob', now: NOW }))
      .toBe('granted');
  });

  it('rend "granted" sur un contenu vivant MÊME si une fenêtre passée est close', async () => {
    const prisma = makePrisma({ expiredViewAt: new Date(NOW.getTime() - 48 * HOUR) });
    expect(await resolveReferenceAccess({ prisma, post: LIVE, viewerId: 'u-bob', now: NOW }))
      .toBe('granted');
  });

  it('rend "granted" sur un contenu expiré dont le droit n\'a jamais servi', async () => {
    const prisma = makePrisma({ expiredViewAt: null });
    expect(await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW }))
      .toBe('granted');
  });

  it('rend "granted" pendant les 24 h qui suivent la première vue', async () => {
    const prisma = makePrisma({ expiredViewAt: new Date(NOW.getTime() - 23 * HOUR) });
    expect(await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW }))
      .toBe('granted');
  });

  it('rend "consumed" une fois la fenêtre de 24 h écoulée', async () => {
    const prisma = makePrisma({ expiredViewAt: new Date(NOW.getTime() - 25 * HOUR) });
    expect(await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW }))
      .toBe('consumed');
  });

  it('rend "granted" pour un contenu sans échéance', async () => {
    const prisma = makePrisma({ expiredViewAt: null });
    const permanent = { id: 'p1', type: 'POST', expiresAt: null };
    expect(await resolveReferenceAccess({ prisma, post: permanent, viewerId: 'u-bob', now: NOW }))
      .toBe('granted');
  });

  it('rend "none" plutôt que de lever quand la lecture échoue', async () => {
    const prisma = {
      postMention: { findUnique: jest.fn<any>().mockRejectedValue(new Error('mongo down')) },
    } as any;
    expect(await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW }))
      .toBe('none');
  });
});

/**
 * `consumeReferenceView` — l'acte explicite qui ouvre la fenêtre de 24 h.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  consumeReferenceView,
  resolveReferenceAccess,
} from '../../../../services/posts/referenceAccess';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const HOUR = 3600_000;

function makePrisma() {
  return {
    postMention: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
  } as any;
}

const EXPIRED = { id: 'p1', type: 'STORY', expiresAt: new Date(NOW.getTime() - HOUR) };
const LIVE = { id: 'p1', type: 'STORY', expiresAt: new Date(NOW.getTime() + HOUR) };
const PERMANENT = { id: 'p1', type: 'POST', expiresAt: null };

describe('consumeReferenceView', () => {
  it('n\'écrit RIEN sur un contenu vivant', async () => {
    const prisma = makePrisma();
    await consumeReferenceView({ prisma, post: LIVE, viewerId: 'u-bob', now: NOW });
    expect(prisma.postMention.updateMany).not.toHaveBeenCalled();
  });

  it('n\'écrit RIEN sur un contenu sans échéance', async () => {
    const prisma = makePrisma();
    await consumeReferenceView({ prisma, post: PERMANENT, viewerId: 'u-bob', now: NOW });
    expect(prisma.postMention.updateMany).not.toHaveBeenCalled();
  });

  it('ouvre la fenêtre sur un contenu expiré, et SEULEMENT si elle ne l\'est pas déjà', async () => {
    const prisma = makePrisma();
    await consumeReferenceView({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW });

    // `updateMany` + filtre sur l'absence : c'est ce qui rend l'appel
    // idempotent. Un `update` nu réécrirait l'horodatage à chaque vue, et la
    // fenêtre glisserait indéfiniment — le droit ne s'éteindrait jamais.
    expect(prisma.postMention.updateMany).toHaveBeenCalledWith({
      where: {
        postId: 'p1',
        mentionedUserId: 'u-bob',
        OR: [{ expiredViewAt: { isSet: false } }, { expiredViewAt: null }],
      },
      data: { expiredViewAt: NOW },
    });
  });

  it('ne lève jamais — une vue perdue ne doit pas casser un affichage réussi', async () => {
    const prisma = {
      postMention: { updateMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')) },
    } as any;
    await expect(
      consumeReferenceView({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW })
    ).resolves.toBeUndefined();
  });
});

describe('lire ne consomme jamais un droit', () => {
  it('trois lectures d\'un contenu expiré n\'écrivent aucun expiredViewAt', async () => {
    const updateMany = jest.fn<any>().mockResolvedValue({ count: 0 });
    const findUnique = jest.fn<any>().mockResolvedValue({ expiredViewAt: null });
    const prisma = { postMention: { updateMany, findUnique } } as any;

    // `resolveReferenceAccess` est le SEUL chemin qu'une lecture emprunte :
    // GET /posts/:id, l'ouverture de story et l'ouverture de statut passent
    // tous par lui. S'il n'écrit pas, aucune lecture n'écrit.
    await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW });
    await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW });
    await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW });

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejouer la vue ne fait PAS glisser la fenêtre', async () => {
    const updateMany = jest.fn<any>().mockResolvedValue({ count: 0 });
    const prisma = { postMention: { updateMany } } as any;
    const later = new Date(NOW.getTime() + 3 * HOUR);

    await consumeReferenceView({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW });
    await consumeReferenceView({ prisma, post: EXPIRED, viewerId: 'u-bob', now: later });

    // Les deux appels partent, mais le filtre sur l'absence fait que le second
    // ne matche plus rien en base : c'est lui, et non un compte d'appels, qui
    // garantit l'idempotence.
    for (const call of updateMany.mock.calls) {
      expect((call[0] as any).where.OR).toEqual([
        { expiredViewAt: { isSet: false } },
        { expiredViewAt: null },
      ]);
    }
  });
});

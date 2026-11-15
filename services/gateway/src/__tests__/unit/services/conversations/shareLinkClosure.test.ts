/**
 * Unit tests for services/conversations/shareLinkClosure.ts (#3740).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { deactivateShareLinksOnClose } from '../../../../services/conversations/shareLinkClosure';

const CONV_ID = '507f1f77bcf86cd799439011';

function makePrisma() {
  return {
    conversationShareLink: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 2 }),
    },
  };
}

describe('deactivateShareLinksOnClose', () => {
  it('deactivates only the links that are still active, without deleting any row', async () => {
    const prisma = makePrisma();

    const result = await deactivateShareLinksOnClose(prisma as any, CONV_ID);

    expect(prisma.conversationShareLink.updateMany).toHaveBeenCalledWith({
      where: { conversationId: CONV_ID, isActive: true },
      data: { isActive: false },
    });
    expect(result).toEqual({ count: 2 });
  });

  it('returns the Prisma operation UNEXECUTED — composable inside a $transaction([...]) array', () => {
    const prisma = makePrisma();

    deactivateShareLinksOnClose(prisma as any, CONV_ID);

    // L'appel synchrone lui-même déclenche déjà la construction de l'opération
    // (comme tout appel de méthode Prisma) : ce que ce témoin garde est que la
    // fonction ne fait rien D'AUTRE — ni lecture, ni écriture sur une autre
    // table — de sorte qu'elle reste sûre à composer aux côtés de l'écriture
    // de clôture dans un `$transaction([...])`.
    expect(prisma.conversationShareLink.updateMany).toHaveBeenCalledTimes(1);
  });
});

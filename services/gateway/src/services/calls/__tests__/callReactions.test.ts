import { describe, it, expect, jest } from '@jest/globals';
import { recordCallReaction } from '../callReactions';

const CALL = '64b7f0c2a1b2c3d4e5f60718';

const runner = () => {
  const commands: Array<Record<string, unknown>> = [];
  return {
    commands,
    $runCommandRaw: jest.fn(async (command: Record<string, unknown>) => {
      commands.push(command);
      return { ok: 1 };
    }),
  };
};

describe('recordCallReaction — un compte par emoji, en une écriture atomique (#8439)', () => {
  it('incrémente la clé de l’emoji sur la session, en traitant l’absence comme zéro', async () => {
    const prisma = runner();

    await recordCallReaction(prisma, CALL, '🔥');

    expect(prisma.commands).toEqual([
      {
        update: 'CallSession',
        updates: [
          {
            q: { _id: { $oid: CALL } },
            u: [
              {
                $set: {
                  reactionCounts: {
                    $mergeObjects: [
                      { $ifNull: ['$reactionCounts', {}] },
                      { '🔥': { $add: [{ $ifNull: ['$reactionCounts.🔥', 0] }, 1] } },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    ]);
  });
});

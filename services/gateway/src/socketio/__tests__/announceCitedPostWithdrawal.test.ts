/**
 * Le retrait d'un post CITÉ s'annonce aux conversations qui le citent (#7969).
 *
 * La lecture REST sert déjà `postReplyTo.deletedAt` (#7950) ; ce qui manquait
 * est la conversation OUVERTE, qui ne relit rien : la carte restait pleine et
 * tapable jusqu'au prochain rechargement.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { announceCitedPostWithdrawal } from '../announceCitedPostWithdrawal';

const POST_ID = '64b7f1f77bcf86cd79943001';
const CITING_A = '64b7f1f77bcf86cd79943aaa';
const CITING_B = '64b7f1f77bcf86cd79943bbb';
const DELETED_AT = new Date('2026-09-25T10:00:00Z');

type Emission = { room: string; event: string; payload: unknown };

function makeIo() {
  const emissions: Emission[] = [];
  const io = {
    to: jest.fn((room: string | string[]) => ({
      emit: (event: string, payload: unknown) => {
        emissions.push({ room: String(room), event, payload });
        return true;
      },
    })),
  };
  return { io, emissions };
}

type MessageRow = { conversationId: string; storyReplyToId: string | null };

function makePrisma(rows: ReadonlyArray<MessageRow>) {
  const findMany = jest.fn(async (args: { where: { storyReplyToId: string }; select?: object; distinct?: string[] }) =>
    rows.filter((row) => row.storyReplyToId === args.where.storyReplyToId).map((row) => ({ conversationId: row.conversationId })),
  );
  return { prisma: { message: { findMany } }, findMany };
}

const post = (overrides: Partial<{ deletedAt: Date | null; expiresAt: Date | null }> = {}) => ({
  id: POST_ID,
  deletedAt: DELETED_AT,
  expiresAt: null,
  ...overrides,
});

describe('announceCitedPostWithdrawal', () => {
  it('émet vers la room de CHAQUE conversation qui cite le post, une fois par conversation', async () => {
    const { io, emissions } = makeIo();
    const { prisma } = makePrisma([
      { conversationId: CITING_A, storyReplyToId: POST_ID },
      { conversationId: CITING_A, storyReplyToId: POST_ID },
      { conversationId: CITING_B, storyReplyToId: POST_ID },
    ]);

    await announceCitedPostWithdrawal({ prisma: prisma as never, io, post: post() });

    expect(emissions).toEqual([
      {
        room: ROOMS.conversation(CITING_A),
        event: SERVER_EVENTS.MESSAGE_CITED_POST_WITHDRAWN,
        payload: { conversationId: CITING_A, postId: POST_ID, deletedAt: DELETED_AT.toISOString() },
      },
      {
        room: ROOMS.conversation(CITING_B),
        event: SERVER_EVENTS.MESSAGE_CITED_POST_WITHDRAWN,
        payload: { conversationId: CITING_B, postId: POST_ID, deletedAt: DELETED_AT.toISOString() },
      },
    ]);
  });

  it("une conversation qui ne cite PAS le post ne reçoit rien", async () => {
    const { io, emissions } = makeIo();
    const { prisma } = makePrisma([
      { conversationId: CITING_A, storyReplyToId: POST_ID },
      { conversationId: CITING_B, storyReplyToId: '64b7f1f77bcf86cd79943999' },
    ]);

    await announceCitedPostWithdrawal({ prisma: prisma as never, io, post: post() });

    expect(emissions.map((e) => e.room)).toEqual([ROOMS.conversation(CITING_A)]);
  });

  it('retrouve les conversations en UNE requête sur storyReplyToId, conversationId seul, dédoublonnée', async () => {
    const { io } = makeIo();
    const { prisma, findMany } = makePrisma([]);

    await announceCitedPostWithdrawal({ prisma: prisma as never, io, post: post() });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { storyReplyToId: POST_ID },
      select: { conversationId: true },
      distinct: ['conversationId'],
    });
  });

  it("la charge ne porte RIEN du contenu retiré : conversation, post, date — et c'est tout", async () => {
    const { io, emissions } = makeIo();
    const { prisma } = makePrisma([{ conversationId: CITING_A, storyReplyToId: POST_ID }]);

    const removed = { ...post(), content: 'secret', authorId: 'author', type: 'STORY' };
    await announceCitedPostWithdrawal({ prisma: prisma as never, io, post: removed });

    expect(Object.keys(emissions[0]?.payload as object).sort()).toEqual(['conversationId', 'deletedAt', 'postId']);
  });

  it("une story EXPIRÉE puis masquée n'est pas un retrait : rien ne part", async () => {
    const { io, emissions } = makeIo();
    const { prisma, findMany } = makePrisma([{ conversationId: CITING_A, storyReplyToId: POST_ID }]);

    await announceCitedPostWithdrawal({
      prisma: prisma as never,
      io,
      post: post({ expiresAt: new Date('2026-09-25T09:00:00Z') }),
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(emissions).toEqual([]);
  });

  it('sans socket, ne lit même pas la base', async () => {
    const { prisma, findMany } = makePrisma([{ conversationId: CITING_A, storyReplyToId: POST_ID }]);

    await announceCitedPostWithdrawal({ prisma: prisma as never, io: null, post: post() });

    expect(findMany).not.toHaveBeenCalled();
  });
});

/**
 * Le retrait d'un post CITÉ s'annonce aux conversations qui le citent (#7969).
 *
 * La lecture REST sert déjà `postReplyTo.deletedAt` (#7950) ; ce qui manquait
 * est la conversation OUVERTE, qui ne relit rien : la carte restait pleine et
 * tapable jusqu'au prochain rechargement.
 *
 * #20019 — et la conversation ouverte n'était pas la seule à ne rien relire :
 * l'annonce ne partait qu'à `conversation:<id>`, donc PAS au lecteur revenu à
 * la LISTE, qui a quitté cette room et garde la sienne. L'audience vivante est
 * désormais nommée, conversation par conversation.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { announceCitedPostWithdrawal } from '../announceCitedPostWithdrawal';
import { liveParticipantTable } from '../../__tests__/helpers/live-audience-double';
import type { MongoDocument } from '../../__tests__/helpers/mongo-where';

const POST_ID = '64b7f1f77bcf86cd79943001';
const CITING_A = '64b7f1f77bcf86cd79943aaa';
const CITING_B = '64b7f1f77bcf86cd79943bbb';
const DELETED_AT = new Date('2026-09-25T10:00:00Z');

type Emission = { room: string | string[]; event: string; payload: unknown };

function makeIo() {
  const emissions: Emission[] = [];
  const io = {
    // Les rooms sont gardées TELLES QUELLES : `String(room)` sur un tableau rend
    // « a,b » et range l'émission sous une clé qu'aucune assertion ne peut
    // nommer — un double mentit aussi par ce qu'il ACCEPTE (cycle 188).
    to: jest.fn((room: string | string[]) => ({
      emit: (event: string, payload: unknown) => {
        emissions.push({ room, event, payload });
        return true;
      },
    })),
  };
  return { io, emissions };
}

type MessageRow = { conversationId: string; storyReplyToId: string | null };

function makePrisma(rows: ReadonlyArray<MessageRow>, participants: ReadonlyArray<MongoDocument> = []) {
  const findMany = jest.fn(async (args: { where: { storyReplyToId: string }; select?: object; distinct?: string[] }) =>
    rows.filter((row) => row.storyReplyToId === args.where.storyReplyToId).map((row) => ({ conversationId: row.conversationId })),
  );
  const participant = liveParticipantTable(participants);
  return { prisma: { message: { findMany }, participant }, findMany, participant };
}

const living = (conversationId: string, suffix: string): MongoDocument => ({
  id: `p-${suffix}`,
  userId: `u-${suffix}`,
  conversationId,
  isActive: true,
});

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
    // Sans participant à nommer, la room de conversation SEULE, sous sa forme
    // de chaîne : le comportement d'avant #20019.
    expect(emissions.every((emission) => typeof emission.room === 'string')).toBe(true);
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

  it("#20019 — l'audience VIVANTE de chaque conversation, pas seulement son fil", async () => {
    const { io, emissions } = makeIo();
    const { prisma, participant } = makePrisma(
      [
        { conversationId: CITING_A, storyReplyToId: POST_ID },
        { conversationId: CITING_B, storyReplyToId: POST_ID },
      ],
      [
        living(CITING_A, 'a1'),
        living(CITING_A, 'a2'),
        { ...living(CITING_A, 'a-gone'), isActive: false },
        { ...living(CITING_A, 'a-banni'), bannedAt: new Date('2026-11-01T00:00:00.000Z') },
        living(CITING_B, 'b1'),
      ],
    );

    await announceCitedPostWithdrawal({ prisma: prisma as never, io, post: post() });

    expect(emissions.map((emission) => emission.room)).toEqual([
      [ROOMS.conversation(CITING_A), 'user:u-a1', 'user:u-a2'],
      [ROOMS.conversation(CITING_B), 'user:u-b1'],
    ]);
    // Une lecture d'audience PAR conversation citante : c'est le coût de
    // l'élargissement, et il est proportionnel au nombre de conversations qui
    // citent le post, pas au nombre de leurs participants.
    expect(participant.reads()).toBe(2);
  });

  it("#20019 — une lecture d'audience qui LÈVE ne prive que SA conversation", async () => {
    const { io, emissions } = makeIo();
    const findMany = jest.fn(async () => [{ conversationId: CITING_A }, { conversationId: CITING_B }]);
    let read = 0;
    const participant = {
      findMany: jest.fn(async () => {
        read += 1;
        if (read === 1) throw new Error('participant.findMany down');
        return [{ id: 'p-b1', userId: 'u-b1' }];
      }),
    };

    await announceCitedPostWithdrawal({
      prisma: { message: { findMany }, participant } as never,
      io,
      post: post(),
    });

    expect(emissions.map((emission) => emission.room)).toEqual([
      ROOMS.conversation(CITING_A),
      [ROOMS.conversation(CITING_B), 'user:u-b1'],
    ]);
  });

  it('sans socket, ne lit même pas la base', async () => {
    const { prisma, findMany } = makePrisma([{ conversationId: CITING_A, storyReplyToId: POST_ID }]);

    await announceCitedPostWithdrawal({ prisma: prisma as never, io: null, post: post() });

    expect(findMany).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { setAttachmentReactionEmitter, type AttachmentReactionRequest } from '@/lib/api/attachment-reaction-emit';
import { mediaHubQueryKey } from '@/lib/api/conversation-media-hub';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Attachment, Message } from '@/lib/api/types';

import { attachmentReactionPlan, performAttachmentReaction, withAttachmentReaction } from './attachment-reaction';

/**
 * #6303 — RÉAGIR DEPUIS LA VISIONNEUSE VISE LA PIÈCE, PAS LE MESSAGE. Le geste
 * part par `attachment:reaction-add|remove` avec l'identifiant de la PIÈCE ; la
 * pastille de la tuile bouge AVANT l'accusé et revient si la passerelle refuse.
 */
const MESSAGE_ID = '65f0a1b2c3d4e5f6a7b8c9d0';
const PIECE_ID = '65f0a1b2c3d4e5f6a7b8c9d1';
const OTHER_ID = '65f0a1b2c3d4e5f6a7b8c9d2';

const piece = (id: string, partial: Partial<Attachment> = {}): Attachment =>
  ({
    ...attachmentDefaults,
    id,
    messageId: MESSAGE_ID,
    fileName: 'p.jpg',
    originalName: 'p.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024,
    fileUrl: '/f/p.jpg',
    uploadedBy: 'u',
    createdAt: '2026-09-26T09:00:00.000Z',
    ...partial,
  }) as Attachment;

const threadWith = (attachments: readonly Attachment[]): QueryClient => {
  const queryClient = new QueryClient();
  const message = { id: MESSAGE_ID, conversationId: 'c-a', attachments, reactionSummary: {} } as unknown as Message;
  queryClient.setQueryData(messagesQueryKey('c-a'), {
    pages: [{ messages: [message], hasOlder: false, nextCursor: null }],
    pageParams: [undefined],
  });
  return queryClient;
};

const cachedPiece = (queryClient: QueryClient, id: string): Attachment | undefined =>
  queryClient
    .getQueryData<{ pages: { messages: Message[] }[] }>(messagesQueryKey('c-a'))
    ?.pages[0]?.messages[0]?.attachments?.find((attachment) => attachment.id === id);

afterEach(() => setAttachmentReactionEmitter(null));

describe('attachmentReactionPlan', () => {
  test('ajoute, retire la mienne, refuse au-delà du plafond', () => {
    expect(attachmentReactionPlan([], '❤️')).toBe('add');
    expect(attachmentReactionPlan(['❤️'], '❤️')).toBe('remove');
    expect(attachmentReactionPlan(['😂', '❤️', '👍', '😮', '😢'], '🔥')).toBe('refused');
  });
});

describe('withAttachmentReaction', () => {
  test('+1 crée la clé et marque la mienne ; −1 la retire à zéro', () => {
    const added = withAttachmentReaction(piece(PIECE_ID), '❤️', 1);
    expect(added.reactionSummary).toEqual({ '❤️': 1 });
    expect(added.currentUserReactions).toEqual(['❤️']);
    const removed = withAttachmentReaction(added, '❤️', -1);
    expect(removed.reactionSummary).toEqual({});
    expect(removed.currentUserReactions).toEqual([]);
  });
});

describe('performAttachmentReaction', () => {
  test('émet la réaction de la PIÈCE et pose la pastille avant l’accusé', async () => {
    const queryClient = threadWith([piece(PIECE_ID), piece(OTHER_ID)]);
    const sent: AttachmentReactionRequest[] = [];
    setAttachmentReactionEmitter((request) => {
      sent.push(request);
      expect(cachedPiece(queryClient, PIECE_ID)?.reactionSummary).toEqual({ '🔥': 1 });
      return Promise.resolve('ok');
    });

    const outcome = await performAttachmentReaction({
      queryClient,
      conversationId: 'c-a',
      messageId: MESSAGE_ID,
      attachmentId: PIECE_ID,
      emoji: '🔥',
      mine: [],
    });

    expect(outcome).toBe('ok');
    expect(sent).toEqual([{ action: 'add', attachmentId: PIECE_ID, messageId: MESSAGE_ID, emoji: '🔥' }]);
    expect(cachedPiece(queryClient, PIECE_ID)?.currentUserReactions).toEqual(['🔥']);
    expect(cachedPiece(queryClient, OTHER_ID)?.reactionSummary).toBeUndefined();
  });

  test('un refus rend la pastille telle qu’elle était', async () => {
    const queryClient = threadWith([piece(PIECE_ID, { reactionSummary: { '🔥': 2 }, currentUserReactions: ['🔥'] })]);
    setAttachmentReactionEmitter(() => Promise.resolve('refused'));

    const outcome = await performAttachmentReaction({
      queryClient,
      conversationId: 'c-a',
      messageId: MESSAGE_ID,
      attachmentId: PIECE_ID,
      emoji: '🔥',
      mine: ['🔥'],
    });

    expect(outcome).toBe('refused');
    expect(cachedPiece(queryClient, PIECE_ID)?.reactionSummary).toEqual({ '🔥': 2 });
    expect(cachedPiece(queryClient, PIECE_ID)?.currentUserReactions).toEqual(['🔥']);
  });

  test('sans connexion, rien ne reste posé', async () => {
    const queryClient = threadWith([piece(PIECE_ID)]);
    const outcome = await performAttachmentReaction({
      queryClient,
      conversationId: 'c-a',
      messageId: MESSAGE_ID,
      attachmentId: PIECE_ID,
      emoji: '👍',
      mine: [],
    });
    expect(outcome).toBe('offline');
    expect(cachedPiece(queryClient, PIECE_ID)?.reactionSummary).toEqual({});
  });

  test('le plafond refuse sans rien émettre', async () => {
    const queryClient = threadWith([piece(PIECE_ID)]);
    const sent: AttachmentReactionRequest[] = [];
    setAttachmentReactionEmitter((request) => {
      sent.push(request);
      return Promise.resolve('ok');
    });
    const outcome = await performAttachmentReaction({
      queryClient,
      conversationId: 'c-a',
      messageId: MESSAGE_ID,
      attachmentId: PIECE_ID,
      emoji: '🔥',
      mine: ['😂', '❤️', '👍', '😮', '😢'],
    });
    expect(outcome).toBe('limit');
    expect(sent).toEqual([]);
  });
});

/**
 * #8180 — OUVERTE DEPUIS L'ÉCRAN DES MÉDIAS, la visionneuse lit ses pièces
 * dans l'INDEX (`mediaHubQueryKey`), pas dans le fil : la réaction y est posée
 * aussi, sur chaque segment et chaque recherche de la conversation — sinon la
 * visionneuse rouverte relirait « la mienne » d'avant le geste, et un second
 * appui ajouterait au lieu de retirer.
 */
describe('performAttachmentReaction — l’index de l’écran des médias (#8180)', () => {
  const hubMessage = (conversationId: string, attachments: readonly Attachment[]) =>
    ({ id: MESSAGE_ID, conversationId, attachments }) as unknown as Message;
  const seedHub = (queryClient: QueryClient, conversationId: string, term: string | null, attachments: readonly Attachment[]) =>
    queryClient.setQueryData(mediaHubQueryKey(conversationId, 'visual', term), {
      pages: [{ messages: [hubMessage(conversationId, attachments)], hasOlder: false, nextCursor: null }],
      pageParams: [undefined],
    });
  const hubPiece = (queryClient: QueryClient, conversationId: string, term: string | null): Attachment | undefined =>
    queryClient
      .getQueryData<{ pages: { messages: Message[] }[] }>(mediaHubQueryKey(conversationId, 'visual', term))
      ?.pages[0]?.messages[0]?.attachments?.find((attachment) => attachment.id === PIECE_ID);

  test('la pièce de l’index bouge avant l’accusé, sur chaque recherche de la conversation, et seulement elle', async () => {
    const queryClient = new QueryClient();
    seedHub(queryClient, 'c-a', null, [piece(PIECE_ID)]);
    seedHub(queryClient, 'c-a', 'plage', [piece(PIECE_ID)]);
    seedHub(queryClient, 'c-b', null, [piece(PIECE_ID)]);
    const before: (readonly string[] | undefined)[] = [];
    setAttachmentReactionEmitter(() => {
      before.push(hubPiece(queryClient, 'c-a', null)?.currentUserReactions);
      return Promise.resolve('ok');
    });

    const outcome = await performAttachmentReaction({
      queryClient,
      conversationId: 'c-a',
      messageId: MESSAGE_ID,
      attachmentId: PIECE_ID,
      emoji: '🔥',
      mine: [],
    });

    expect(outcome).toBe('ok');
    expect(before).toEqual([['🔥']]);
    expect(hubPiece(queryClient, 'c-a', null)?.reactionSummary).toEqual({ '🔥': 1 });
    expect(hubPiece(queryClient, 'c-a', 'plage')?.currentUserReactions).toEqual(['🔥']);
    expect(hubPiece(queryClient, 'c-b', null)?.currentUserReactions).toBeUndefined();
  });

  test('un refus rend la pièce de l’index telle qu’elle était', async () => {
    const queryClient = new QueryClient();
    seedHub(queryClient, 'c-a', null, [piece(PIECE_ID, { reactionSummary: { '🔥': 2 }, currentUserReactions: ['🔥'] })]);
    setAttachmentReactionEmitter(() => Promise.resolve('refused'));

    await performAttachmentReaction({
      queryClient,
      conversationId: 'c-a',
      messageId: MESSAGE_ID,
      attachmentId: PIECE_ID,
      emoji: '🔥',
      mine: ['🔥'],
    });

    expect(hubPiece(queryClient, 'c-a', null)?.reactionSummary).toEqual({ '🔥': 2 });
    expect(hubPiece(queryClient, 'c-a', null)?.currentUserReactions).toEqual(['🔥']);
  });
});

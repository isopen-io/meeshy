import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { mediaHubConversationKey } from './media-hub-cache';
import { messagesQueryKey } from './messages';
import { applyAttachmentReactionUpdate, isAttachmentReactionUpdate } from './realtime-attachment-reactions';
import type { Attachment, Message } from './types';

/**
 * `attachment:reaction-added` / `attachment:reaction-removed` (#7894) — la
 * passerelle diffuse à la room de la conversation le résumé ABSOLU de la pièce
 * (`AttachmentReactionHandler.ts`, `AttachmentReactionUpdateEventData`) et
 * l'ACTEUR (`userId`, depuis #18124).
 *
 * Les témoins de cette suite servent un acteur TIERS (`p-other` / `u-other`)
 * sauf là où ils nomment le lecteur : c'est voulu, et c'est ce qui fait que
 * les témoins de « ma réaction » plus bas peuvent tomber. Un harnais dont
 * l'acteur serait le lecteur rendrait le même verdict avant et après le lot.
 */
const VIEWER = 'u-viewer';

const piece = (partial: Partial<Attachment>): Attachment =>
  ({ id: 'a-1', messageId: 'm-1', mimeType: 'image/png', fileUrl: 'https://cdn.example/p.png', ...partial }) as Attachment;

const seeded = (attachments: readonly Attachment[]): QueryClient => {
  const client = new QueryClient();
  const message: Message = localMessage({ id: 'm-1', conversationId: 'c-a', attachments: [...attachments] });
  client.setQueryData(messagesQueryKey('c-a'), threadPages([message]));
  return client;
};

const event = (partial: Record<string, unknown>): Record<string, unknown> => ({
  attachmentId: 'a-1',
  messageId: 'm-1',
  conversationId: 'c-a',
  participantId: 'p-other',
  userId: 'u-other',
  emoji: '🔥',
  action: 'add',
  reactionSummary: { '🔥': 1 },
  timestamp: '2026-09-25T10:00:00.000Z',
  ...partial,
});

const piecesOf = (client: QueryClient): readonly Attachment[] => threadOf(client, 'c-a')?.messages[0]?.attachments ?? [];

describe('isAttachmentReactionUpdate — garde de forme, fail-closed', () => {
  test('la charge servie passe', () => {
    expect(isAttachmentReactionUpdate(event({}))).toBe(true);
  });

  test('une charge qui ne nomme pas sa pièce, son message ou son résumé est rejetée', () => {
    expect(isAttachmentReactionUpdate(event({ attachmentId: undefined }))).toBe(false);
    expect(isAttachmentReactionUpdate(event({ messageId: 42 }))).toBe(false);
    expect(isAttachmentReactionUpdate(event({ reactionSummary: null }))).toBe(false);
    expect(isAttachmentReactionUpdate(event({ reactionSummary: { '🔥': 'deux' } }))).toBe(false);
    expect(isAttachmentReactionUpdate(null)).toBe(false);
  });
});

describe('applyAttachmentReactionUpdate — le résumé ABSOLU remplace celui de la pièce', () => {
  test('la pièce nommée reçoit le résumé servi ; sa voisine ne bouge pas (même référence)', () => {
    const neighbour = piece({ id: 'a-2' });
    const client = seeded([piece({ reactionSummary: { '😍': 1 } }), neighbour]);
    const payload = event({ reactionSummary: { '😍': 1, '🔥': 2 } });
    if (!isAttachmentReactionUpdate(payload)) throw new Error('charge invalide');

    applyAttachmentReactionUpdate(client, payload, VIEWER);

    const [reacted, quiet] = piecesOf(client);
    expect(reacted?.reactionSummary).toEqual({ '😍': 1, '🔥': 2 });
    expect(quiet).toBe(neighbour);
  });

  test('« ma réaction » n’est pas réécrite par une diffusion', () => {
    const client = seeded([piece({ reactionSummary: { '🔥': 1 }, currentUserReactions: ['🔥'] })]);
    const payload = event({ reactionSummary: { '🔥': 2 } });
    if (!isAttachmentReactionUpdate(payload)) throw new Error('charge invalide');

    applyAttachmentReactionUpdate(client, payload, VIEWER);

    expect(piecesOf(client)[0]?.currentUserReactions).toEqual(['🔥']);
  });

  test('un retrait qui vide le résumé retire la pastille', () => {
    const client = seeded([piece({ reactionSummary: { '🔥': 1 } })]);
    const payload = event({ action: 'remove', reactionSummary: {} });
    if (!isAttachmentReactionUpdate(payload)) throw new Error('charge invalide');

    applyAttachmentReactionUpdate(client, payload, VIEWER);

    expect(piecesOf(client)[0]?.reactionSummary).toEqual({});
  });

  test('pièce inconnue, message inconnu ou fil fermé : rien ne change', () => {
    const client = seeded([piece({})]);
    const before = piecesOf(client);
    for (const partial of [{ attachmentId: 'a-x' }, { messageId: 'm-x' }, { conversationId: 'c-x' }]) {
      const payload = event(partial);
      if (!isAttachmentReactionUpdate(payload)) throw new Error('charge invalide');
      applyAttachmentReactionUpdate(client, payload, VIEWER);
    }
    expect(piecesOf(client)).toBe(before);
  });
});

describe('#18124 — « ma réaction » ne bascule que pour le geste du LECTEUR', () => {
  test("l'écho de MON geste depuis un autre appareil allume la pastille", () => {
    const client = seeded([piece({ reactionSummary: {}, currentUserReactions: [] })]);

    applyAttachmentReactionUpdate(client, event({ userId: VIEWER }) as never, VIEWER);

    expect(piecesOf(client)[0]?.currentUserReactions).toEqual(['🔥']);
  });

  test('MON retrait depuis un autre appareil l’éteint', () => {
    const client = seeded([piece({ reactionSummary: { '🔥': 1 }, currentUserReactions: ['🔥', '😍'] })]);

    applyAttachmentReactionUpdate(
      client,
      event({ userId: VIEWER, action: 'remove', reactionSummary: {} }) as never,
      VIEWER,
    );

    expect(piecesOf(client)[0]?.currentUserReactions).toEqual(['😍']);
  });

  test("le geste d'un TIERS met le résumé à jour et ne touche pas ma pastille", () => {
    const client = seeded([piece({ reactionSummary: {}, currentUserReactions: ['😍'] })]);

    applyAttachmentReactionUpdate(client, event({}) as never, VIEWER);

    expect(piecesOf(client)[0]?.reactionSummary).toEqual({ '🔥': 1 });
    expect(piecesOf(client)[0]?.currentUserReactions).toEqual(['😍']);
  });

  test("un invité de lien (`userId: null`) ne fait basculer la pastille de personne", () => {
    const client = seeded([piece({ reactionSummary: {}, currentUserReactions: [] })]);

    applyAttachmentReactionUpdate(client, event({ userId: null }) as never, VIEWER);

    expect(piecesOf(client)[0]?.currentUserReactions).toEqual([]);
  });

  test('une double livraison du MÊME geste est idempotente', () => {
    const client = seeded([piece({ reactionSummary: {}, currentUserReactions: [] })]);

    applyAttachmentReactionUpdate(client, event({ userId: VIEWER }) as never, VIEWER);
    applyAttachmentReactionUpdate(client, event({ userId: VIEWER }) as never, VIEWER);

    expect(piecesOf(client)[0]?.currentUserReactions).toEqual(['🔥']);
  });

  test('une charge dont le `userId` n’est ni une chaîne ni nul est refusée à la porte', () => {
    expect(isAttachmentReactionUpdate(event({ userId: 42 }))).toBe(false);
    expect(isAttachmentReactionUpdate(event({ userId: null }))).toBe(true);
    expect(isAttachmentReactionUpdate(event({ userId: undefined }))).toBe(true);
  });
});

/**
 * #20303 — ET L'INDEX DES MÉDIAS REÇOIT LE MÊME RÉSUMÉ.
 *
 * Le geste LOCAL écrit les deux index, et dit pourquoi (#8180 — « la
 * visionneuse qui en est ouverte y relit sa page ») ; l'applieur TEMPS RÉEL,
 * qui RÉCONCILIE ce geste avec le résumé absolu du serveur, n'écrivait que le
 * fil. La copie de l'index n'était donc jamais réconciliée.
 *
 * Le symptôme est étroit mais réel, et c'est un contrôle INERTE : la tuile ne
 * rend pas de pastille, mais la visionneuse plein écran ouverte depuis
 * « Médias » initialise son ensemble « les miennes » depuis
 * `currentUserReactions` (`viewer-media-actions.tsx`). Une ❤️ posée depuis le
 * téléphone n'y est pas rendue comme sienne, et la toucher planifie un `add`
 * au lieu d'un `remove` (`attachmentReactionPlan`).
 */
describe('#20303 — le résumé servi atteint aussi l’index des médias', () => {
  const seedHub = (client: QueryClient, attachments: readonly Attachment[]): void => {
    client.setQueryData(mediaHubConversationKey('c-a'), threadPages([localMessage({ id: 'm-1', conversationId: 'c-a', attachments: [...attachments] })]));
  };

  const hubPiecesOf = (client: QueryClient): readonly Attachment[] =>
    (client.getQueryData<{ pages: { messages: Message[] }[] }>(mediaHubConversationKey('c-a'))?.pages ?? []).flatMap((p) => p.messages).find((m) => m.id === 'm-1')?.attachments ?? [];

  test('le résumé absolu remplace celui de la pièce dans les DEUX index', () => {
    const client = seeded([piece({ reactionSummary: { '😍': 1 } })]);
    seedHub(client, [piece({ reactionSummary: { '😍': 1 } })]);
    const payload = event({ reactionSummary: { '😍': 1, '🔥': 2 } });
    if (!isAttachmentReactionUpdate(payload)) throw new Error('charge invalide');

    applyAttachmentReactionUpdate(client, payload, VIEWER);

    expect(piecesOf(client)[0]?.reactionSummary).toEqual({ '😍': 1, '🔥': 2 });
    expect(hubPiecesOf(client)[0]?.reactionSummary).toEqual({ '😍': 1, '🔥': 2 });
  });

  /** C'est CE champ que la visionneuse de l'écran des médias relit pour savoir ce qui est à moi. */
  test('« ma réaction » posée ailleurs est rendue dans l’index des médias', () => {
    const client = seeded([piece({ reactionSummary: {}, currentUserReactions: [] })]);
    seedHub(client, [piece({ reactionSummary: {}, currentUserReactions: [] })]);
    const payload = event({ userId: VIEWER, emoji: '❤️', action: 'add', reactionSummary: { '❤️': 1 } });
    if (!isAttachmentReactionUpdate(payload)) throw new Error('charge invalide');

    applyAttachmentReactionUpdate(client, payload, VIEWER);

    expect(hubPiecesOf(client)[0]?.currentUserReactions).toEqual(['❤️']);
  });

  test('le geste d’un TIERS ne s’attribue pas au lecteur dans l’index des médias', () => {
    const client = seeded([piece({ reactionSummary: {}, currentUserReactions: [] })]);
    seedHub(client, [piece({ reactionSummary: {}, currentUserReactions: [] })]);
    const payload = event({ reactionSummary: { '🔥': 1 } });
    if (!isAttachmentReactionUpdate(payload)) throw new Error('charge invalide');

    applyAttachmentReactionUpdate(client, payload, VIEWER);

    expect(hubPiecesOf(client)[0]?.currentUserReactions ?? []).toEqual([]);
    expect(hubPiecesOf(client)[0]?.reactionSummary).toEqual({ '🔥': 1 });
  });
});

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { moodCitationOf, storyCitationOf } from '@/lib/view/message-body';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import { applyCitedPostWithdrawn, isCitedPostWithdrawnEvent } from './realtime-cited-post';
import type { Message } from './types';

/**
 * `message:cited-post-withdrawn` (#7969) — la story citée par des messages du
 * fil a été SUPPRIMÉE par son auteur. La carte passe « Story indisponible »
 * sans navigation, comme la lecture REST la rend déjà (`postReplyTo.deletedAt`,
 * #7950), et rien de l'instantané retiré ne reste dans le cache.
 */

const STORY = 'story-1';
const DELETED_AT = '2026-09-25T10:00:00.000Z';

const snapshot = (partial: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: STORY,
  type: 'STORY',
  previewText: 'Coucher de soleil',
  thumbnailUrl: 'https://cdn/thumb.jpg',
  moodEmoji: null,
  createdAt: '2026-09-24T18:00:00.000Z',
  ...partial,
});

type CitingMessage = Message & { readonly postReplyTo?: unknown };

const citing = (partial: Partial<Message> & { readonly postReplyTo?: unknown } = {}): CitingMessage =>
  localMessage({
    id: 'm-reply',
    senderId: 'u-other',
    content: 'Trop beau !',
    storyReplyToId: STORY,
    ...(partial as Partial<Message>),
  }) as CitingMessage;

const seeded = (messages: readonly Message[], conversationId = 'c-a'): QueryClient => {
  const client = new QueryClient();
  client.setQueryData(messagesQueryKey(conversationId), threadPages(messages));
  return client;
};

const withdraw = (client: QueryClient, partial: Record<string, unknown> = {}): void => {
  const payload = { conversationId: 'c-a', postId: STORY, deletedAt: DELETED_AT, ...partial };
  if (!isCitedPostWithdrawnEvent(payload)) throw new Error('charge invalide');
  applyCitedPostWithdrawn(client, payload);
};

const rowOf = (client: QueryClient, id = 'm-reply', conversationId = 'c-a'): CitingMessage | undefined =>
  threadOf(client, conversationId)?.messages.find((m) => m.id === id) as CitingMessage | undefined;

describe('gardes de forme — fail-closed', () => {
  test('la charge servie passe', () => {
    expect(isCitedPostWithdrawnEvent({ conversationId: 'c-a', postId: STORY, deletedAt: DELETED_AT })).toBe(true);
  });

  test('une charge sans conversation, post ou date est rejetée', () => {
    expect(isCitedPostWithdrawnEvent({ postId: STORY, deletedAt: DELETED_AT })).toBe(false);
    expect(isCitedPostWithdrawnEvent({ conversationId: 'c-a', deletedAt: DELETED_AT })).toBe(false);
    expect(isCitedPostWithdrawnEvent({ conversationId: 'c-a', postId: STORY })).toBe(false);
    expect(isCitedPostWithdrawnEvent(null)).toBe(false);
  });
});

describe('message:cited-post-withdrawn — la carte passe « Story indisponible » sans navigation', () => {
  test('une citation hissée à la RACINE devient indisponible', () => {
    const client = seeded([citing({ postReplyTo: snapshot() })]);
    expect(storyCitationOf(rowOf(client) as CitingMessage)?.unavailable).toBe(false);

    withdraw(client);

    expect(storyCitationOf(rowOf(client) as CitingMessage)).toEqual({
      id: STORY,
      previewText: '',
      thumbnailUrl: null,
      createdAt: '',
      unavailable: true,
    });
  });

  test('une citation lue dans `metadata.postReplyTo` (REST) devient indisponible, et sa vignette quitte le cache', () => {
    const client = seeded([citing({ metadata: { postReplyTo: snapshot(), other: 'kept' } })]);

    withdraw(client);

    const row = rowOf(client) as CitingMessage;
    expect(storyCitationOf(row)?.unavailable).toBe(true);
    expect(JSON.stringify(row)).not.toContain('thumb.jpg');
    expect(JSON.stringify(row)).not.toContain('Coucher de soleil');
    expect((row.metadata as Record<string, unknown>).other).toBe('kept');
  });

  test('une HUMEUR retirée n’est plus une humeur', () => {
    const client = seeded([citing({ postReplyTo: snapshot({ moodEmoji: '🌅' }) })]);
    expect(moodCitationOf(rowOf(client) as CitingMessage)).not.toBeNull();

    withdraw(client);

    expect(moodCitationOf(rowOf(client) as CitingMessage)).toBeNull();
    expect(storyCitationOf(rowOf(client) as CitingMessage)?.unavailable).toBe(true);
  });

  test('le contenu du message qui cite reste intact', () => {
    const client = seeded([citing({ postReplyTo: snapshot() })]);

    withdraw(client);

    expect(rowOf(client)?.content).toBe('Trop beau !');
  });

  test('la citation embarquée d’une réponse À ce message suit aussi', () => {
    const quoted = citing({ postReplyTo: snapshot() });
    const answer = localMessage({ id: 'm-answer', senderId: 'u-viewer', content: 'Oui', replyToId: quoted.id, replyTo: quoted });
    const client = seeded([answer]);

    withdraw(client);

    const nested = rowOf(client, 'm-answer')?.replyTo as CitingMessage;
    expect(storyCitationOf(nested)?.unavailable).toBe(true);
    expect(JSON.stringify(nested)).not.toContain('thumb.jpg');
  });

  test('un message qui cite une AUTRE story ne bouge pas', () => {
    const other = citing({ id: 'm-other', storyReplyToId: 'story-2', postReplyTo: snapshot({ id: 'story-2' }) });
    const client = seeded([other]);
    const before = rowOf(client, 'm-other');

    withdraw(client);

    expect(rowOf(client, 'm-other')).toBe(before);
  });
});

describe('aucune fuite inter-conversation', () => {
  test('un événement qui nomme une AUTRE conversation ne touche pas ce fil', () => {
    const client = seeded([citing({ postReplyTo: snapshot() })], 'c-a');

    withdraw(client, { conversationId: 'c-b' });

    expect(storyCitationOf(rowOf(client) as CitingMessage)?.unavailable).toBe(false);
  });

  test('fil fermé : rien n’est fabriqué', () => {
    const client = new QueryClient();

    withdraw(client);

    expect(threadOf(client, 'c-a')).toBeUndefined();
  });
});

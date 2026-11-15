/**
 * #7593 — les avis de vie du groupe atteignent la ligne de liste sous leur clé
 * localisable, avec l'ACTEUR : REST (`GET /conversations` → `lastMessage.systemEvent`,
 * lu à travers le vrai sérialiseur) et socket (`conversation:updated`, composé
 * par `resolveLastMessagePreviewGroup`). La dernière étape rejoue le composeur
 * partagé : les noms de params que le serveur pose sont ceux qu'il lit.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify from 'fastify';
import { conversationListResponseSchema } from '@meeshy/shared/types/api-schemas';
import { composeConversationPreview, renderConversationPreviewText } from '@meeshy/shared/utils/conversation-preview';
import type { LastMessageSystemEvent } from '@meeshy/shared/types/conversation-preview';
import { resolveLastMessageNature } from '../routes/conversations/utils/last-message-nature';
import { resolveLastMessagePreviewGroup } from '../socketio/utils/lastMessagePreviewGroup';

const NOW = new Date('2026-09-23T12:00:00Z');
const demo = { participantId: 'p-demo', displayName: 'Demo' };
const bob = { participantId: 'p-bob', displayName: 'Bob' };

const reader = {
  id: 'p-reader',
  userId: 'u-reader',
  user: { systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: null, deviceLocale: null },
};

const systemMessage = (metadata: Record<string, unknown>, content = 'repli FR') => ({
  id: 'msg-sys',
  content,
  originalLanguage: 'fr',
  translations: null,
  messageType: 'system',
  messageSource: 'system',
  effectFlags: 0,
  isBlurred: false,
  isViewOnce: false,
  isEncrypted: false,
  expiresAt: null,
  ephemeralDuration: null,
  forwardedFromId: null,
  metadata,
  sender: { displayName: 'Bob', user: null },
  attachments: [],
  _count: { attachments: 0 },
});

type Case = {
  readonly label: string;
  readonly metadata: Record<string, unknown>;
  readonly event: LastMessageSystemEvent;
  readonly text: string;
};

const CASES: readonly Case[] = [
  {
    label: 'ajout par un tiers',
    metadata: { kind: 'member-joined', participantId: 'p-bob', displayName: 'Bob', isAnonymous: false, viaShareLink: false, addedBy: demo },
    event: { key: 'system.member-added', params: { actor: 'Demo', target: 'Bob' } },
    text: 'Demo a ajouté Bob',
  },
  {
    label: 'arrivée de soi-même (lien)',
    metadata: { kind: 'member-joined', participantId: 'p-bob', displayName: 'Bob', isAnonymous: false, viaShareLink: true },
    event: { key: 'system.member-joined', params: { name: 'Bob' } },
    text: 'Bob a rejoint la conversation',
  },
  {
    label: 'retrait par un tiers',
    metadata: { kind: 'member-removed', actor: demo, target: bob },
    event: { key: 'system.member-removed', params: { actor: 'Demo', target: 'Bob' } },
    text: 'Demo a retiré Bob',
  },
  {
    label: 'départ volontaire',
    metadata: { kind: 'member-left', actor: bob },
    event: { key: 'system.member-left', params: { actor: 'Bob' } },
    text: 'Bob a quitté la conversation',
  },
  {
    label: 'renommage',
    metadata: { kind: 'conversation-renamed', actor: demo },
    event: { key: 'system.conversation-renamed', params: { actor: 'Demo' } },
    text: 'Nom du groupe modifié',
  },
  {
    label: "changement d'image",
    metadata: { kind: 'conversation-image', actor: demo },
    event: { key: 'system.conversation-image', params: { actor: 'Demo' } },
    text: 'Photo du groupe modifiée',
  },
  {
    label: 'arrivées regroupées de Meeshy Global (#7740)',
    metadata: {
      kind: 'members-arrived',
      arrivals: [
        { participantId: 'p-aicha', displayName: 'Aïcha' },
        { participantId: 'p-tom', displayName: 'Tom' },
        { participantId: 'p-lea', displayName: 'Léa' },
      ],
      count: 14,
      windowStartedAt: '2026-09-23T11:55:00.000Z',
    },
    event: { key: 'system.members-arrived', params: { first: 'Aïcha', second: 'Tom', third: '', others: 12, count: 14 } },
    text: 'Aïcha, Tom et 12 autres viennent d’arriver — dis-leur salut',
  },
];

async function servedSystemEvent(systemEvent: LastMessageSystemEvent | null) {
  const app = Fastify({ logger: false });
  app.get('/conversations', { schema: { response: { 200: conversationListResponseSchema } } }, async () => ({
    success: true,
    data: [{
      id: 'c1',
      type: 'group',
      createdAt: '2026-09-23T09:00:00.000Z',
      lastMessage: { id: 'msg-sys', content: 'repli FR', senderId: 'p-bob', messageType: 'system', createdAt: NOW.toISOString(), systemEvent },
    }],
    pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
  }));
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/conversations' });
  await app.close();
  return res.json().data[0].lastMessage.systemEvent;
}

describe('#7593 — chaque avis de vie du groupe a sa clé et son acteur', () => {
  it.each(CASES)('REST : $label survit au sérialiseur de GET /conversations', async ({ metadata, event }) => {
    const nature = resolveLastMessageNature(systemMessage(metadata));
    expect(nature.systemEvent).toEqual(event);
    expect(await servedSystemEvent(nature.systemEvent)).toEqual(event);
  });

  it.each(CASES)('socket : $label part sur conversation:updated', ({ metadata, event }) => {
    const group = resolveLastMessagePreviewGroup(reader, systemMessage(metadata), NOW);
    expect(group.lastMessageSystemEvent).toEqual(event);
  });

  it.each(CASES)('le composeur partagé rend $label en italique et sans auteur', ({ metadata, text }) => {
    const { systemEvent } = resolveLastMessageNature(systemMessage(metadata));
    const value = composeConversationPreview({
      viewerId: 'u-reader',
      language: 'fr',
      preferredLanguages: ['fr', 'en'],
      now: NOW.toISOString(),
      lastMessage: {
        id: 'msg-sys',
        senderId: 'p-bob',
        senderName: 'Bob',
        createdAt: NOW.toISOString(),
        messageType: 'system',
        originalLanguage: 'fr',
        content: 'repli FR',
        systemEvent,
      },
    } as Parameters<typeof composeConversationPreview>[0]);
    expect(value.tone).toBe('system');
    expect(value.author).toBeNull();
    expect(renderConversationPreviewText(value, 'fr')).toBe(text);
  });

  it("le texte FR stocké ne part jamais comme clé : l'avis mal formé reste générique", () => {
    const nature = resolveLastMessageNature(systemMessage({ kind: 'member-removed', actor: demo }, 'Demo a retiré Bob'));
    expect(nature.systemEvent).toEqual({ key: 'system.generic', params: {} });
  });
});

/**
 * #6111 — Le dernier message protégé (vue unique / flouté / éphémère périmé)
 * ne s'affiche plus en clair au démarrage à froid.
 *
 * La chaîne était rompue en DEUX endroits, et chaque rupture cachait l'autre :
 *
 *   1. `messageMinimalSchema` ne déclarait ni `isViewOnce`, ni `isBlurred`, ni
 *      `expiresAt`, ni `effectFlags` — le `select` Prisma les charge, le
 *      mapper les répand, mais `fast-json-stringify` retire en SILENCE toute
 *      propriété non déclarée. iOS ne recevait donc jamais de quoi classer
 *      l'aperçu (`LastMessageSummaryKind`).
 *   2. `GET /conversations` et `GET /conversations/search` servaient
 *      `content: truncateMessagePreview(msg.content)` SANS CONDITION, en
 *      s'en remettant au client pour le cacher — à partir de drapeaux qu'on
 *      venait de lui retirer.
 *
 * Ce témoin exerce la VRAIE sérialisation (`fast-json-stringify` contre le
 * schéma partagé), la seule lecture qui mesure quelque chose (cf.
 * `services/gateway/CLAUDE.md` § « un témoin qui n'exerce pas la
 * SÉRIALISATION atteste un contrat que personne ne respecte ») : un test qui
 * n'assert que sur l'objet composé par le handler prouverait qu'il POSE les
 * champs, jamais qu'ils SURVIVENT jusqu'au fil.
 */

import { describe, it, expect } from '@jest/globals';
import fastJsonStringify from 'fast-json-stringify';
import { conversationMinimalSchema } from '@meeshy/shared/types/api-schemas';
import { isLastMessageProtected } from '@meeshy/shared/utils/last-message-protection';

function serializeConversation(payload: unknown): Record<string, any> {
  const stringify = fastJsonStringify(conversationMinimalSchema as never);
  return JSON.parse(stringify(payload));
}

const BASE_CONVERSATION = {
  id: 'conv-1',
  identifier: null,
  title: 'Alice',
  description: null,
  type: 'direct',
  avatar: null,
  banner: null,
  isActive: true,
  communityId: null,
  memberCount: 2,
  memberCountCapped: null,
  lastMessageAt: '2026-09-12T10:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
  unreadCount: 1
};

/**
 * Reproduit EXACTEMENT la construction de `core-list.ts`/`search.ts` après
 * correctif : un aperçu protégé ne transporte plus rien de son contenu, et
 * les quatre drapeaux qui le qualifient continuent de partir.
 */
function buildLastMessage(flags: {
  isBlurred?: boolean;
  isViewOnce?: boolean;
  expiresAt?: string | null;
}) {
  const protectedMsg = isLastMessageProtected({
    isBlurred: flags.isBlurred ?? false,
    isViewOnce: flags.isViewOnce ?? false,
    expiresAt: flags.expiresAt ?? null
  });

  return {
    id: 'msg-1',
    content: protectedMsg ? '' : 'le vrai texte du message',
    senderId: 'user-1',
    messageType: 'text',
    createdAt: '2026-09-12T10:00:00.000Z',
    isBlurred: flags.isBlurred ?? false,
    isViewOnce: flags.isViewOnce ?? false,
    expiresAt: flags.expiresAt ?? null,
    effectFlags: 0,
    location: protectedMsg ? undefined : { latitude: 48.85, longitude: 2.35 },
    metadata: protectedMsg ? null : { location: { latitude: 48.85, longitude: 2.35 } },
    attachments: protectedMsg ? null : [{ id: 'att-1', mimeType: 'image/jpeg' }],
    _count: protectedMsg ? { attachments: 0 } : { attachments: 1 },
    sender: { id: 'p-1', userId: 'user-1', displayName: 'Alice', avatar: null, type: 'user' }
  };
}

describe('messageMinimalSchema — les quatre drapeaux de protection survivent à la sérialisation', () => {
  it('laisse passer isViewOnce / isBlurred / expiresAt / effectFlags sur un aperçu standard', () => {
    const out = serializeConversation({
      ...BASE_CONVERSATION,
      lastMessage: buildLastMessage({}),
      lastMessageOriginalLanguage: 'fr',
      lastMessageTranslations: null
    });

    expect(out.lastMessage.isBlurred).toBe(false);
    expect(out.lastMessage.isViewOnce).toBe(false);
    expect(out.lastMessage.expiresAt ?? null).toBeNull();
    expect(out.lastMessage.effectFlags).toBe(0);
  });

  it('sert le drapeau isViewOnce=true sur un aperçu à vue unique', () => {
    const out = serializeConversation({
      ...BASE_CONVERSATION,
      lastMessage: buildLastMessage({ isViewOnce: true }),
      lastMessageOriginalLanguage: null,
      lastMessageTranslations: null
    });

    expect(out.lastMessage.isViewOnce).toBe(true);
  });
});

describe('#6111 — un dernier message protégé ne sert jamais son texte', () => {
  it('un aperçu STANDARD sert son texte, son lieu et ses pièces jointes', () => {
    const out = serializeConversation({
      ...BASE_CONVERSATION,
      lastMessage: buildLastMessage({}),
      lastMessageOriginalLanguage: 'fr',
      lastMessageTranslations: null
    });

    expect(out.lastMessage.content).toBe('le vrai texte du message');
    expect(out.lastMessage.location).toBeTruthy();
    expect(out.lastMessage.attachments).toHaveLength(1);
    expect(out.lastMessage._count.attachments).toBe(1);
  });

  it('un aperçu FLOUTÉ (isBlurred) ne sert ni texte, ni lieu, ni pièces jointes', () => {
    const out = serializeConversation({
      ...BASE_CONVERSATION,
      lastMessage: buildLastMessage({ isBlurred: true }),
      lastMessageOriginalLanguage: 'fr',
      lastMessageTranslations: null
    });

    expect(out.lastMessage.content).toBe('');
    expect(out.lastMessage.location ?? null).toBeNull();
    expect(out.lastMessage.attachments ?? null).toBeNull();
    expect(out.lastMessage._count.attachments).toBe(0);
    // Identité, horloge, type et drapeaux continuent de partir — ce sont eux
    // qui qualifient le placeholder que le client compose.
    expect(out.lastMessage.id).toBe('msg-1');
    expect(out.lastMessage.senderId).toBe('user-1');
    expect(out.lastMessage.isBlurred).toBe(true);
  });

  it('un aperçu VUE UNIQUE (isViewOnce) ne sert ni texte, ni lieu, ni pièces jointes', () => {
    const out = serializeConversation({
      ...BASE_CONVERSATION,
      lastMessage: buildLastMessage({ isViewOnce: true }),
      lastMessageOriginalLanguage: 'fr',
      lastMessageTranslations: null
    });

    expect(out.lastMessage.content).toBe('');
    expect(out.lastMessage.attachments ?? null).toBeNull();
  });

  it('un aperçu ÉPHÉMÈRE PÉRIMÉ (expiresAt dans le passé) ne sert ni texte, ni lieu', () => {
    const out = serializeConversation({
      ...BASE_CONVERSATION,
      lastMessage: buildLastMessage({ expiresAt: '2020-01-01T00:00:00.000Z' }),
      lastMessageOriginalLanguage: 'fr',
      lastMessageTranslations: null
    });

    expect(out.lastMessage.content).toBe('');
    expect(out.lastMessage.location ?? null).toBeNull();
  });

  it('un aperçu ÉPHÉMÈRE ENCORE ACTIF (expiresAt dans le futur) reste lisible', () => {
    const out = serializeConversation({
      ...BASE_CONVERSATION,
      lastMessage: buildLastMessage({ expiresAt: '2099-01-01T00:00:00.000Z' }),
      lastMessageOriginalLanguage: 'fr',
      lastMessageTranslations: null
    });

    expect(out.lastMessage.content).toBe('le vrai texte du message');
  });

  it('la carte du Prisme (lastMessageTranslations) est retirée pour un aperçu protégé', () => {
    const out = serializeConversation({
      ...BASE_CONVERSATION,
      lastMessage: buildLastMessage({ isBlurred: true }),
      lastMessageOriginalLanguage: null,
      lastMessageTranslations: null
    });

    expect(out.lastMessageTranslations ?? null).toBeNull();
  });
});

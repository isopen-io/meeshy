/**
 * La ligne de liste ne recule pas — la garde monotone du groupe d'aperçu.
 *
 * Le défaut fermé ici : les SIX écrivains web de `conversation.lastMessage`
 * appliquaient tout ce qui leur arrivait, sans jamais comparer l'horodatage du
 * message nommé à celui du message que la ligne décrivait déjà. Un écrivain qui
 * nomme un message plus ANCIEN faisait donc reculer la ligne — son texte, son
 * auteur, sa carte du Prisme, et son RANG (`sortConversations` trie sur
 * `lastMessageAt`). Le cache tournant en `staleTime: Infinity`, rien ne
 * repassait corriger.
 *
 * Deux désordres ordinaires y mènent, et aucun n'est une course exotique :
 *
 *   1. `MessageHandler` diffuse `message:new` dans la room de CONVERSATION puis
 *      `conversation:updated` dans la room USER de chaque participant, avec un
 *      `prisma.participant.findMany` AWAITÉ entre les deux. Deux envois
 *      concurrents dans le même fil sortent leurs `conversation:updated` dans
 *      l'ordre de leurs requêtes, pas dans celui de leurs messages.
 *   2. Sur une conversation absente du cache, chaque `message:new` déclenche un
 *      `GET /conversations/:id`. Deux messages rapides dans un DM tout neuf
 *      lancent DEUX fetches, et rien ne garantit que le plus ancien résolve en
 *      premier.
 *
 * C'est la règle que `ConversationStore.merging` tient côté iOS depuis le cycle
 * 46 bis — `previewRecalculated` compris, le drapeau par lequel le serveur
 * déclare un recul LÉGITIME. Le web décodait ce drapeau et le jetait.
 */

import {
  mergeConversationUpdate,
  withArrivedMessage,
} from '../use-socket-cache-sync';
import type { Conversation, Message } from '@meeshy/shared/types';

const OLDER_AT = new Date('2026-08-17T10:00:00.000Z');
const NEWER_AT = new Date('2026-08-17T10:00:05.000Z');

const makeMessage = (overrides: Partial<Message> = {}): Message =>
  ({
    id: 'msg-newer',
    conversationId: 'conv-1',
    senderId: 'user-2',
    content: 'Le plus récent',
    originalLanguage: 'fr',
    createdAt: NEWER_AT,
    ...overrides,
  }) as unknown as Message;

/** Une ligne qui décrit DÉJÀ le message le plus récent. */
const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'conv-1',
    type: 'group',
    title: 'Équipe produit',
    participants: [],
    unreadCount: 0,
    lastMessageAt: NEWER_AT,
    lastMessage: makeMessage(),
    lastMessageTranslations: { en: 'The newest' },
    lastMessageOriginalLanguage: 'fr',
    ...overrides,
  }) as unknown as Conversation;

describe('withArrivedMessage — le message qui arrive en retard', () => {
  it('rend null quand la ligne décrit déjà un message plus récent', () => {
    const conversation = makeConversation();
    const late = makeMessage({ id: 'msg-older', content: "L'ancien", createdAt: OLDER_AT });

    expect(withArrivedMessage({ conversation, message: late })).toBeNull();
  });

  it('applique le message quand il est plus récent que celui de la ligne', () => {
    const conversation = makeConversation({
      lastMessageAt: OLDER_AT,
      lastMessage: makeMessage({ id: 'msg-older', content: "L'ancien", createdAt: OLDER_AT }),
    });
    const arrival = makeMessage();

    const next = withArrivedMessage({ conversation, message: arrival });

    expect(next?.lastMessage?.id).toBe('msg-newer');
  });

  it("applique le message que la ligne décrit déjà — une ré-émission n'est pas un recul", () => {
    const conversation = makeConversation();
    const sameAgain = makeMessage();

    const next = withArrivedMessage({ conversation, message: sameAgain });

    expect(next).not.toBeNull();
    expect(next?.lastMessage?.id).toBe('msg-newer');
  });

  it('applique le message quand la ligne ne décrit encore rien', () => {
    const conversation = makeConversation({
      lastMessageAt: undefined,
      lastMessage: undefined,
    } as Partial<Conversation>);

    const next = withArrivedMessage({ conversation, message: makeMessage() });

    expect(next?.lastMessage?.id).toBe('msg-newer');
  });
});

describe('mergeConversationUpdate — le `conversation:updated` arrivé en retard', () => {
  const stalePayload = {
    lastMessageId: 'msg-older',
    lastMessagePreview: "L'ancien",
    lastMessageAt: OLDER_AT.toISOString(),
    lastMessageOriginalLanguage: 'en',
    lastMessageTranslations: { fr: "L'ancien traduit" },
    senderId: 'user-3',
  };

  it('laisse intact le groupe d\'aperçu quand le payload nomme un message plus ancien', () => {
    const merged = mergeConversationUpdate(makeConversation(), stalePayload);

    expect(merged.lastMessage?.id).toBe('msg-newer');
    expect(merged.lastMessageAt).toEqual(NEWER_AT);
    expect(merged.lastMessageTranslations).toEqual({ en: 'The newest' });
    expect(merged.lastMessageOriginalLanguage).toBe('fr');
  });

  it('applique quand même les champs sans ordre du même payload', () => {
    const merged = mergeConversationUpdate(makeConversation(), {
      ...stalePayload,
      title: 'Équipe produit — renommée',
    });

    expect(merged.title).toBe('Équipe produit — renommée');
    expect(merged.lastMessage?.id).toBe('msg-newer');
  });

  it('applique le recul quand le serveur déclare `previewRecalculated`', () => {
    const merged = mergeConversationUpdate(makeConversation(), {
      ...stalePayload,
      previewRecalculated: true,
    });

    expect(merged.lastMessage?.id).toBe('msg-older');
    expect(merged.lastMessageAt).toEqual(OLDER_AT);
    expect(merged.lastMessageTranslations).toEqual({ fr: "L'ancien traduit" });
  });

  it("applique une ÉDITION du message décrit — l'horodatage égal n'est pas un recul", () => {
    const merged = mergeConversationUpdate(makeConversation(), {
      lastMessageId: 'msg-newer',
      lastMessagePreview: 'Le plus récent, corrigé',
      lastMessageAt: NEWER_AT.toISOString(),
      lastMessageTranslations: null,
    });

    expect(merged.lastMessage?.content).toBe('Le plus récent, corrigé');
    expect(merged.lastMessageTranslations).toBeUndefined();
  });

  it('applique un payload plus récent', () => {
    const conversation = makeConversation({
      lastMessageAt: OLDER_AT,
      lastMessage: makeMessage({ id: 'msg-older', content: "L'ancien", createdAt: OLDER_AT }),
    });

    const merged = mergeConversationUpdate(conversation, {
      lastMessageId: 'msg-newer',
      lastMessagePreview: 'Le plus récent',
      lastMessageAt: NEWER_AT.toISOString(),
    });

    expect(merged.lastMessage?.id).toBe('msg-newer');
    expect(merged.lastMessageAt).toEqual(NEWER_AT);
  });

  it("n'a pas d'avis sur un payload qui ne parle pas du dernier message", () => {
    const merged = mergeConversationUpdate(makeConversation(), { title: 'Renommée' });

    expect(merged.title).toBe('Renommée');
    expect(merged.lastMessage?.id).toBe('msg-newer');
    expect(merged.lastMessageAt).toEqual(NEWER_AT);
  });
});

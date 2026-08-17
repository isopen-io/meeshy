/**
 * Cycle 54 — les écrivains LOCAUX de la ligne de liste et la carte du Prisme.
 *
 * Le cycle 53 a fermé le mélange sur le chemin du fan-out SERVEUR
 * (`conversation:updated` → `mergeConversationUpdate`). Sa leçon 212 pose la
 * question de suivi, et elle est mécanique : *quels sont TOUS les écrivains de
 * ce que la ligne AFFICHE ?*
 *
 * Réponse, côté web : **sept**. Un seul écrit la carte du Prisme — le fan-out
 * serveur (`mergeConversationUpdate`). Les six autres sont locaux, et aucun ne
 * la touchait :
 *
 *   1. `message:new` (`handleNewMessage`) — le chemin le plus fréquenté ;
 *   2. la même chose pour une conversation absente du cache (branche `fetched`) ;
 *   3. `message:edited` (`handleMessageEdited`) ;
 *   4. `message:deleted` (`advanceConversationPreviewOnDelete`) ;
 *   5. `link:message:new` (`handleLinkMessageNew`) ;
 *   6. `message:new`, encore — `use-conversations-v2.ts`, un SECOND écouteur sur
 *      le MÊME événement écrivant dans le MÊME cache.
 *
 * Chacun réécrit `conversation.lastMessage` — l'OBJET — en laissant
 * `lastMessageTranslations` décrire le message PRÉCÉDENT. Et `formatLastMessage`
 * PRÉFÈRE cette carte à `lastMessage.content` : la ligne rend donc l'auteur et
 * l'horodatage du nouveau message, avec le TEXTE de l'ancien.
 *
 * Sur cinq de ces six chemins le serveur envoie un `conversation:updated`
 * jumeau qui repose la carte juste derrière — le mélange n'y dure que le temps
 * d'une trame. **`link:message:new` n'en a pas**, et c'est délibéré : le gateway
 * documente noir sur blanc qu'il ne l'émet pas parce que « le handler web
 * applique déjà l'aperçu depuis cet événement » (`broadcastLinkMessage.ts`).
 * Vrai de l'objet, faux de la carte — exactement la forme de raisonnement que la
 * leçon 212 décrit. Sur une conversation de lien partagé, la ligne reste donc
 * DURABLEMENT fausse : rien ne repasse jamais.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withPreviewMessage } from '../use-socket-cache-sync';
import { resolveLastMessagePreview } from '@meeshy/shared/utils/conversation-helpers';
import type { Conversation, Message } from '@meeshy/shared/types';

const PREVIOUS_AT = new Date('2026-08-17T09:00:00.000Z');
const INCOMING_AT = new Date('2026-08-17T10:00:00.000Z');

const makeMessage = (overrides: Partial<Message> = {}): Message =>
  ({
    id: 'msg-previous',
    conversationId: 'conv-1',
    senderId: 'user-2',
    content: 'Good evening',
    originalLanguage: 'en',
    createdAt: PREVIOUS_AT,
    sender: { id: 'user-2', displayName: 'Windie', username: 'windie' },
    ...overrides,
  }) as unknown as Message;

/**
 * Une ligne servie par le Prisme : le lecteur est francophone, le dernier
 * message est anglais, et la carte porte sa traduction. C'est l'état nominal
 * d'un `GET /conversations` — pas un cas limite.
 */
const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'conv-1',
    type: 'group',
    title: 'Équipe produit',
    participants: [],
    unreadCount: 0,
    lastMessageAt: PREVIOUS_AT,
    lastMessage: makeMessage(),
    lastMessageTranslations: { fr: 'Bonsoir' },
    lastMessageOriginalLanguage: 'en',
    ...overrides,
  }) as unknown as Conversation;

/** Ce que `formatLastMessage` sert au lecteur, sans monter le composant. */
const displayedText = (conversation: Conversation, preferredLanguages: readonly string[]) =>
  resolveLastMessagePreview({
    preview: conversation.lastMessage?.content,
    translations: conversation.lastMessageTranslations,
    originalLanguage: conversation.lastMessageOriginalLanguage,
    preferredLanguages,
  });

describe('withPreviewMessage — un AUTRE message périme la carte du Prisme', () => {
  it('rend le texte du message installé, jamais celui que la carte décrivait', () => {
    const incoming = makeMessage({
      id: 'msg-incoming',
      content: 'Are we still on for tomorrow?',
      createdAt: INCOMING_AT,
    });

    const before = makeConversation();
    // Le défaut, posé sur le TEXTE AFFICHÉ : sans le correctif, la ligne rend
    // « Bonsoir » — la traduction du message PRÉCÉDENT — sous l'auteur et
    // l'horodatage du nouveau.
    expect(displayedText({ ...before, lastMessage: incoming }, ['fr'])).toBe('Bonsoir');

    const after = withPreviewMessage({ conversation: before, message: incoming });

    expect(after.lastMessage?.id).toBe('msg-incoming');
    expect(displayedText(after, ['fr'])).toBe('Are we still on for tomorrow?');
  });

  it('périme la carte ENTIÈRE, pas la seule langue du lecteur', () => {
    const after = withPreviewMessage({
      conversation: makeConversation({ lastMessageTranslations: { fr: 'Bonsoir', es: 'Buenas noches' } }),
      message: makeMessage({ id: 'msg-incoming', content: 'Evening', createdAt: INCOMING_AT }),
    });

    expect(after.lastMessageTranslations).toBeUndefined();
    expect(displayedText(after, ['es'])).toBe('Evening');
  });

  it("aligne la langue d'origine sur le message installé", () => {
    // `lastMessageOriginalLanguage` décrit la langue de `lastMessage.content` :
    // le laisser sur celle de l'ancien rouvrirait le mélange d'un cran plus bas
    // — la règle #3 du Prisme fait CONCOURIR la langue d'origine à son rang,
    // donc un lecteur `['de','en']` court-circuiterait sur un `en` qui ne
    // décrit plus rien.
    const after = withPreviewMessage({
      conversation: makeConversation(),
      message: makeMessage({ id: 'msg-incoming', content: 'Bonsoir à tous', originalLanguage: 'fr', createdAt: INCOMING_AT }),
    });

    expect(after.lastMessageOriginalLanguage).toBe('fr');
  });

  it("efface la langue d'origine quand le message installé n'en déclare aucune", () => {
    const after = withPreviewMessage({
      conversation: makeConversation(),
      message: makeMessage({ id: 'msg-incoming', originalLanguage: '', createdAt: INCOMING_AT }),
    });

    expect(after.lastMessageOriginalLanguage).toBeUndefined();
  });

  it('périme la carte quand la ligne ne décrivait encore aucun message', () => {
    const after = withPreviewMessage({
      conversation: makeConversation({ lastMessage: undefined }),
      message: makeMessage({ id: 'msg-incoming', content: 'First one', createdAt: INCOMING_AT }),
    });

    expect(after.lastMessageTranslations).toBeUndefined();
  });
});

describe('withPreviewMessage — le MÊME message garde sa carte', () => {
  /**
   * La contre-épreuve, et c'est elle qui borne le correctif : sans ce no-op,
   * chaque réécriture d'une ligne qui décrit DÉJÀ ce message la dépouillerait de
   * son Prisme. C'est le cas du `conversation:updated` jumeau qui arrive derrière
   * `message:new` avec le même id — le chemin le plus fréquenté du service.
   */
  it('laisse la carte intacte quand le message installé est celui que la ligne décrit', () => {
    const before = makeConversation();
    const after = withPreviewMessage({
      conversation: before,
      message: makeMessage({ sender: { id: 'user-2', displayName: 'Windie', username: 'windie' } as never }),
    });

    expect(after.lastMessageTranslations).toEqual({ fr: 'Bonsoir' });
    expect(displayedText(after, ['fr'])).toBe('Bonsoir');
  });

  it('installe malgré tout la version fraîche de ce message', () => {
    const enriched = makeMessage({ deliveredCount: 3 } as Partial<Message>);
    const after = withPreviewMessage({ conversation: makeConversation(), message: enriched });

    expect(after.lastMessage).toBe(enriched);
  });
});

describe('withPreviewMessage — une ÉDITION périme la carte du même message', () => {
  /**
   * Le seul cas où l'identité ne suffit pas : le serveur remet
   * `Message.translations` à `null` dans la MÊME écriture qu'une édition, et le
   * client ne peut pas le déduire de l'id. C'est l'écrivain qui le sait, et qui
   * le déclare.
   */
  it('rend le texte édité, jamais la traduction du texte d’avant', () => {
    const edited = makeMessage({ content: 'Good evening — correction: 9pm' });

    const kept = withPreviewMessage({ conversation: makeConversation(), message: edited });
    expect(displayedText(kept, ['fr'])).toBe('Bonsoir');

    const after = withPreviewMessage({ conversation: makeConversation(), message: edited, textChanged: true });
    expect(after.lastMessageTranslations).toBeUndefined();
    expect(displayedText(after, ['fr'])).toBe('Good evening — correction: 9pm');
  });
});

describe('withPreviewMessage — ce que la fusion ne touche pas', () => {
  it('ne décide ni du rang de la ligne ni de sa date de mise à jour', () => {
    // `lastMessageAt` / `updatedAt` appartiennent aux appelants : les cinq n'en
    // font pas le même usage (l'édition n'en pose aucun, `link:message:new`
    // dérive le sien d'un payload non typé). Les poser ici les écraserait.
    const after = withPreviewMessage({
      conversation: makeConversation(),
      message: makeMessage({ id: 'msg-incoming', createdAt: INCOMING_AT }),
    });

    expect(after.lastMessageAt).toBe(PREVIOUS_AT);
  });

  it('laisse le reste de la conversation strictement intact', () => {
    const before = makeConversation();
    const after = withPreviewMessage({
      conversation: before,
      message: makeMessage({ id: 'msg-incoming', createdAt: INCOMING_AT }),
    });

    expect(after.id).toBe(before.id);
    expect(after.title).toBe(before.title);
    expect(after.unreadCount).toBe(before.unreadCount);
    expect(before.lastMessageTranslations).toEqual({ fr: 'Bonsoir' });
  });
});

/**
 * Le SIXIÈME écrivain, et pourquoi un témoin de comportement ne suffit pas ici.
 *
 * `use-conversations-v2.ts` écrit dans le MÊME cache
 * (`queryKeys.conversations.infinite()`) sur le MÊME événement `message:new`,
 * depuis un autre écouteur. Deux écouteurs, aucun ordre garanti — et l'ordre
 * décide du texte affiché : si l'écrivain v2 passe en premier avec un simple
 * `{ ...conv, lastMessage }`, la ligne décrit DÉJÀ le nouveau message quand
 * `useSocketCacheSync` la reprend, qui garde alors — à raison selon sa propre
 * règle d'identité — une carte qui décrit l'ancien.
 *
 * La règle « l'identité décide » n'est donc sûre que si TOUS les écrivains du
 * cache la respectent. C'est une propriété du FICHIER, pas d'une valeur : d'où
 * un témoin de source, qui échoue le jour où un septième écrivain apparaît.
 */
describe('withPreviewMessage — tous les écrivains du cache y passent', () => {
  const v2Source = readFileSync(
    join(__dirname, '..', '..', 'v2', 'use-conversations-v2.ts'),
    'utf8'
  );

  it('use-conversations-v2 route son écriture par le geste commun', () => {
    expect(v2Source).toContain('withPreviewMessage({ conversation: conv, message })');
  });

  it("use-conversations-v2 n'écrit plus `lastMessage` à la main", () => {
    const handWritten = v2Source
      .split('\n')
      .filter((line) => /^\s*lastMessage:\s/.test(line));

    expect(handWritten).toEqual([]);
  });
});

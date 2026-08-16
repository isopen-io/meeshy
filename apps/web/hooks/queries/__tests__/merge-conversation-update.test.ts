/**
 * `conversation:updated` — la ligne de liste et le message qu'elle DÉCRIT.
 *
 * Le défaut fermé ici : le fan-out temps réel de l'aperçu nomme un message
 * (`lastMessageId`), porte son texte (`lastMessagePreview`), son horodatage et
 * sa carte du Prisme — et le cache web n'appliquait que les DEUX derniers. La
 * ligne rend `conversation.lastMessage`, un OBJET, que rien ne réécrivait.
 *
 * Tant que le payload décrit le MÊME message, c'est sans conséquence. Deux
 * chemins nominaux en nomment un AUTRE, et sur les deux le serveur est la SEULE
 * source capable de le dire :
 *
 *   1. le masquage PERSONNEL (« supprimer pour moi », « effacer l'historique ») :
 *      `refreshPersonalConversationPreview` n'émet que ce `conversation:updated`,
 *      borné à son auteur — aucun `message:deleted` ne part, le message reste
 *      vivant pour les autres ;
 *   2. la suppression POUR TOUS d'une conversation dont les messages ne sont pas
 *      en cache : `handleMessageDeleted` balaie le cache messages, n'y trouve
 *      rien, et renonce délibérément (« leaving the (stale) preview is strictly
 *      safer than blanking a non-empty chat »).
 *
 * Ce que la ligne rendait alors — et que rien ne corrigeait, la conversation
 * n'ayant plus aucune raison d'émettre : l'auteur, l'horodatage et la pastille
 * de pièce jointe de l'ancien message, avec, par-dessus, la carte du Prisme du
 * NOUVEAU. Un lecteur servi par une traduction lisait donc le texte du
 * remplaçant sous la signature du message qu'il venait de masquer.
 */

import { mergeConversationUpdate, normalizeConversationPatch } from '../use-socket-cache-sync';
import { resolveLastMessagePreview } from '@meeshy/shared/utils/conversation-helpers';
import type { Conversation, Message } from '@meeshy/shared/types';

const HIDDEN_AT = new Date('2026-06-01T10:00:00.000Z');
const SURVIVOR_AT = new Date('2026-06-01T09:00:00.000Z');

const makeMessage = (overrides: Partial<Message> = {}): Message =>
  ({
    id: 'msg-hidden',
    conversationId: 'conv-1',
    senderId: 'user-2',
    content: 'Hello',
    createdAt: HIDDEN_AT,
    sender: { id: 'user-2', displayName: 'Windie', username: 'windie' },
    attachments: [{ id: 'att-1', mimeType: 'image/jpeg', width: 800, height: 600 }],
    ...overrides,
  }) as unknown as Message;

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'conv-1',
    type: 'group',
    title: 'Équipe produit',
    participants: [],
    unreadCount: 0,
    lastMessageAt: HIDDEN_AT,
    lastMessage: makeMessage(),
    lastMessageTranslations: { fr: 'Bonjour' },
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

describe('mergeConversationUpdate — le message que la ligne décrit', () => {
  describe("quand le payload nomme un AUTRE message", () => {
    // Le payload d'un masquage personnel : le serveur a résolu le dernier
    // message ENCORE VISIBLE pour ce lecteur-là, que le client ne peut pas
    // calculer (il peut être hors de la page chargée, ou masqué lui aussi).
    const replacement = {
      lastMessageId: 'msg-survivor',
      lastMessagePreview: 'Good evening',
      lastMessageAt: SURVIVOR_AT.toISOString(),
      senderId: 'user-3',
      lastMessageTranslations: { fr: 'Bonsoir' },
      lastMessageOriginalLanguage: 'en',
      previewRecalculated: true,
      updatedAt: SURVIVOR_AT.toISOString(),
    };

    it('adopte le remplaçant que le serveur nomme', () => {
      const merged = mergeConversationUpdate(makeConversation(), replacement);

      expect(merged.lastMessage?.id).toBe('msg-survivor');
      expect(merged.lastMessage?.content).toBe('Good evening');
      expect(merged.lastMessage?.createdAt).toEqual(SURVIVOR_AT);
      expect(merged.lastMessage?.senderId).toBe('user-3');
    });

    // LE témoin du défaut. La carte du Prisme du remplaçant entrait DÉJÀ dans
    // le cache — c'est le seul champ du groupe que le normaliseur appliquait —
    // et le résolveur la PRÉFÈRE à l'aperçu brut. La ligne servait donc le
    // texte du remplaçant sous l'horodatage, la signature et la pastille du
    // message masqué : un mélange de deux messages, stable jusqu'au prochain
    // `GET /conversations`.
    it("ne laisse plus la ligne mélanger deux messages", () => {
      const merged = mergeConversationUpdate(makeConversation(), replacement);

      expect(displayedText(merged, ['fr'])).toBe('Bonsoir');
      expect(merged.lastMessage?.id).toBe('msg-survivor');
    });

    // L'identité change ⇒ tout ce que la ligne disait de l'ancien est faux. Ce
    // que le payload ne porte pas est remis à NEUTRE plutôt que conservé : une
    // ligne INCOMPLÈTE (que la prochaine synchro complète) plutôt qu'une ligne
    // FAUSSE (que rien ne corrige).
    it("neutralise ce dont l'événement ne parle pas", () => {
      const merged = mergeConversationUpdate(makeConversation(), replacement);

      expect(merged.lastMessage?.sender).toBeUndefined();
      expect(merged.lastMessage?.attachments ?? []).toHaveLength(0);
    });

    // Sans horodatage lisible, la ligne rendrait « Invalid Date » : mieux vaut
    // la laisser périmée et corrigible qu'affichée cassée.
    it('renonce plutôt que de fabriquer une date', () => {
      const merged = mergeConversationUpdate(makeConversation(), {
        lastMessageId: 'msg-survivor',
        lastMessagePreview: 'Good evening',
      });

      expect(merged.lastMessage?.id).toBe('msg-hidden');
    });
  });

  describe('quand le payload nomme le MÊME message', () => {
    // Une édition. Le message n'a pas changé d'identité : l'auteur et les
    // pièces jointes restent vrais, et les jeter serait le défaut symétrique —
    // sur le chemin le plus fréquenté, celui de l'envoi.
    it("réécrit le texte sans dépouiller la ligne", () => {
      const merged = mergeConversationUpdate(makeConversation(), {
        lastMessageId: 'msg-hidden',
        lastMessagePreview: 'Hello (edited)',
        lastMessageTranslations: null,
        lastMessageOriginalLanguage: 'en',
      });

      expect(merged.lastMessage?.content).toBe('Hello (edited)');
      expect(merged.lastMessage?.sender).toBeDefined();
      expect(merged.lastMessage?.attachments).toHaveLength(1);
      expect(displayedText(merged, ['fr'])).toBe('Hello (edited)');
    });

    // Contre-épreuve de l'envoi : `message:new` a déjà posé l'objet COMPLET
    // (auteur, pièces jointes) dans la room de conversation, et le
    // `conversation:updated` jumeau arrive juste derrière avec le même id.
    // Le traiter comme un changement d'identité effacerait, à CHAQUE message,
    // la signature et la pastille que l'événement précédent venait d'installer.
    it("ne dégrade pas l'objet que `message:new` vient de poser", () => {
      const arrived = makeConversation({
        lastMessage: makeMessage({ id: 'msg-fresh', content: 'Nouveau' }),
      });

      const merged = mergeConversationUpdate(arrived, {
        lastMessageId: 'msg-fresh',
        lastMessagePreview: 'Nouveau',
        lastMessageAt: HIDDEN_AT.toISOString(),
        senderId: 'user-2',
      });

      expect(merged.lastMessage?.sender).toBeDefined();
      expect(merged.lastMessage?.attachments).toHaveLength(1);
    });
  });

  // Les deux cas déjà tenus par le normaliseur, épinglés ici à travers la
  // fusion : c'est elle que le cache appelle désormais.
  it("vide la ligne quand le lecteur n'a plus aucun message visible", () => {
    const merged = mergeConversationUpdate(makeConversation(), {
      lastMessageId: null,
      lastMessagePreview: null,
      lastMessageAt: null,
      lastMessageTranslations: null,
    });

    expect(merged.lastMessage).toBeUndefined();
  });

  it('ne touche pas à la ligne quand l’événement ne parle pas du dernier message', () => {
    const merged = mergeConversationUpdate(makeConversation(), { title: 'Renommé' });

    expect(merged.lastMessage?.id).toBe('msg-hidden');
    expect(merged.title).toBe('Renommé');
  });
});

describe('normalizeConversationPatch — les champs que la conversation ne déclare pas', () => {
  // `lastMessagePreview`, `senderId` et `previewRecalculated` décrivent le
  // MESSAGE, pas la conversation : `Conversation` ne les déclare pas et aucun
  // lecteur ne les interroge. Ils sont consommés par la fusion ci-dessus, qui
  // en fait l'objet `lastMessage` — les recopier en plus n'ajouterait qu'un
  // champ fantôme par ligne, exactement ce qu'on reproche déjà à `lastMessageId`.
  it('ne recopie pas le groupe d’aperçu sur la conversation', () => {
    const patch = normalizeConversationPatch({
      lastMessageId: 'msg-7',
      lastMessagePreview: 'Coucou',
      senderId: 'user-3',
      previewRecalculated: true,
      location: { latitude: 1, longitude: 2 },
    });

    expect('lastMessagePreview' in patch).toBe(false);
    expect('senderId' in patch).toBe(false);
    expect('previewRecalculated' in patch).toBe(false);
    expect('location' in patch).toBe(false);
  });
});

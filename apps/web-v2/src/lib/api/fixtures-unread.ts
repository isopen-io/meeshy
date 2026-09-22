import type { Conversation, Message } from './types';
import { amina, conversationDefaults, message, minutesAgo, viewer, VIEWER_ID } from './fixtures-base';

/**
 * LE CORPUS « SÉPARATEUR DE NON-LUS » (#7202, W3, D-L2/D-L3) — un corpus
 * DÉDIÉ, HORS-LISTE (`OFF_LIST_CONVERSATIONS`, `fixtures.ts`) : une
 * conversation NEUVE, hors liste, ne déplace ni les gates de
 * virtualisation/états ni `CONVERSATIONS.length`
 * (`fixtures-pagination.test.ts`, qui le compte en dur).
 *
 * `nl-2` (le lecteur) EST la frontière : `nl-3` et `nl-4` (tous deux Amina)
 * suivent, ni l'un ni l'autre du lecteur — le séparateur s'ouvre donc devant
 * `nl-3` en annonçant deux non-lus.
 *
 * `c-deploiement` (`fixtures.ts`) est un corpus DIFFÉRENT et NE MODÉLISE
 * PLUS un scénario de lecture depuis #7351 (V3) : il porte `unreadCount: 0`
 * et aucun cursor, précisément pour rester au repos sur les gates de
 * virtualisation/états qui l'ouvrent pour d'autres raisons. Le scénario
 * « profil neuf » (aucun cursor, `unreadCount` positif servi quand même,
 * `GET /conversations/:id` en accès direct) est couvert par les témoins
 * unitaires de `lib/view/unread-boundary.test.ts`, qui construisent leur
 * propre conversation minimale — pas besoin d'un second corpus ici.
 */

export const UNREAD_CONVERSATION_ID = 'c-non-lus';

const unreadMessage = (partial: Parameters<typeof message>[0]): Message =>
  message({ ...partial, conversationId: UNREAD_CONVERSATION_ID });

const nl1: Message = unreadMessage({
  id: 'nl-1',
  senderId: 'u-amina',
  sender: amina,
  content: "On pousse le correctif du budget ce soir ?",
  originalLanguage: 'fr',
  translations: [],
  createdAt: minutesAgo(40),
});

const nl2: Message = unreadMessage({
  id: 'nl-2',
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'Oui, je relis la spec avant.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: minutesAgo(35),
});

const nl3: Message = unreadMessage({
  id: 'nl-3',
  senderId: 'u-amina',
  sender: amina,
  content: "Parfait, je te laisse la main sur la revue.",
  originalLanguage: 'fr',
  translations: [],
  createdAt: minutesAgo(10),
});

const nl4: Message = unreadMessage({
  id: 'nl-4',
  senderId: 'u-amina',
  sender: amina,
  content: 'Dispo dans dix minutes si besoin.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: minutesAgo(8),
});

export const UNREAD_MESSAGES: readonly Message[] = [nl1, nl2, nl3, nl4];

export const UNREAD_CONVERSATION: Conversation = {
  ...conversationDefaults,
  id: UNREAD_CONVERSATION_ID,
  title: 'Séparateur de non-lus',
  type: 'direct',
  memberCount: 2,
  participants: [viewer, amina],
  unreadCount: 2,
  lastReadMessageId: nl2.id,
  lastReadAt: nl2.createdAt,
  lastReadMessageCreatedAt: nl2.createdAt,
  lastMessage: nl4,
  lastMessageAt: nl4.createdAt,
  lastMessageOriginalLanguage: 'fr',
};

import type { Conversation, Message } from './types';
import { amina, conversationDefaults, message, minutesAgo, viewer, VIEWER_ID } from './fixtures-base';

/**
 * LE CORPUS « SÉPARATEUR DE NON-LUS » (#7202, W3, D-L2/D-L3) — un corpus
 * DÉDIÉ, HORS-LISTE (`OFF_LIST_CONVERSATIONS`, `fixtures.ts`), motif exact
 * `fixtures-live.ts` : `c-deploiement` porte déjà un `unreadCount: 2` mais
 * AUCUNE frontière de lecture (`lastReadMessageId`/`lastReadMessageCreatedAt`)
 * — lui en poser une romprait `check-thread-virtualization.mjs` §2
 * (« le fil s'ouvre EN BAS », mesuré littéralement sur CETTE conversation) et
 * les trois ouvertures de `check-thread-states.mjs`. Une conversation NEUVE,
 * hors liste, ne déplace ni ces gates ni `CONVERSATIONS.length`
 * (`fixtures-pagination.test.ts`, qui le compte en dur).
 *
 * `nl-2` (le lecteur) EST la frontière : `nl-3` et `nl-4` (tous deux Amina)
 * suivent, ni l'un ni l'autre du lecteur — le séparateur s'ouvre donc devant
 * `nl-3` en annonçant deux non-lus.
 *
 * `c-deploiement` (`fixtures.ts`) est l'AUTRE chemin du séparateur depuis
 * #7351 (V3) : 2 non-lus et AUCUN curseur — l'appareil qui n'a jamais ouvert
 * la conversation. Sa frontière vient du compte servi (`unreadCountHint`,
 * les 2 DERNIERS messages d'autrui), celle de `c-non-lus` de son curseur.
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

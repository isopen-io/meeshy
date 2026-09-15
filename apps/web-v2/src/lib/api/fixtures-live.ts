import type { Conversation, Message } from './types';
import { conversationDefaults, fatou, kwame, message, minutesAgo, viewer, VIEWER_ID } from './fixtures-base';

/**
 * LE CORPUS « RECETTE TEMPS RÉEL » (#6171, § 5 étape 6 de la spécification) —
 * un corpus DÉDIÉ, motif exact `fixtures-states.ts`, socle commun importé
 * (`fixtures-base.ts`) : `c-deploiement` est mesuré par `check-lens`,
 * `check-reading-mode` et `check-list-actions` — y changer un texte ou un
 * rang à T+4,5 s rendrait ces gates dépendants de l'instant où ils lisent.
 * `c-live` n'est lu que par le gate du roster/Prisme temps réel
 * (`check-realtime-events.mjs`).
 */

export const LIVE_CONVERSATION_ID = 'c-live';

const liveMessage = (partial: Parameters<typeof message>[0]): Message =>
  message({ ...partial, conversationId: LIVE_CONVERSATION_ID });

/** `live-1` — Kwame, ESPAGNOL, SANS traduction au chargement : la
 * chronologie (`fixtures-realtime.ts`) les greffe à T+2 s (en) puis T+3,5 s
 * (fr) — c'est le message que `message:translation` fait basculer. */
export const LIVE_1: Message = liveMessage({
  id: 'live-1',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Hola, ¿la revisión sigue el jueves?',
  originalLanguage: 'es',
  translations: [],
  createdAt: minutesAgo(40),
});

/** `live-2` — le lecteur, FRANÇAIS, le DERNIER message avant l'événement :
 * c'est lui que la rangée de la Lentille décrit avant `conversation:updated`
 * (adopte `live-1` à T+4,5 s, motif suppression-pour-tous). */
const live2: Message = liveMessage({
  id: 'live-2',
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'Oui, jeudi 14h.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: minutesAgo(30),
});

export const LIVE_MESSAGES: readonly Message[] = [LIVE_1, live2];

export const LIVE_CONVERSATION: Conversation = {
  ...conversationDefaults,
  id: LIVE_CONVERSATION_ID,
  title: 'Recette temps réel',
  type: 'group',
  memberCount: 3,
  participants: [viewer, kwame, fatou],
  unreadCount: 0,
  lastMessage: live2,
  lastMessageAt: live2.createdAt,
  lastMessageOriginalLanguage: 'fr',
};

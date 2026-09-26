import { amina, conversationDefaults, kwame, message, threadMoment, translation, VIEWER_ID, viewer } from './fixtures-base';
import type { Conversation, Message } from './types';

/**
 * LE CORPUS DU MESSAGE LONG (#8147) — HORS LISTE (`fixtures.ts` §
 * `OFF_LIST_CONVERSATIONS`) : `check-long-message.mjs` l'ouvre par son
 * ADRESSE, aucune liste ne le compte.
 *
 * Deux messages longs encadrés de messages courts — de quoi mesurer
 * l'extrait, le dépliage, « un seul déplié à la fois » et l'atténuation des
 * voisins. Le second est écrit en ANGLAIS et TRADUIT en français : le lecteur
 * de fixture lit le français, l'extrait doit donc porter sur la traduction
 * SERVIE, jamais sur l'original.
 */
export const LONG_MESSAGE_CONVERSATION_ID = 'c-message-long';

const longMessage = (partial: Parameters<typeof message>[0]): Message =>
  message({ ...partial, conversationId: LONG_MESSAGE_CONVERSATION_ID });

const RECIT = [
  'Bonne nouvelle pour le déploiement de vendredi : la passerelle tient la charge depuis trois jours, et les files de traduction se vident en moins de deux secondes au pic.',
  'Il reste trois points à régler avant de basculer tout le monde. Le premier concerne les notifications des appareils Android restés sur une ancienne version : elles arrivent, mais sans la traduction, parce que la coque lisait un champ que nous avons renommé.',
  'Le deuxième est plus délicat. Quand un membre quitte un groupe pendant qu’un vocal est en cours de transcription, la transcription arrive quand même chez lui ; il faut que la passerelle vérifie l’appartenance au moment de pousser, pas au moment d’accepter le travail.',
  'Le troisième est une affaire de patience : la migration des pièces jointes anciennes prend environ six heures, et je propose de la lancer jeudi soir pour que tout soit prêt le matin.',
  'Si personne n’y voit d’objection, je prépare la note de version demain, je la partage ici avant midi, et on fait un dernier point à seize heures pour décider.',
  'Merci à toutes et à tous pour le travail de ces dernières semaines — c’est la première fois que nous arrivons à une bascule sans aucune alerte ouverte.',
].join('\n\n');

const STORY_EN = [
  'Quick recap of the design review, since not everyone could join.',
  'We agreed that long messages should never open a separate sheet anymore. Tapping “Read more” unfolds the message right where it is, and the unfolded message is lifted onto a glass block while its neighbours fade back, so the eye knows exactly where to look.',
  'The excerpt shows only a quarter of the text and always stops at the end of a word, which keeps the thread calm even when someone pastes a whole article.',
  'Script becomes the default reading mode for everyone who never picked one; people who chose Focal keep it.',
  'The same geometry, radius and timing ship on iOS, the web and Android, from one shared set of numbers.',
].join('\n\n');

const RECAP_FR = [
  'Petit récapitulatif de la revue de design, puisque tout le monde n’a pas pu venir.',
  'Nous avons convenu qu’un message long n’ouvrirait plus jamais de feuille séparée. Toucher « Lire la suite » déplie le message là où il est, et le message déplié se pose sur un bloc de verre pendant que ses voisins s’estompent, pour que l’œil sache exactement où regarder.',
  'L’extrait ne montre qu’un quart du texte et s’arrête toujours à la fin d’un mot, ce qui garde le fil calme même quand quelqu’un colle un article entier.',
  'Script devient le mode de lecture par défaut pour tous ceux qui n’en ont jamais choisi ; ceux qui ont choisi Focal le gardent.',
  'La même géométrie, le même rayon et le même tempo partent sur iOS, le web et Android, depuis un seul jeu de cotes partagé.',
].join('\n\n');

const lmOuverture = longMessage({
  id: 'lm-1',
  senderId: 'u-amina',
  sender: amina,
  content: 'Je vous fais le point sur vendredi.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: threadMoment(40),
});

const lmRecit = longMessage({
  id: 'lm-2',
  senderId: 'u-amina',
  sender: amina,
  content: RECIT,
  originalLanguage: 'fr',
  translations: [],
  createdAt: threadMoment(38),
});

const lmReponse = longMessage({
  id: 'lm-3',
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'Parfait, aucune objection de mon côté.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: threadMoment(30),
});

const lmTraduit = longMessage({
  id: 'lm-4',
  senderId: 'u-kwame',
  sender: kwame,
  content: STORY_EN,
  originalLanguage: 'en',
  translations: [translation('lm-4', 'fr', RECAP_FR)],
  createdAt: threadMoment(20),
});

const lmFin = longMessage({
  id: 'lm-5',
  senderId: 'u-amina',
  sender: amina,
  content: 'Merci Kwame, c’est très clair.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: threadMoment(10),
});

export const LONG_MESSAGE_MESSAGES: readonly Message[] = [lmOuverture, lmRecit, lmReponse, lmTraduit, lmFin];

export const LONG_MESSAGE_CONVERSATION: Conversation = {
  ...conversationDefaults,
  id: LONG_MESSAGE_CONVERSATION_ID,
  title: 'Message long',
  type: 'group',
  memberCount: 3,
  participants: [viewer, amina, kwame],
  unreadCount: 0,
  lastMessage: lmFin,
  lastMessageAt: lmFin.createdAt,
  lastMessageOriginalLanguage: 'fr',
};

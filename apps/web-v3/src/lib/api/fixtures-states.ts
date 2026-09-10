import type { Conversation, Message } from './types';
import { VIEWER_ID, amina, conversationDefaults, kwame, message, minutesAgo, translation, viewer } from './fixtures-base';

/**
 * LE SALON « ÉTATS » (#5936) — un message par état reconnaissable dans le fil
 * (épinglé, transféré, modifié, système, emoji seul), au patron de
 * `fixtures-media.ts`/`fixtures-catchup.ts` (#5695 §2) : un fichier PAR
 * corpus, tous important le même socle (`fixtures-base.ts`).
 *
 * Sticker, lieu et citation de story n'ont PAS d'entrée ici : `Message`
 * (`packages/shared/types/conversation.ts`) ne déclare pas les champs que la
 * passerelle hisse sur le fil pour ces trois-là (`message-badges.ts`,
 * doc-comment de `bodyKindOf`) — les fabriquer sur une fixture typée
 * `Message` reviendrait à inventer une capacité que le TYPE ne porte pas,
 * ce que `CLAUDE.md` § SDK Purity interdit. Issues compagnons à ouvrir.
 */

export const STATES_CONVERSATION_ID = 'c-states';

const stateMessage = (partial: Parameters<typeof message>[0]): Message =>
  message({ ...partial, conversationId: STATES_CONVERSATION_ID });

/** ÉPINGLÉ — `pinnedAt` posé, rien d'autre. */
export const PINNED_WITNESS_ID = 'states-pinned';
const pinnedMessage = stateMessage({
  id: PINNED_WITNESS_ID,
  senderId: 'u-amina',
  sender: amina,
  content: 'Le déploiement est prévu vendredi.',
  originalLanguage: 'fr',
  translations: [],
  pinnedAt: minutesAgo(20),
  pinnedBy: VIEWER_ID,
  createdAt: minutesAgo(20),
});

/**
 * TRANSFÉRÉ, TITRE SERVI — le nom du groupe source, jamais celui d'une
 * personne (critère de fin #7 : « jamais de nom si `title` absent »).
 */
export const FORWARDED_WITNESS_ID = 'states-forwarded';
const forwardedMessage = stateMessage({
  id: FORWARDED_WITNESS_ID,
  senderId: 'u-kwame',
  sender: kwame,
  content: 'La démo passe à 15 h.',
  originalLanguage: 'fr',
  translations: [],
  forwardedFromId: 'm-elsewhere',
  forwardedFromConversationId: 'c-annonces',
  forwardedFromConversation: { id: 'c-annonces', title: 'Annonces produit', type: 'public' },
  createdAt: minutesAgo(18),
});

/**
 * TRANSFÉRÉ, TITRE ABSENT — la charge n'a pas encore l'objet enrichi (repli
 * socket, revue #5566) : « Transféré » seul, jamais un identifiant.
 */
export const FORWARDED_ANONYMOUS_WITNESS_ID = 'states-forwarded-anonymous';
const forwardedAnonymousMessage = stateMessage({
  id: FORWARDED_ANONYMOUS_WITNESS_ID,
  senderId: 'u-amina',
  sender: amina,
  content: 'Un message venu d’ailleurs.',
  originalLanguage: 'fr',
  translations: [],
  forwardedFromConversationId: 'c-inconnue',
  createdAt: minutesAgo(16),
});

/** MODIFIÉ — `isEdited`, sur un message à SOI (l'accusé ET « modifié » se lisent côte à côte). */
export const EDITED_WITNESS_ID = 'states-edited';
const editedMessage = stateMessage({
  id: EDITED_WITNESS_ID,
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'On se retrouve à 15h30 (corrigé).',
  originalLanguage: 'fr',
  translations: [],
  isEdited: true,
  editedAt: minutesAgo(10),
  createdAt: minutesAgo(14),
});

/**
 * LES QUATRE BADGES ENSEMBLE — le témoin de l'exemple du critère de fin :
 * pinnedAt + forwardedFromConversation.title + isEdited ⇒ [épinglé,
 * « Transféré depuis Salon », modifié], dans cet ordre.
 */
export const ALL_BADGES_WITNESS_ID = 'states-all-badges';
const allBadgesMessage = stateMessage({
  id: ALL_BADGES_WITNESS_ID,
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Le lien du salon a changé.',
  originalLanguage: 'fr',
  translations: [],
  pinnedAt: minutesAgo(8),
  pinnedBy: VIEWER_ID,
  forwardedFromId: 'm-salon-1',
  forwardedFromConversationId: 'c-salon-source',
  forwardedFromConversation: { id: 'c-salon-source', title: 'Salon' },
  isEdited: true,
  editedAt: minutesAgo(9),
  createdAt: minutesAgo(12),
});

/**
 * SYSTÈME — `messageSource: 'system'`, sans avatar ni méta d'auteur. Le
 * texte SERVI est le repli français que la passerelle écrit dans `content`
 * (`BubbleSystemNoticeView.swift:96-97`, « le Prisme sert chaque lecteur dans
 * sa langue, `content` n'est qu'un repli ») — une traduction anglaise est
 * fournie pour que le témoin du Prisme sur cette rangée soit falsifiable.
 */
export const SYSTEM_WITNESS_ID = 'states-system';
const systemMessage = stateMessage({
  id: SYSTEM_WITNESS_ID,
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Kwame Mensah a rejoint la conversation.',
  originalLanguage: 'fr',
  messageType: 'system',
  messageSource: 'system',
  translations: [translation('states-system', 'en', 'Kwame Mensah joined the conversation.')],
  createdAt: minutesAgo(6),
});

/** EMOJI SEUL — texte ORIGINAL déjà emoji. */
export const EMOJI_ONLY_WITNESS_ID = 'states-emoji';
const emojiOnlyMessage = stateMessage({
  id: EMOJI_ONLY_WITNESS_ID,
  senderId: 'u-amina',
  sender: amina,
  content: '🎉🎊🥳',
  originalLanguage: 'fr',
  translations: [],
  createdAt: minutesAgo(4),
});

/**
 * EMOJI SEUL PAR TRADUCTION — le texte ORIGINAL est un mot, sa traduction
 * SERVIE est un emoji seul : `bodyKindOf` juge le texte SERVI par le Prisme,
 * jamais `message.content` brut (`message-badges.ts`, doc-comment de
 * `emojiOnly`) — sans ce témoin, un résolveur qui lirait `message.content`
 * au lieu de `rendered.text` resterait vert.
 */
export const EMOJI_ONLY_TRANSLATED_WITNESS_ID = 'states-emoji-translated';
const emojiOnlyTranslatedMessage = stateMessage({
  id: EMOJI_ONLY_TRANSLATED_WITNESS_ID,
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Congrats!',
  originalLanguage: 'en',
  translations: [translation(EMOJI_ONLY_TRANSLATED_WITNESS_ID, 'fr', '🎉')],
  createdAt: minutesAgo(2),
});

export const STATES_MESSAGES: readonly Message[] = [
  pinnedMessage,
  forwardedMessage,
  forwardedAnonymousMessage,
  editedMessage,
  allBadgesMessage,
  systemMessage,
  emojiOnlyMessage,
  emojiOnlyTranslatedMessage,
];

export const STATES_CONVERSATION: Conversation = {
  ...conversationDefaults,
  id: STATES_CONVERSATION_ID,
  title: 'États',
  type: 'group',
  memberCount: 3,
  participants: [viewer, amina, kwame],
  unreadCount: 0,
  lastMessage: emojiOnlyTranslatedMessage,
  lastMessageAt: emojiOnlyTranslatedMessage.createdAt,
  lastMessageOriginalLanguage: 'en',
};

import type { Attachment, Conversation, Message } from './types';
import {
  VIEWER_ID,
  amina,
  attachmentDefaults,
  conversationDefaults,
  dayAt,
  fatou,
  kwame,
  message,
  viewer,
} from './fixtures-base';

/**
 * LE CORPUS « RATTRAPAGE » (#5695, étape 2) — le SEUL fil du jeu qui ATTEINT
 * le Résumé Vivant (`summary`) : `unreadCount: 26 > ORCHESTRATOR_UNREAD_CAP`
 * (`packages/shared/utils/reading-modes.ts:36`), quatre membres (< 5, la
 * Rivière reste hors d'atteinte — ce n'est pas son corpus), TROIS jours
 * calendaires distincts (J-2, J-1, aujourd'hui) en QUATRE blocs — le matin et
 * le soir de J-2 sont séparés par plus de six heures, pas par un minuit —,
 * mentions, questions, une réponse DIRECTE au lecteur, et un média : les cinq
 * preuves que le digest doit savoir compter.
 *
 * `c-salon-riviere` garde `unreadCount: 3` (`fixtures.ts`) : ce lot choisit
 * un corpus DISTINCT parce que `check-reading-mode.mjs` §10 a besoin d'un
 * fil qui s'ouvre en FOCAL — le faire monter à 26 y électerait le Résumé et
 * casserait cette mesure pour rien.
 *
 * DATES — construites depuis le CALENDRIER LOCAL du jour de l'exécution
 * (`dayAt`), jamais `minutesAgo` composé : un décalage en minutes traverse
 * un minuit local différemment selon l'heure à laquelle le témoin tourne
 * (« jamais à moins de 3 h d'un minuit local » — ce risque est éliminé ici
 * en posant directement la date-calendrier et l'heure visées, plutôt qu'en
 * espérant qu'un delta de minutes y retombe). Les heures choisies (8h-21h)
 * restent toutes à plus de 3 h d'un minuit local.
 */

const CATCHUP_CONVERSATION_ID = 'c-rattrapage';
export { CATCHUP_CONVERSATION_ID };

const catchupMessage = (
  partial: Parameters<typeof message>[0],
): Message => message({ ...partial, conversationId: CATCHUP_CONVERSATION_ID });

const imageAttachment = (messageId: string, createdAt: Date): Attachment => ({
  ...attachmentDefaults,
  id: `${messageId}-a1`,
  messageId,
  fileName: 'maquette.png',
  originalName: 'maquette-ecran.png',
  mimeType: 'image/png',
  fileSize: 212_480,
  fileUrl: '',
  alt: 'Capture de la maquette du bouton de validation',
  width: 1080,
  height: 720,
  uploadedBy: fatou.userId ?? 'u-fatou',
  createdAt: createdAt.toISOString(),
});

// ===== J-2, matin — le lecteur ouvre l'atelier, puis ne reparle plus =====
const m1 = catchupMessage({
  id: 'catchup-1',
  senderId: VIEWER_ID,
  sender: viewer,
  content: "Je lance le fil pour la revue de l'atelier produit.",
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 8, 0),
});
const m2 = catchupMessage({
  id: 'catchup-2',
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'Objectif : valider la maquette et le nom du bouton avant vendredi.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 8, 5),
});
const m3 = catchupMessage({
  id: 'catchup-3',
  senderId: VIEWER_ID,
  sender: viewer,
  content: "Je remets le lien de la maquette en tête de fil.",
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 8, 10),
});
/** LE MESSAGE DU LECTEUR CIBLÉ par la réponse directe de Kwame (`catchup-17`). */
const m4 = catchupMessage({
  id: 'catchup-4',
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'Kwame, tu peux relire le flux de connexion en particulier ?',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 8, 15),
});
export const CATCHUP_VIEWER_MESSAGE_ID = m4.id;

const m5 = catchupMessage({
  id: 'catchup-5',
  senderId: 'u-amina',
  sender: amina,
  content: "Bien reçu, je regarde la maquette ce matin.",
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 8, 20),
});
const m6 = catchupMessage({
  id: 'catchup-6',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Je prends le flux de connexion.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 8, 25),
});
const m7 = catchupMessage({
  id: 'catchup-7',
  senderId: 'u-amina',
  sender: amina,
  content: 'On se retrouve en fin de journée pour faire le point.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 8, 30),
});
const m8 = catchupMessage({
  id: 'catchup-8',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Ça marche.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 8, 35),
});

// ===== J-2, soir — même jour calendaire, plus de 6 h après le matin =====
const m9 = catchupMessage({
  id: 'catchup-9',
  senderId: 'u-amina',
  sender: amina,
  content: "J'ai fini de regarder la maquette, ça se tient bien.",
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 20, 0),
});
const m10 = catchupMessage({
  id: 'catchup-10',
  senderId: 'u-fatou',
  sender: fatou,
  content: "Je rejoins l'atelier, je peux aider sur les visuels.",
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 20, 5),
});
const m11 = catchupMessage({
  id: 'catchup-11',
  senderId: 'u-amina',
  sender: amina,
  content: 'Parfait, je te passe le fichier demain.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 20, 10),
});
const m12 = catchupMessage({
  id: 'catchup-12',
  senderId: 'u-fatou',
  sender: fatou,
  content: "Ça marche, je m'organise pour ça.",
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 20, 15),
});
const m13 = catchupMessage({
  id: 'catchup-13',
  senderId: 'u-amina',
  sender: amina,
  content: 'Bonne soirée à tous.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 20, 20),
});
const m14 = catchupMessage({
  id: 'catchup-14',
  senderId: 'u-fatou',
  sender: fatou,
  content: 'Bonne soirée !',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(2, 20, 25),
});

// ===== J-1 — la mention/question d'Amina, la réponse directe de Kwame =====
const m15 = catchupMessage({
  id: 'catchup-15',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Voici la première version du flux de connexion.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(1, 10, 0),
});
/** MENTION + QUESTION d'Amina — le premier signal de la Rampe (score 5+2·2). */
const m16 = catchupMessage({
  id: 'catchup-16',
  senderId: 'u-amina',
  sender: amina,
  content: '@vous, tu valides la maquette ?',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(1, 10, 5),
});
export const CATCHUP_MENTION_WITNESS_ID = m16.id;
/** RÉPONSE DIRECTE de Kwame à `catchup-4` (un message du LECTEUR) — structurelle, sans condition de contenu. */
const m17 = catchupMessage({
  id: 'catchup-17',
  senderId: 'u-kwame',
  sender: kwame,
  replyToId: CATCHUP_VIEWER_MESSAGE_ID,
  content: 'Je reprends ta remarque sur le flux de connexion, ça tient la route.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(1, 10, 10),
});
export const CATCHUP_DIRECT_REPLY_WITNESS_ID = m17.id;
const m18 = catchupMessage({
  id: 'catchup-18',
  senderId: 'u-amina',
  sender: amina,
  content: "Merci Kwame, j'ajoute ça au compte-rendu.",
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(1, 10, 15),
});
const m19 = catchupMessage({
  id: 'catchup-19',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Je pousse le correctif demain matin.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(1, 10, 20),
});
const m20 = catchupMessage({
  id: 'catchup-20',
  senderId: 'u-amina',
  sender: amina,
  content: 'Top, on avance bien.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(1, 10, 25),
});
const m21 = catchupMessage({
  id: 'catchup-21',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'On garde ce rythme.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(1, 10, 30),
});
const m22 = catchupMessage({
  id: 'catchup-22',
  senderId: 'u-amina',
  sender: amina,
  content: 'À demain.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(1, 10, 35),
});

// ===== Aujourd'hui — le média de Fatou, les deux dernières questions =====
const m23CreatedAt = dayAt(0, 9, 0);
const m23 = catchupMessage({
  id: 'catchup-23',
  senderId: 'u-fatou',
  sender: fatou,
  content: '',
  originalLanguage: 'fr',
  messageType: 'image',
  translations: [],
  createdAt: m23CreatedAt,
  attachments: [imageAttachment('catchup-23', m23CreatedAt)],
});
export const CATCHUP_MEDIA_WITNESS_ID = m23.id;
/**
 * La QUESTION de Kwame (score 3+2, § témoin de rampe) — SANS mention : une
 * seconde mention sur ce message ferait dépasser le score d'Amina et
 * romprait l'ordre attendu de la rampe (`u-amina, u-kwame, u-fatou`), voir
 * `m27` pour la seconde mention réelle du corpus.
 */
const m24 = catchupMessage({
  id: 'catchup-24',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Le déploiement est prêt ?',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 9, 5),
});
const m25 = catchupMessage({
  id: 'catchup-25',
  senderId: 'u-amina',
  sender: amina,
  content: "On avance sur le nom du bouton ?",
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 9, 10),
});
const m26 = catchupMessage({
  id: 'catchup-26',
  senderId: 'u-fatou',
  sender: fatou,
  content: 'Tu valides le nom du bouton ?',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 9, 15),
});
/** SECONDE MENTION du corpus — Amina de nouveau : le score de rang 1 n'a qu'à grandir, jamais changer d'ordre. */
const m27 = catchupMessage({
  id: 'catchup-27',
  senderId: 'u-amina',
  sender: amina,
  content: '@vous, je propose « Confirmer » plutôt que « Valider ».',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 9, 20),
});
const m28 = catchupMessage({
  id: 'catchup-28',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Ça me va.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 9, 25),
});
const m29 = catchupMessage({
  id: 'catchup-29',
  senderId: 'u-fatou',
  sender: fatou,
  content: "Je mets à jour la maquette avec ce nom.",
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 9, 30),
});
const m30 = catchupMessage({
  id: 'catchup-30',
  senderId: 'u-amina',
  sender: amina,
  content: 'Merci Fatou.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 9, 35),
});

/**
 * TRENTE MESSAGES, dans l'ordre chronologique — une partition EXACTE en
 * quatre blocs (matin J-2 / soir J-2 / J-1 / aujourd'hui), chacun séparé du
 * suivant par plus de six heures OU un franchissement de jour : c'est ce qui
 * fait segmenter `EpisodeSegmenter` en (au moins) quatre épisodes, jamais un
 * seul bloc de trente.
 */
export const CATCHUP_MESSAGES: readonly Message[] = [
  m1, m2, m3, m4, m5, m6, m7, m8,
  m9, m10, m11, m12, m13, m14,
  m15, m16, m17, m18, m19, m20, m21, m22,
  m23, m24, m25, m26, m27, m28, m29, m30,
];

const catchupLastMessage = CATCHUP_MESSAGES[CATCHUP_MESSAGES.length - 1] as Message;

/**
 * La fenêtre chargée ne couvre PAS tout le non-lu — c'est ce qui rend
 * « Sur les N derniers messages » atteignable sans mentir (§9 question 4) :
 * la forme exacte que servira `cursorPagination.hasMore`
 * (`services/gateway/src/routes/conversations/messages-list.ts:764-771`),
 * jamais un booléen posé à la main dans le composant.
 */
export const CATCHUP_HAS_OLDER_MESSAGES = true;

export const CATCHUP_CONVERSATION: Conversation = {
  ...conversationDefaults,
  id: CATCHUP_CONVERSATION_ID,
  title: 'Atelier produit',
  type: 'group',
  memberCount: 4,
  participants: [viewer, amina, kwame, fatou],
  /**
   * `26 > ORCHESTRATOR_UNREAD_CAP` (`packages/shared/utils/reading-modes.ts:36`) —
   * c'est CE compte, et rien d'autre, qui fait élire `summary` par la loi.
   */
  unreadCount: 26,
  lastMessage: catchupLastMessage,
  lastMessageAt: catchupLastMessage.createdAt,
  lastMessageOriginalLanguage: 'fr',
};

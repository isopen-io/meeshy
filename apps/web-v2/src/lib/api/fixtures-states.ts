import type { Attachment, Conversation, Message } from './types';
import { MEDIA_IMAGE_DATA_URI } from './fixtures-media';
import { amina, attachmentDefaults, conversationDefaults, dayAt, kwame, message, translation, viewer, VIEWER_ID } from './fixtures-base';

/**
 * LE CORPUS « SALLE DES ÉTATS » (#5936, § 5 étape 6 de la spécification) —
 * un message PAR ÉTAT du fil : épinglé, transféré, modifié, système (appel,
 * avis d'arrivée, notice), emoji seul (1/2/3 graphèmes, un témoin de RANG),
 * sticker (glyphe emoji+pièce jointe, repli sans pièce jointe, PNG sans
 * emoji — revue-correction #5936, les trois branches de `RenderSource
 * .resolve`), lieu, story citée (vivante et expirée). `memberCount: 3` et
 * `unreadCount: 0` restent SOUS les seuils
 * Rivière/Résumé — ce corpus ne les concerne pas.
 *
 * Patron `fixtures-media.ts:26-29` (`mediaMessage`) : un fichier PAR corpus,
 * tous deux important le socle commun (`fixtures-base.ts`).
 */

export const STATES_CONVERSATION_ID = 'c-states';

const statesMessage = (partial: Parameters<typeof message>[0]): Message =>
  message({ ...partial, conversationId: STATES_CONVERSATION_ID });

const stickerAttachment = (id: string, createdAt: Date): Attachment => ({
  ...attachmentDefaults,
  id: `${id}-a1`,
  messageId: id,
  fileName: 'sticker.png',
  originalName: 'sticker-feu.png',
  mimeType: 'image/png',
  fileSize: 96,
  fileUrl: MEDIA_IMAGE_DATA_URI,
  width: 1,
  height: 1,
  alt: 'Sticker 🔥',
  uploadedBy: 'u-kwame',
  createdAt: createdAt.toISOString(),
});

// ===== st-intro — un message ordinaire, la tête du fil =====
const stIntroCreatedAt = dayAt(0, 9, 0);
const stIntro = statesMessage({
  id: 'st-intro',
  senderId: 'u-amina',
  sender: amina,
  content: 'Bienvenue dans la salle des états.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: stIntroCreatedAt,
});

// ===== st-badges — épinglé + transféré (groupe PUBLIC) + modifié =====
const stBadgesCreatedAt = dayAt(0, 9, 1);
const stBadges = statesMessage({
  id: 'st-badges',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Le déploiement est prêt pour la revue.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: stBadgesCreatedAt,
  pinnedAt: dayAt(0, 9, 1),
  pinnedBy: 'u-amina',
  forwardedFromId: 'm-far',
  forwardedFromConversationId: 'c-salon',
  forwardedFromConversation: { id: 'c-salon', title: 'Salon', identifier: 'salon', type: 'public', avatar: null },
  isEdited: true,
  editedAt: dayAt(0, 9, 2),
});

// ===== st-fwd-group — transféré depuis un GROUPE (sous le seuil) ⇒ anonyme =====
const stFwdGroupCreatedAt = dayAt(0, 9, 3);
const stFwdGroup = statesMessage({
  id: 'st-fwd-group',
  senderId: 'u-amina',
  sender: amina,
  content: 'Message transféré depuis un groupe privé.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: stFwdGroupCreatedAt,
  forwardedFromId: 'm-far-2',
  forwardedFromConversationId: 'c-prive',
  forwardedFromConversation: { id: 'c-prive', title: 'Privé', identifier: null, type: 'group', avatar: null },
});

// ===== st-edited — modifié, À SOI (couleur meta-mine) =====
const stEditedCreatedAt = dayAt(0, 9, 4);
const stEdited = statesMessage({
  id: 'st-edited',
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'Je corrige juste une coquille.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: stEditedCreatedAt,
  isEdited: true,
  editedAt: dayAt(0, 9, 5),
});

// ===== st-call — résumé d'appel (système) =====
const stCallCreatedAt = dayAt(0, 9, 6);
const stCall = statesMessage({
  id: 'st-call',
  senderId: 'u-kwame',
  content: 'Appel vidéo · 04:32',
  originalLanguage: 'fr',
  messageType: 'system',
  messageSource: 'system',
  translations: [],
  createdAt: stCallCreatedAt,
  metadata: {
    kind: 'call',
    callId: 'call-1',
    initiatorId: 'u-kwame',
    callType: 'video',
    outcome: 'completed',
    durationSeconds: 272,
    bytesTotal: null,
    bytesEstimated: false,
    networkQuality: null,
  },
});

// ===== st-join — avis d'arrivée (système) =====
const stJoinCreatedAt = dayAt(0, 9, 7);
const stJoin = statesMessage({
  id: 'st-join',
  senderId: 'u-bruno',
  content: 'Bruno Bêta a rejoint la conversation',
  originalLanguage: 'fr',
  messageType: 'system',
  messageSource: 'system',
  translations: [],
  createdAt: stJoinCreatedAt,
  metadata: {
    kind: 'member-joined',
    participantId: 'p-bruno',
    displayName: 'Bruno Bêta',
    isAnonymous: false,
    viaShareLink: false,
  },
});

// ===== st-notice — notice de chiffrement : messageType SEUL, messageSource reste 'user' =====
const stNoticeCreatedAt = dayAt(0, 9, 8);
const stNotice = statesMessage({
  id: 'st-notice',
  senderId: 'u-amina',
  content: 'Le chiffrement de bout en bout est activé',
  originalLanguage: 'fr',
  messageType: 'system',
  messageSource: 'user',
  translations: [],
  createdAt: stNoticeCreatedAt,
});

// ===== st-emoji-1/2/3 — 1, 2 puis 3 graphèmes =====
const stEmoji1CreatedAt = dayAt(0, 9, 9);
const stEmoji1 = statesMessage({
  id: 'st-emoji-1',
  senderId: 'u-kwame',
  sender: kwame,
  content: '👍',
  originalLanguage: 'fr',
  translations: [],
  createdAt: stEmoji1CreatedAt,
});

const stEmoji2CreatedAt = dayAt(0, 9, 10);
const stEmoji2 = statesMessage({
  id: 'st-emoji-2',
  senderId: 'u-amina',
  sender: amina,
  content: '🎉🎉',
  originalLanguage: 'fr',
  translations: [],
  createdAt: stEmoji2CreatedAt,
});

/**
 * LE TÉMOIN DE RANG (T12-iii) — `originalLanguage:'en'` AVEC une traduction
 * `fr` disponible ('feu feu feu') : la RANGÉE TEXTE servirait `fr`, mais un
 * emoji seul reste TOUJOURS l'original (`bodyKindOf`/`FocalRow.swift:612`,
 * jamais `rendered.text`).
 */
const stEmoji3CreatedAt = dayAt(0, 9, 11);
const stEmoji3 = statesMessage({
  id: 'st-emoji-3',
  senderId: 'u-kwame',
  sender: kwame,
  content: '🔥🔥🔥',
  originalLanguage: 'en',
  translations: [translation('st-emoji-3', 'fr', 'feu feu feu')],
  createdAt: stEmoji3CreatedAt,
});

/* ===== st-sticker — sticker AVEC emoji ET pièce jointe PNG (revue-correction
   #5936, défaut majeur 6) — LE TÉMOIN QUI MANQUAIT : un sticker SANS gabarit
   qui porte À LA FOIS un emoji et une pièce jointe doit rendre le GLYPHE
   natif, jamais le PNG (`RenderSource.resolve`, `BubbleSticker.swift:60-70`
   — « le PNG n'est que le repli des clients qui ne dessinent pas »). Le
   corpus portait déjà cette forme ; seul le témoin l'exerçait à l'envers
   (il exigeait une `<img>`). */
const stStickerCreatedAt = dayAt(0, 9, 12);
const stSticker = statesMessage({
  id: 'st-sticker',
  senderId: 'u-kwame',
  sender: kwame,
  content: '🔥',
  originalLanguage: 'fr',
  messageType: 'image',
  translations: [],
  createdAt: stStickerCreatedAt,
  metadata: { sticker: { emoji: '🔥', animation: 'pop' } },
  attachments: [stickerAttachment('st-sticker', stStickerCreatedAt)],
});

// ===== st-sticker-bare — sticker SANS pièce jointe (repli emoji) =====
const stStickerBareCreatedAt = dayAt(0, 9, 13);
const stStickerBare = statesMessage({
  id: 'st-sticker-bare',
  senderId: 'u-amina',
  sender: amina,
  content: '🎉',
  originalLanguage: 'fr',
  translations: [],
  createdAt: stStickerBareCreatedAt,
  metadata: { sticker: { emoji: '🎉' } },
});

/* LE CHEMIN « PNG SEUL » (gabarit inconnu, aucun emoji) n'est PAS un
   nouveau témoin du corpus VIRTUALISÉ (revue-correction #5936, défaut
   majeur 6) — un fixture de plus dans `c-states` pousse `st-emoji-1` hors
   de la fenêtre de rendu par défaut du virtualiseur (mesuré : timeout Play-
   wright sur `[data-message="st-emoji-1"] [data-emoji-only]`, la SUITE
   « bottom » du gate calibrée sur le compte EXACT de rangées qui tiennent
   dans 390×844 + overscan). Ce chemin est couvert par un test de composant
   PUR — `message-body-blocks.test.ts` — qui n'a aucune fenêtre à respecter. */

// ===== st-place — un lieu partagé =====
const stPlaceCreatedAt = dayAt(0, 9, 14);
const stPlace = statesMessage({
  id: 'st-place',
  senderId: 'u-kwame',
  sender: kwame,
  content: '',
  originalLanguage: 'fr',
  messageType: 'location',
  translations: [],
  createdAt: stPlaceCreatedAt,
  metadata: { location: { latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel', address: 'Champ de Mars, Paris', category: null } },
});

// ===== st-story — réponse à une story VIVANTE =====
const stStoryCreatedAt = dayAt(0, 9, 15);
const stStory = statesMessage({
  id: 'st-story',
  senderId: 'u-amina',
  sender: amina,
  content: 'Magnifique !',
  originalLanguage: 'fr',
  translations: [],
  createdAt: stStoryCreatedAt,
  storyReplyToId: 'p-story-1',
  metadata: {
    postReplyTo: {
      id: 'p-story-1',
      type: 'STORY',
      moodEmoji: null,
      previewText: 'Coucher de soleil',
      thumbnailUrl: null,
      reactionCount: 3,
      commentCount: 0,
      shareCount: 0,
      createdAt: dayAt(0, 8, 0).toISOString(),
      authorId: 'u-amina',
      authorName: 'Amina Diallo',
    },
  },
});

/**
 * st-story-gone — la story a expiré (ou n'a plus de route) : `id: ''`, la
 * carte se rend quand même, INERTE (T12-vi, T13, loi 4).
 */
const stStoryGoneCreatedAt = dayAt(0, 9, 16);
const stStoryGone = statesMessage({
  id: 'st-story-gone',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Elle a disparu depuis.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: stStoryGoneCreatedAt,
  storyReplyToId: 'p-story-2',
  metadata: {
    postReplyTo: {
      id: '',
      type: 'STORY',
      moodEmoji: null,
      previewText: '',
      thumbnailUrl: null,
      reactionCount: 0,
      commentCount: 0,
      shareCount: 0,
      createdAt: '',
      authorId: null,
      authorName: '',
    },
  },
});

/**
 * st-emoji-mine — UN EMOJI SEUL ENVOYÉ PAR MOI (revue-correction #5936).
 *
 * Le corpus n'avait AUCUN corps NU (emoji seul, sticker) du côté `isMine` :
 * la branche qui peint l'heure d'un tel message n'était donc mesurée par
 * aucun des quatre runs du gate, et elle servait `--color-meta-mine`
 * (`white 70%`) HORS de toute bulle indigo — illisible sur le fond clair.
 * Un témoin de contraste se pose sur la branche que la loi TRAITE À PART,
 * jamais sur celle qui lui ressemble.
 */
const stEmojiMineCreatedAt = dayAt(0, 9, 17);
const stEmojiMine = statesMessage({
  id: 'st-emoji-mine',
  senderId: VIEWER_ID,
  sender: viewer,
  content: '👏',
  originalLanguage: 'fr',
  translations: [],
  createdAt: stEmojiMineCreatedAt,
});

// ===== st-last — la queue du fil =====
const stLastCreatedAt = dayAt(0, 9, 18);
const stLast = statesMessage({
  id: 'st-last',
  senderId: 'u-amina',
  sender: amina,
  content: 'Voilà pour le tour des états.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: stLastCreatedAt,
});

export const STATES_MESSAGES: readonly Message[] = [
  stIntro,
  stBadges,
  stFwdGroup,
  stEdited,
  stCall,
  stJoin,
  stNotice,
  stEmoji1,
  stEmoji2,
  stEmoji3,
  stSticker,
  stStickerBare,
  stPlace,
  stStory,
  stStoryGone,
  stEmojiMine,
  stLast,
];

export const STATES_CONVERSATION: Conversation = {
  ...conversationDefaults,
  id: STATES_CONVERSATION_ID,
  title: 'Salle des états',
  type: 'group',
  memberCount: 3,
  participants: [viewer, amina, kwame],
  unreadCount: 0,
  lastMessage: stLast,
  lastMessageAt: stLast.createdAt,
  lastMessageOriginalLanguage: 'fr',
};

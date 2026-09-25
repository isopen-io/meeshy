import type { Attachment, Conversation, Message } from './types';
import { MEDIA_IMAGE_DATA_URI, wavDataUri } from './fixtures-media';
import { MEDIA_VIDEO_DATA_URI } from './fixtures-media-grid';
import { amina, attachmentDefaults, conversationDefaults, dayAt, kwame, message, viewer, VIEWER_ID } from './fixtures-base';

/**
 * LA MATRICE DE RENDU (#7881) — chaque COMBINAISON de message que le corpus
 * ne couvrait pas, reçue ET envoyée (`mine`), pour que les trois modes de
 * lecture (Focal, Script, Bulles) se vérifient sur un seul fil : réponse à un
 * MESSAGE texte, réponse à une PIÈCE (image, vocal, vidéo), réponse à une
 * HUMEUR, réactions sur un message ET sur une pièce, plusieurs vocaux,
 * plusieurs vidéos, texte long + images, lieu + texte.
 *
 * HORS LISTE (motif `fixtures-rich-text.ts`) : le fil s'ouvre par son
 * adresse, `/c/c-matrice`, et les comptes des gates de la Lentille ne
 * bougent pas.
 *
 * FORME SERVIE, jamais inventée :
 * - la pièce NOMMÉE voyage sur la citation (`replyTo.attachmentReplyTo`,
 *   `{ attachmentId, kind }` — `servedQuotedMessage.ts`, #6164) ;
 * - l'humeur citée est `postReplyTo` (`buildPostReplyTo`,
 *   `postReplySnapshot.ts`), `moodEmoji` non nul ;
 * - les réactions d'une pièce sont `reactionSummary` + `currentUserReactions`
 *   (`aggregateAttachmentReactions`, `messages-list-query.ts`).
 */

export const RENDER_MATRIX_CONVERSATION_ID = 'c-matrice';

const matrixMessage = (partial: Parameters<typeof message>[0]): Message =>
  message({ ...partial, conversationId: RENDER_MATRIX_CONVERSATION_ID });

type NamedPiece = { readonly attachmentId: string; readonly kind: 'image' | 'video' | 'audio' };

/** La citation telle que la passerelle la sert quand la réponse vise UNE pièce. */
const quotingPiece = (quoted: Message, piece: NamedPiece): Message => Object.assign({}, quoted, { attachmentReplyTo: piece });

/** Les réactions d'une pièce, à la forme de `aggregateAttachmentReactions`. */
const withPieceReactions = (
  attachment: Attachment,
  reactions: { readonly reactionSummary: Readonly<Record<string, number>>; readonly currentUserReactions: readonly string[] },
): Attachment => Object.assign({}, attachment, reactions);

const image = (messageId: string, index: number, createdAt: Date, uploadedBy: string): Attachment => ({
  ...attachmentDefaults,
  id: `${messageId}-a${index}`,
  messageId,
  fileName: `photo-${index}.png`,
  originalName: `photo-${index}.png`,
  mimeType: 'image/png',
  fileSize: 96,
  fileUrl: MEDIA_IMAGE_DATA_URI,
  width: 1200,
  height: 900,
  alt: `Photo ${index}`,
  uploadedBy,
  createdAt: createdAt.toISOString(),
});

const voice = (messageId: string, index: number, createdAt: Date, uploadedBy: string, transcript: string): Attachment => ({
  ...attachmentDefaults,
  id: `${messageId}-a${index}`,
  messageId,
  fileName: `vocal-${index}.wav`,
  originalName: `vocal-${index}.wav`,
  mimeType: 'audio/wav',
  fileSize: 16_044,
  fileUrl: wavDataUri({ seconds: 2, tone: 400 + index * 60 }),
  duration: 6_000 + index * 3_000,
  uploadedBy,
  createdAt: createdAt.toISOString(),
  currentUserConsumption: null,
  transcription: { type: 'audio', transcribedText: transcript, language: 'fr', confidence: 0.93, source: 'whisper' },
});

const video = (messageId: string, index: number, createdAt: Date, uploadedBy: string): Attachment => ({
  ...attachmentDefaults,
  id: `${messageId}-a${index}`,
  messageId,
  fileName: `video-${index}.webm`,
  originalName: `video-${index}.webm`,
  mimeType: 'video/webm',
  fileSize: 929,
  fileUrl: MEDIA_VIDEO_DATA_URI,
  width: 160,
  height: 90,
  duration: 7_000,
  uploadedBy,
  createdAt: createdAt.toISOString(),
});

const moodReply = (params: {
  readonly id: string;
  readonly author: { readonly id: string; readonly name: string };
  readonly emoji: string;
  readonly text: string;
  readonly createdAt: Date;
}) => ({
  postReplyTo: {
    id: params.id,
    type: 'STATUS',
    moodEmoji: params.emoji,
    previewText: params.text,
    thumbnailUrl: null,
    reactionCount: 2,
    commentCount: 0,
    shareCount: 0,
    createdAt: params.createdAt.toISOString(),
    authorId: params.author.id,
    authorName: params.author.name,
  },
});

// ===== RÉPONSE À UN MESSAGE TEXTE — reçue, puis à soi =====
const mxTextAt = dayAt(0, 10, 0);
const mxText = matrixMessage({
  id: 'mx-text',
  senderId: 'u-amina',
  sender: amina,
  content: 'On se retrouve à 18 h devant la gare ?',
  originalLanguage: 'fr',
  translations: [],
  createdAt: mxTextAt,
});

const mxReplyText = matrixMessage({
  id: 'mx-reply-text',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Oui, j’y serai.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 10, 1),
  replyToId: mxText.id,
  replyTo: mxText,
});

const mxReplyTextMine = matrixMessage({
  id: 'mx-reply-text-mine',
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'Parfait pour moi aussi.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 10, 2),
  replyToId: mxText.id,
  replyTo: mxText,
});

// ===== TEXTE LONG + IMAGES — reçu (3 images), puis à soi (2 images) =====
const mxLongImagesAt = dayAt(0, 10, 3);
const mxLongImages = matrixMessage({
  id: 'mx-long-images',
  senderId: 'u-amina',
  sender: amina,
  content:
    'Voici les photos du chantier de ce matin : la façade est terminée, les fenêtres du deuxième étage arrivent jeudi et il reste la cour à dégager avant la visite de lundi. Dites-moi si quelque chose vous inquiète.',
  originalLanguage: 'fr',
  messageType: 'image',
  translations: [],
  createdAt: mxLongImagesAt,
  attachments: [1, 2, 3].map((n) => image('mx-long-images', n, mxLongImagesAt, 'u-amina')),
});

const mxLongImagesMineAt = dayAt(0, 10, 4);
const mxLongImagesMine = matrixMessage({
  id: 'mx-long-images-mine',
  senderId: VIEWER_ID,
  sender: viewer,
  content:
    'Merci ! De mon côté, voilà l’entrée et le local vélos tels qu’ils sont aujourd’hui. On pourra en parler à la réunion, j’apporte les plans imprimés.',
  originalLanguage: 'fr',
  messageType: 'image',
  translations: [],
  createdAt: mxLongImagesMineAt,
  attachments: [1, 2].map((n) => image('mx-long-images-mine', n, mxLongImagesMineAt, VIEWER_ID)),
});

// ===== RÉPONSE À UNE PIÈCE — la 2e image du carrousel =====
const mxReplyImage = matrixMessage({
  id: 'mx-reply-image',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Celle-ci, c’est la cour ?',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 10, 5),
  replyToId: mxLongImages.id,
  replyTo: quotingPiece(mxLongImages, { attachmentId: 'mx-long-images-a2', kind: 'image' }),
});

// ===== PLUSIEURS VOCAUX — reçus, puis réponse à soi au 2e =====
const mxAudiosAt = dayAt(0, 10, 6);
const mxAudios = matrixMessage({
  id: 'mx-audios',
  senderId: 'u-kwame',
  sender: kwame,
  content: '',
  originalLanguage: 'fr',
  messageType: 'audio',
  translations: [],
  createdAt: mxAudiosAt,
  attachments: [
    voice('mx-audios', 1, mxAudiosAt, 'u-kwame', 'Premier point : la livraison est confirmée pour jeudi.'),
    voice('mx-audios', 2, mxAudiosAt, 'u-kwame', 'Deuxième point : il faudra quelqu’un sur place à huit heures.'),
  ],
});

const mxReplyAudioMine = matrixMessage({
  id: 'mx-reply-audio-mine',
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'Je peux être là à huit heures.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 10, 7),
  replyToId: mxAudios.id,
  replyTo: quotingPiece(mxAudios, { attachmentId: 'mx-audios-a2', kind: 'audio' }),
});

const mxAudiosMineAt = dayAt(0, 10, 8);
const mxAudiosMine = matrixMessage({
  id: 'mx-audios-mine',
  senderId: VIEWER_ID,
  sender: viewer,
  content: '',
  originalLanguage: 'fr',
  messageType: 'audio',
  translations: [],
  createdAt: mxAudiosMineAt,
  attachments: [
    voice('mx-audios-mine', 1, mxAudiosMineAt, VIEWER_ID, 'D’accord pour jeudi.'),
    voice('mx-audios-mine', 2, mxAudiosMineAt, VIEWER_ID, 'Je prends les clés en passant.'),
  ],
});

// ===== PLUSIEURS VIDÉOS — reçues, réponse à la 1re, puis à soi =====
const mxVideosAt = dayAt(0, 10, 9);
const mxVideos = matrixMessage({
  id: 'mx-videos',
  senderId: 'u-amina',
  sender: amina,
  content: 'Deux plans du hall.',
  originalLanguage: 'fr',
  messageType: 'video',
  translations: [],
  createdAt: mxVideosAt,
  attachments: [1, 2].map((n) => video('mx-videos', n, mxVideosAt, 'u-amina')),
});

const mxReplyVideo = matrixMessage({
  id: 'mx-reply-video',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'La première est plus nette.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 10, 10),
  replyToId: mxVideos.id,
  replyTo: quotingPiece(mxVideos, { attachmentId: 'mx-videos-a1', kind: 'video' }),
});

const mxVideosMineAt = dayAt(0, 10, 11);
const mxVideosMine = matrixMessage({
  id: 'mx-videos-mine',
  senderId: VIEWER_ID,
  sender: viewer,
  content: '',
  originalLanguage: 'fr',
  messageType: 'video',
  translations: [],
  createdAt: mxVideosMineAt,
  attachments: [1, 2].map((n) => video('mx-videos-mine', n, mxVideosMineAt, VIEWER_ID)),
});

// ===== RÉPONSE À UNE HUMEUR — reçue (à MON humeur), puis à soi =====
const mxMood = matrixMessage({
  id: 'mx-mood',
  senderId: 'u-amina',
  sender: amina,
  content: 'Courage, bientôt le week-end !',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 10, 12),
  storyReplyToId: 'p-mood-viewer',
  metadata: moodReply({
    id: 'p-mood-viewer',
    author: { id: VIEWER_ID, name: 'Vous' },
    emoji: '😴',
    text: 'Grosse fatigue',
    createdAt: dayAt(0, 8, 30),
  }),
});

const mxMoodMine = matrixMessage({
  id: 'mx-mood-mine',
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'Bon café alors !',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 10, 13),
  storyReplyToId: 'p-mood-amina',
  metadata: moodReply({
    id: 'p-mood-amina',
    author: { id: 'u-amina', name: 'Amina Diallo' },
    emoji: '☕',
    text: 'Pause café',
    createdAt: dayAt(0, 9, 45),
  }),
});

// ===== RÉACTIONS SUR UN MESSAGE — reçu, puis à soi =====
const mxReactions = matrixMessage({
  id: 'mx-reactions',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Réunion déplacée à 15 h.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 10, 14),
  reactionSummary: { '👍': 2, '❤️': 1 },
  reactionCount: 3,
});

const mxReactionsMine = matrixMessage({
  id: 'mx-reactions-mine',
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'Noté, merci.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 10, 15),
  reactionSummary: { '🙏': 2 },
  reactionCount: 2,
});

// ===== RÉACTIONS SUR UNE PIÈCE — 2 images, la 1re réagie =====
const mxPieceReactionsAt = dayAt(0, 10, 16);
const mxPieceReactions = matrixMessage({
  id: 'mx-piece-reactions',
  senderId: 'u-amina',
  sender: amina,
  content: '',
  originalLanguage: 'fr',
  messageType: 'image',
  translations: [],
  createdAt: mxPieceReactionsAt,
  attachments: [
    withPieceReactions(image('mx-piece-reactions', 1, mxPieceReactionsAt, 'u-amina'), {
      reactionSummary: { '🔥': 2, '😍': 1 },
      currentUserReactions: ['🔥'],
    }),
    image('mx-piece-reactions', 2, mxPieceReactionsAt, 'u-amina'),
  ],
});

// ===== LIEU + TEXTE — reçu, puis à soi =====
const mxPlaceText = matrixMessage({
  id: 'mx-place-text',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Je vous attends ici, entrée côté parc.',
  originalLanguage: 'fr',
  messageType: 'location',
  translations: [],
  createdAt: dayAt(0, 10, 17),
  metadata: { location: { latitude: 48.8462, longitude: 2.3371, name: 'Jardin du Luxembourg', address: 'Rue de Médicis, Paris', category: null } },
});

const mxPlaceTextMine = matrixMessage({
  id: 'mx-place-text-mine',
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'J’arrive par là.',
  originalLanguage: 'fr',
  messageType: 'location',
  translations: [],
  createdAt: dayAt(0, 10, 18),
  metadata: { location: { latitude: 48.8448, longitude: 2.3398, name: null, address: null, category: null } },
});

const mxLast = matrixMessage({
  id: 'mx-last',
  senderId: 'u-amina',
  sender: amina,
  content: 'Fin de la matrice.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: dayAt(0, 10, 19),
});

export const RENDER_MATRIX_MESSAGES: readonly Message[] = [
  mxText,
  mxReplyText,
  mxReplyTextMine,
  mxLongImages,
  mxLongImagesMine,
  mxReplyImage,
  mxAudios,
  mxReplyAudioMine,
  mxAudiosMine,
  mxVideos,
  mxReplyVideo,
  mxVideosMine,
  mxMood,
  mxMoodMine,
  mxReactions,
  mxReactionsMine,
  mxPieceReactions,
  mxPlaceText,
  mxPlaceTextMine,
  mxLast,
];

export const RENDER_MATRIX_CONVERSATION: Conversation = {
  ...conversationDefaults,
  id: RENDER_MATRIX_CONVERSATION_ID,
  title: 'Matrice de rendu',
  type: 'group',
  memberCount: 3,
  participants: [viewer, amina, kwame],
  unreadCount: 0,
  lastMessage: mxLast,
  lastMessageAt: mxLast.createdAt,
  lastMessageOriginalLanguage: 'fr',
};

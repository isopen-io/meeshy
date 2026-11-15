import type { Conversation, Message } from './types';
import { attachmentDefaults, conversationDefaults, fatou, kwame, message, minutesAgo, viewer, VIEWER_ID } from './fixtures-base';
import { wavDataUri } from './fixtures-media';

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

/**
 * `live-3` — LE VOCAL NU (#7017) : une pièce audio SANS transcription et SANS
 * traductions, exactement ce qu'un `message:new` porte à l'instant où le vocal
 * arrive — le pipeline n'a encore rien produit.
 *
 * La chronologie (`fixtures-realtime.ts`) l'enrichit en TROIS temps, comme le
 * pipeline réel : Whisper (`es`), puis NLLB langue par langue (`en`, puis
 * `fr`) — trois `message:attachment-updated`, un par enrichissement
 * (`emitAttachmentUpdated.ts`, « une émission par enrichissement »).
 *
 * `originalName` est SERVI, comme sur toute pièce réelle, et il est ce qui
 * rend le gate exigeant : `servedTranscript` (`api/prism.ts`) retombe dessus
 * quand aucune transcription n'existe, si bien que `[data-transcript]` porte
 * le NOM DU FICHIER au chargement. Le gate ne peut donc pas se contenter de
 * compter un nœud — il lit le TEXTE, et c'est la seule mesure qui distingue
 * « la transcription est arrivée » de « le widget est monté ».
 */
export const LIVE_3_ID = 'live-3';
export const LIVE_3_ATTACHMENT_ID = 'live-3-a1';
/** PARTAGÉS avec la chronologie (`fixtures-realtime.ts`) : la charge de
 * `message:attachment-updated` doit désigner LA MÊME pièce — un `fileUrl` ou
 * un `id` qui divergerait ferait silencieusement un no-op (la pièce serait
 * INCONNUE du message), et le gate mesurerait l'absence de correctif sans
 * pouvoir la distinguer d'une fixture mal appariée. */
export const LIVE_3_AUDIO_URL = wavDataUri({ seconds: 2, tone: 392 });
const live3CreatedAt = minutesAgo(25);
export const LIVE_3_CREATED_AT = live3CreatedAt.toISOString();
const live3: Message = liveMessage({
  id: LIVE_3_ID,
  senderId: 'u-kwame',
  sender: kwame,
  content: '',
  originalLanguage: 'es',
  messageType: 'audio',
  translations: [],
  createdAt: live3CreatedAt,
  attachments: [
    {
      ...attachmentDefaults,
      id: LIVE_3_ATTACHMENT_ID,
      messageId: LIVE_3_ID,
      fileName: 'nota.wav',
      originalName: 'nota-de-voz.wav',
      mimeType: 'audio/wav',
      fileSize: 16_044,
      fileUrl: LIVE_3_AUDIO_URL,
      duration: 9_000,
      uploadedBy: 'u-kwame',
      createdAt: LIVE_3_CREATED_AT,
      currentUserConsumption: null,
    },
  ],
} as Parameters<typeof message>[0]);

export const LIVE_MESSAGES: readonly Message[] = [LIVE_1, live2, live3];

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

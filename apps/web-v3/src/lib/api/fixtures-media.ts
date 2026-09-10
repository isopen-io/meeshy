import type { Attachment, Conversation, Message } from './types';
import { VIEWER_ID, amina, attachmentDefaults, conversationDefaults, dayAt, kwame, message, translation, viewer } from './fixtures-base';

/**
 * LE CORPUS « MÉDIAS » (#5805) — le SEUL fil du jeu qui porte une image ET
 * un vocal AVEC transcription et pistes traduites : sans lui, aucun témoin
 * de la famille AUDIO du Prisme (CLAUDE.md § Prisme, cycle 128) ne peut
 * FAIRE ÉCHOUER un résolveur faux (leçon `fixtures.test.ts:1-10`).
 *
 * `memberCount: 3` (< 5, la Rivière reste hors d'atteinte — ce n'est pas son
 * corpus) ; `unreadCount: 0` (< 10, ni Résumé ni bascule « absence » —
 * `check-reading-mode.mjs` ouvre en Focal). Patron `fixtures-catchup.ts`
 * (#5695, étape 2) : un fichier PAR corpus, tous deux important le même
 * socle (`fixtures-base.ts`).
 *
 * ZÉRO OCTET BINAIRE AU DÉPÔT (Q6, §5 étape 2 de la spécification) : l'image
 * est un littéral PNG de moins de 120 caractères (produit par
 * `python3 -c "import zlib,struct,base64; …"`, un pixel indigo, voir
 * `MEDIA_IMAGE_DATA_URI` ci-dessous) et chaque piste audio est un WAV généré
 * À L'EXÉCUTION par `wavDataUri()` — un fichier RIFF/WAVE valide, décodable
 * par `<audio>`, jamais une dépendance au serveur statique du gate (dont
 * `TYPES`, `check-thread-states.mjs:34-41`, ne connaît ni `audio/*` ni
 * `webp`). Ce module suit le même régime d'élision que ses pairs
 * (`vite.config.ts` § `FIXTURE_MODULE`) : sous `VITE_DATA_SOURCE=gateway`,
 * plus aucune référence ne l'atteint et rolldown le retire du bundle.
 */

export const MEDIA_CONVERSATION_ID = 'c-medias';

const mediaMessage = (partial: Parameters<typeof message>[0]): Message =>
  message({ ...partial, conversationId: MEDIA_CONVERSATION_ID });

/**
 * UN PIXEL INDIGO, littéral — produit par :
 * ```
 * python3 -c "
 * import zlib, struct, base64
 * def chunk(tag, data):
 *     return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
 * raw = b'\x00' + bytes([0x63, 0x66, 0xf1])  # filtre + 1 pixel RGB indigo
 * png = (b'\x89PNG\r\n\x1a\n'
 *        + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0))
 *        + chunk(b'IDAT', zlib.compress(raw, 9))
 *        + chunk(b'IEND', b''))
 * print('data:image/png;base64,' + base64.b64encode(png).decode())
 * "
 * ```
 */
const MEDIA_IMAGE_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNITvsIAALqAbsneUV/AAAAAElFTkSuQmCC';

/**
 * `AAAA` en base64 décode vers quatre octets qui ne forment NI un en-tête PNG
 * NI un en-tête RIFF valides — un décodeur `<img>`/`<audio>` lève une erreur
 * `error`, sans jamais toucher le réseau. C'est le témoin d'ÉCHEC (§4.7 i) :
 * la boîte garde sa place, le repli reste lisible.
 */
const MEDIA_BROKEN_IMAGE_DATA_URI = 'data:image/png;base64,AAAA';
const MEDIA_BROKEN_VOICE_DATA_URI = 'data:audio/wav;base64,AAAA';

const SAMPLE_RATE = 8_000;

/**
 * UN FICHIER WAV VALIDE (PCM 8 bits, mono, 8 kHz), généré À L'EXÉCUTION —
 * zéro octet binaire au dépôt (Q6). `tone` (Hz) distingue une piste d'une
 * autre : trois appels à trois tons différents rendent trois URLs
 * DIFFÉRENTES, ce qu'un témoin de rang peut observer sans decoder l'audio.
 * L'amplitude reste faible (12 sur 128) : un son réel, décodable, discret.
 */
export function wavDataUri({ seconds, tone }: { readonly seconds: number; readonly tone: number }): string {
  const sampleCount = Math.max(1, Math.round(seconds * SAMPLE_RATE));
  const bytes = new Uint8Array(44 + sampleCount);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE, true); // débit octet : 1 octet/échantillon
  view.setUint16(32, 1, true); // alignement de bloc
  view.setUint16(34, 8, true); // bits par échantillon
  writeAscii(36, 'data');
  view.setUint32(40, sampleCount, true);

  const amplitude = 12;
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = Math.sin((2 * Math.PI * tone * i) / SAMPLE_RATE);
    bytes[44 + i] = 128 + Math.round(sample * amplitude);
  }

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

const imageAttachment = (id: string, createdAt: Date): Attachment => ({
  ...attachmentDefaults,
  id: `${id}-a1`,
  messageId: id,
  fileName: 'dashboard.png',
  originalName: 'dashboard-deploiement.png',
  mimeType: 'image/png',
  fileSize: 96,
  fileUrl: MEDIA_IMAGE_DATA_URI,
  width: 1200,
  height: 800,
  alt: 'Capture du tableau de bord de déploiement, tous les services au vert',
  uploadedBy: 'u-amina',
  createdAt: createdAt.toISOString(),
  transcription: {
    type: 'image',
    text: 'Capture du tableau de bord de déploiement, tous les services au vert',
    language: 'fr',
    confidence: 1,
    source: 'vision',
  },
  translations: {
    en: {
      type: 'image',
      transcription: 'Deployment dashboard screenshot, every service green',
      createdAt: createdAt.toISOString(),
    },
    de: {
      type: 'image',
      transcription: 'Bildschirmfoto des Deployment-Dashboards, alle Dienste grün',
      createdAt: createdAt.toISOString(),
    },
  },
});

// ===== media-1 — l'IMAGE, alt traduit en et de =====
export const MEDIA_IMAGE_WITNESS_ID = 'media-1';
const media1CreatedAt = dayAt(0, 9, 0);
const media1 = mediaMessage({
  id: MEDIA_IMAGE_WITNESS_ID,
  senderId: 'u-amina',
  sender: amina,
  content: '',
  originalLanguage: 'fr',
  messageType: 'image',
  translations: [],
  createdAt: media1CreatedAt,
  attachments: [imageAttachment(MEDIA_IMAGE_WITNESS_ID, media1CreatedAt)],
});

/**
 * media-2 — LE VOCAL ANGLAIS (rang ≠ 1, cycle 128) : transcription `en`,
 * traductions TEXTE + PISTE en `fr` et `de` — le témoin qui fait tomber tout
 * résolveur qui redescendrait un second prisme au lieu de PRENDRE la langue
 * du texte déjà servi.
 */
export const MEDIA_VOICE_EN_WITNESS_ID = 'media-2';
const media2CreatedAt = dayAt(0, 9, 5);
const media2 = mediaMessage({
  id: MEDIA_VOICE_EN_WITNESS_ID,
  senderId: 'u-kwame',
  sender: kwame,
  content: '',
  originalLanguage: 'en',
  messageType: 'audio',
  translations: [],
  createdAt: media2CreatedAt,
  attachments: [
    {
      ...attachmentDefaults,
      id: `${MEDIA_VOICE_EN_WITNESS_ID}-a1`,
      messageId: MEDIA_VOICE_EN_WITNESS_ID,
      fileName: 'report.wav',
      originalName: 'rapport-deploiement.wav',
      mimeType: 'audio/wav',
      fileSize: 16_044,
      fileUrl: wavDataUri({ seconds: 2, tone: 440 }),
      duration: 12_000,
      uploadedBy: 'u-kwame',
      createdAt: media2CreatedAt.toISOString(),
      currentUserConsumption: null,
      transcription: {
        type: 'audio',
        transcribedText: 'Hello team, the deploy finished at three, I am sending the report.',
        language: 'en',
        confidence: 0.94,
        source: 'whisper',
      },
      translations: {
        fr: {
          type: 'audio',
          transcription: 'Bonjour l’équipe, le déploiement s’est terminé à trois heures, j’envoie le rapport.',
          url: wavDataUri({ seconds: 2, tone: 523 }),
          durationMs: 12_400,
          format: 'wav',
          createdAt: media2CreatedAt.toISOString(),
        },
        de: {
          type: 'audio',
          transcription: 'Hallo Team, das Deployment war um drei fertig, ich schicke den Bericht.',
          url: wavDataUri({ seconds: 2, tone: 659 }),
          durationMs: 12_100,
          format: 'wav',
          createdAt: media2CreatedAt.toISOString(),
        },
      },
    },
  ],
});

/**
 * media-3 — LE VOCAL ALLEMAND : une traduction `es` porte un TEXTE mais
 * AUCUNE piste (`transcriptTranslationTracks` l'écarte,
 * `attachment-audio.ts:441-444`) — le témoin « langue servie sans piste »
 * qui doit retomber sur l'ORIGINAL. `currentUserConsumption` non nul : la
 * barre de consommation doit s'afficher à 4 000 / 12 000 = 33,3 %.
 */
export const MEDIA_VOICE_DE_WITNESS_ID = 'media-3';
const media3CreatedAt = dayAt(0, 9, 10);
const media3 = mediaMessage({
  id: MEDIA_VOICE_DE_WITNESS_ID,
  senderId: 'u-amina',
  sender: amina,
  content: '',
  originalLanguage: 'de',
  messageType: 'audio',
  translations: [],
  createdAt: media3CreatedAt,
  attachments: [
    {
      ...attachmentDefaults,
      id: `${MEDIA_VOICE_DE_WITNESS_ID}-a1`,
      messageId: MEDIA_VOICE_DE_WITNESS_ID,
      fileName: 'presentation.wav',
      originalName: 'presentation-annonce.wav',
      mimeType: 'audio/wav',
      fileSize: 16_044,
      fileUrl: wavDataUri({ seconds: 2, tone: 330 }),
      duration: 12_000,
      uploadedBy: 'u-amina',
      createdAt: media3CreatedAt.toISOString(),
      currentUserConsumption: {
        lastPlayPositionMs: 4_000,
        listenedComplete: false,
        lastWatchPositionMs: null,
        watchedComplete: false,
      },
      transcription: {
        type: 'audio',
        transcribedText: 'Die Präsentation ist fertig, ich lade sie heute Abend hoch.',
        language: 'de',
        confidence: 0.91,
        source: 'whisper',
      },
      translations: {
        en: {
          type: 'audio',
          transcription: 'The presentation is ready, I will upload it tonight.',
          url: wavDataUri({ seconds: 2, tone: 392 }),
          durationMs: 12_200,
          format: 'wav',
          createdAt: media3CreatedAt.toISOString(),
        },
        // `es` : traduction TEXTE seule, sans piste — le TTS n'a pas (encore)
        // produit le fichier. `resolveAudioTrack` doit retomber sur l'original.
        es: {
          type: 'audio',
          transcription: 'La presentación está lista, la subiré esta noche.',
          createdAt: media3CreatedAt.toISOString(),
        },
      },
    },
  ],
});

// ===== media-4 — le fil se ferme, l'identité se pose sur la dernière bulle reçue =====
const media4CreatedAt = dayAt(0, 9, 15);
const media4 = mediaMessage({
  id: 'media-4',
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'Reçu, merci !',
  originalLanguage: 'fr',
  translations: [translation('media-4', 'en', 'Got it, thanks!')],
  createdAt: media4CreatedAt,
});

/**
 * media-5 — L'IMAGE CASSÉE, SANS métadonnées de dimension : couvre à la fois
 * le témoin d'ERREUR (§4.7 i, un décodage `<img>` qui échoue) et la forme
 * « boîte SANS `width`/`height` » (§4.3 b, ratio de repli 300/240).
 */
export const MEDIA_BROKEN_IMAGE_WITNESS_ID = 'media-5';
const media5CreatedAt = dayAt(0, 9, 20);
const media5 = mediaMessage({
  id: MEDIA_BROKEN_IMAGE_WITNESS_ID,
  senderId: 'u-kwame',
  sender: kwame,
  content: '',
  originalLanguage: 'fr',
  messageType: 'image',
  translations: [],
  createdAt: media5CreatedAt,
  attachments: [
    {
      ...attachmentDefaults,
      id: `${MEDIA_BROKEN_IMAGE_WITNESS_ID}-a1`,
      messageId: MEDIA_BROKEN_IMAGE_WITNESS_ID,
      fileName: 'corrompu.png',
      originalName: 'capture-corrompue.png',
      mimeType: 'image/png',
      fileSize: 4,
      fileUrl: MEDIA_BROKEN_IMAGE_DATA_URI,
      alt: 'Capture indisponible, fichier corrompu à l’envoi',
      uploadedBy: 'u-kwame',
      createdAt: media5CreatedAt.toISOString(),
    },
  ],
});

// ===== media-6 — LE VOCAL CASSÉ (§4.7 i) =====
export const MEDIA_BROKEN_VOICE_WITNESS_ID = 'media-6';
const media6CreatedAt = dayAt(0, 9, 25);
const media6 = mediaMessage({
  id: MEDIA_BROKEN_VOICE_WITNESS_ID,
  senderId: 'u-kwame',
  sender: kwame,
  content: '',
  originalLanguage: 'fr',
  messageType: 'audio',
  translations: [],
  createdAt: media6CreatedAt,
  attachments: [
    {
      ...attachmentDefaults,
      id: `${MEDIA_BROKEN_VOICE_WITNESS_ID}-a1`,
      messageId: MEDIA_BROKEN_VOICE_WITNESS_ID,
      fileName: 'corrompu.wav',
      originalName: 'note-corrompue.wav',
      mimeType: 'audio/wav',
      fileSize: 4,
      fileUrl: MEDIA_BROKEN_VOICE_DATA_URI,
      duration: 4_000,
      uploadedBy: 'u-kwame',
      createdAt: media6CreatedAt.toISOString(),
      transcription: {
        type: 'audio',
        transcribedText: 'Message vocal illisible, fichier corrompu à l’envoi.',
        language: 'fr',
        confidence: 0.4,
        source: 'whisper',
      },
    },
  ],
});

export const MEDIA_MESSAGES: readonly Message[] = [media1, media2, media3, media4, media5, media6];

export const MEDIA_CONVERSATION: Conversation = {
  ...conversationDefaults,
  id: MEDIA_CONVERSATION_ID,
  title: 'Médias',
  type: 'group',
  memberCount: 3,
  participants: [viewer, amina, kwame],
  unreadCount: 0,
  lastMessage: media6,
  lastMessageAt: media6.createdAt,
  lastMessageOriginalLanguage: 'fr',
};

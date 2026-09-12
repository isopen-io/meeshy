/**
 * LE CORPUS « MÉDIAS » NE PEUT PAS FAIRE ÉCHOUER UN TÉMOIN DE PRISME AUDIO
 * S'IL NE PEUT PAS LE VALIDER (leçon `fixtures.test.ts:1-10`, transposée à la
 * famille AUDIO du Prisme, #5805).
 */
import { expect, test } from 'bun:test';

import {
  MEDIA_BLURRED_WITNESS_ID,
  MEDIA_BROKEN_IMAGE_WITNESS_ID,
  MEDIA_BROKEN_VOICE_WITNESS_ID,
  MEDIA_CONVERSATION,
  MEDIA_CONVERSATION_ID,
  MEDIA_IMAGE_WITNESS_ID,
  MEDIA_NULL_METADATA_WITNESS_ID,
  MEDIA_VIEW_ONCE_WITNESS_ID,
  MEDIA_VOICE_DE_WITNESS_ID,
  MEDIA_VOICE_EN_WITNESS_ID,
  wavDataUri,
} from './fixtures-media';
import { decodeMessages } from './decode';
import { electDescription } from '../view/media';
import { messagesOf } from './fixtures';
import { dayAt } from './fixtures-base';
import { protectionOf } from '@/lib/reading-mode/protection';

const attachmentOf = (id: string) => {
  const message = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === id);
  const attachment = message?.attachments?.[0];
  if (!attachment) throw new Error(`témoin introuvable : ${id}`);
  return attachment;
};

test('MEDIA_CONVERSATION est enregistrée sous c-medias, avec 3 membres et 0 non-lu', () => {
  expect(MEDIA_CONVERSATION.id).toBe(MEDIA_CONVERSATION_ID);
  expect(MEDIA_CONVERSATION.memberCount).toBe(3);
  expect(MEDIA_CONVERSATION.unreadCount).toBe(0);
});

test('MEDIA_IMAGE_WITNESS_ID : image avec fileUrl non vide, dimensions, et un alt traduit en ET de', () => {
  const attachment = attachmentOf(MEDIA_IMAGE_WITNESS_ID);
  expect(attachment.fileUrl).not.toBe('');
  expect(attachment.width).toBeGreaterThan(0);
  expect(attachment.height).toBeGreaterThan(0);
  const alt = attachment.alt ?? '';
  expect(alt.length).toBeGreaterThan(0);

  const translations = attachment.translations ?? {};
  expect(translations.en?.transcription).toBeDefined();
  expect(translations.de?.transcription).toBeDefined();
  // Les DEUX traductions sont RÉELLEMENT différentes de l'alt d'origine —
  // sans quoi un résolveur qui rendrait `translations.first` passerait le
  // témoin de rang par coïncidence plutôt que par la loi.
  expect(translations.en?.transcription).not.toBe(alt);
  expect(translations.de?.transcription).not.toBe(alt);
  expect(translations.en?.transcription).not.toBe(translations.de?.transcription);
});

/**
 * `Attachment.transcription` porte l'union V1 : `AudioTranscription` nomme
 * son texte `transcribedText`, pas `text` — les trois autres variantes
 * (vidéo, document, image) le nomment `text`. `transcriptTextOf` isole ce
 * détour pour ce fichier de témoins, miroir du site unique de `prism.ts`.
 */
const transcriptTextOf = (attachment: ReturnType<typeof attachmentOf>): string => {
  const t = attachment.transcription;
  if (t === undefined) return '';
  return t.type === 'audio' ? t.transcribedText : t.text;
};

test('MEDIA_VOICE_EN_WITNESS_ID : original en, transcription non vide, pistes fr ET de, trois URLs distinctes', () => {
  const attachment = attachmentOf(MEDIA_VOICE_EN_WITNESS_ID);
  expect(attachment.transcription?.language).toBe('en');
  expect(transcriptTextOf(attachment).length).toBeGreaterThan(0);

  const translations = attachment.translations ?? {};
  expect(translations.fr?.url).toBeTruthy();
  expect(translations.de?.url).toBeTruthy();

  const urls = new Set([attachment.fileUrl, translations.fr?.url, translations.de?.url]);
  expect(urls.size).toBe(3);
});

test('MEDIA_VOICE_DE_WITNESS_ID : original de, une traduction PORTE une piste (en), une autre SEULEMENT un texte (es)', () => {
  const attachment = attachmentOf(MEDIA_VOICE_DE_WITNESS_ID);
  expect(attachment.transcription?.language).toBe('de');

  const translations = attachment.translations ?? {};
  expect(translations.en?.url).toBeTruthy();
  expect(translations.es?.transcription).toBeTruthy();
  expect(translations.es?.url).toBeUndefined();

  expect(attachment.currentUserConsumption?.lastPlayPositionMs).toBe(4_000);
  expect(attachment.duration).toBe(12_000);
});

test('wavDataUri : un en-tête RIFF/WAVE valide, dont les tailles déclarées concordent avec la longueur', () => {
  const uri = wavDataUri({ seconds: 1, tone: 440 });
  expect(uri.startsWith('data:audio/wav;base64,')).toBe(true);

  const base64 = uri.slice('data:audio/wav;base64,'.length);
  const bytes = Buffer.from(base64, 'base64');
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('ascii')).toBe('WAVE');
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('fmt ');
  expect(bytes.subarray(36, 40).toString('ascii')).toBe('data');

  const riffSize = bytes.readUInt32LE(4);
  const dataSize = bytes.readUInt32LE(40);
  expect(riffSize).toBe(bytes.length - 8);
  expect(dataSize).toBe(bytes.length - 44);
});

test('wavDataUri : deux tons différents rendent deux URIs différentes', () => {
  expect(wavDataUri({ seconds: 1, tone: 440 })).not.toBe(wavDataUri({ seconds: 1, tone: 523 }));
});

test('les neuf messages du corpus médias sont servis par messagesOf, dans l’ordre chronologique', () => {
  const messages = messagesOf(MEDIA_CONVERSATION_ID);
  expect(messages).toHaveLength(9);
  const times = messages.map((m) => new Date(m.createdAt).getTime());
  expect(times).toEqual([...times].sort((a, b) => a - b));
  expect(messages.some((m) => m.id === MEDIA_BROKEN_IMAGE_WITNESS_ID)).toBe(true);
  expect(messages.some((m) => m.id === MEDIA_BROKEN_VOICE_WITNESS_ID)).toBe(true);
  expect(messages.some((m) => m.id === MEDIA_NULL_METADATA_WITNESS_ID)).toBe(true);
  expect(messages.some((m) => m.id === MEDIA_BLURRED_WITNESS_ID)).toBe(true);
  expect(messages.some((m) => m.id === MEDIA_VIEW_ONCE_WITNESS_ID)).toBe(true);
});

/**
 * LES DEUX MÉDIAS PROTÉGÉS (#6184) — ce témoin ne garde pas le RENDU (c'est le
 * travail du gate navigateur, `scripts/lib/check-media.mjs`), il garde la
 * FIXTURE : que les deux formes de la loi « l'un OU l'autre » soient présentes,
 * et qu'elles rendent bien `veiled` et non `burned`. Sans lui, un lot pourrait
 * poser `viewOnceCount: 1` par inadvertance — la fixture deviendrait un
 * tombstone, le gate navigateur resterait VERT, et il ne mesurerait plus rien
 * de ce pour quoi il a été écrit.
 */
test('les deux médias protégés sont VOILÉS, l’un par le flou et l’autre par la vue unique NON consommée', () => {
  const maintenant = new Date(dayAt(0, 12, 0)).getTime();
  const floute = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === MEDIA_BLURRED_WITNESS_ID)!;
  const vueUnique = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === MEDIA_VIEW_ONCE_WITNESS_ID)!;

  expect(floute.isBlurred).toBe(true);
  expect(floute.isViewOnce).toBe(false);
  expect(protectionOf(floute, maintenant)).toBe('veiled');

  expect(vueUnique.isViewOnce).toBe(true);
  expect(vueUnique.viewOnceCount).toBe(0);
  expect(vueUnique.isBlurred).toBe(false);
  expect(protectionOf(vueUnique, maintenant)).toBe('veiled');

  // Et chacun porte BIEN une pièce jointe image : un témoin de rétention posé
  // sur un message sans média serait vert par absence de sujet.
  expect(attachmentOf(MEDIA_BLURRED_WITNESS_ID).mimeType).toBe('image/png');
  expect(attachmentOf(MEDIA_VIEW_ONCE_WITNESS_ID).mimeType).toBe('image/png');
});

test('MEDIA_BROKEN_IMAGE_WITNESS_ID : aucune dimension déclarée (ratio de repli 300/240)', () => {
  const attachment = attachmentOf(MEDIA_BROKEN_IMAGE_WITNESS_ID);
  expect(attachment.width).toBeUndefined();
  expect(attachment.height).toBeUndefined();
  expect(attachment.fileUrl).toBe('data:image/png;base64,AAAA');
});

/**
 * MEDIA_NULL_METADATA_WITNESS_ID — LA CHARGE RÉELLE DE LA PASSERELLE (défaut
 * bloquant, revue #5805) : `transcription`/`translations`/`alt`/
 * `thumbnailUrl` servis `null`, jamais absents. Ce témoin fait ÉCHOUER le
 * gate si `decodeAttachment` (`api/decode.ts`) régresse — c'est la SEULE
 * fixture du dépôt qui porte cette forme, et `fixtures.test.ts:1-10` (leçon
 * « une fixture bien formée ne peut pas faire échouer un résolveur faux »)
 * s'applique ici à l'ENVERS : la fixture doit rester MAL formée, comme la
 * passerelle.
 */
test('MEDIA_NULL_METADATA_WITNESS_ID : transcription/translations/alt/thumbnailUrl NULS, comme la passerelle réelle', () => {
  const attachment = attachmentOf(MEDIA_NULL_METADATA_WITNESS_ID);
  expect(attachment.transcription).toBeNull();
  expect(attachment.translations).toBeNull();
  expect(attachment.alt).toBeNull();
  expect(attachment.thumbnailUrl).toBeNull();
});

test('MEDIA_NULL_METADATA_WITNESS_ID : décodé (comme le fil le fait toujours), l’élection ne lève pas et retombe sur le nom du fichier', () => {
  const decoded = decodeMessages([
    messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === MEDIA_NULL_METADATA_WITNESS_ID)!,
  ])[0]!;
  const attachment = decoded.attachments?.[0];
  expect(attachment).toBeDefined();
  expect('transcription' in (attachment as object)).toBe(false);
  const described = electDescription({ attachment: attachment!, readerLanguages: ['fr', 'en'], fallbackLanguage: 'fr' });
  expect(described).toEqual({ text: 'sans-titre.png', language: 'fr', translated: false });
});

/**
 * LE CORPUS « MÉDIAS » NE PEUT PAS FAIRE ÉCHOUER UN TÉMOIN DE PRISME AUDIO
 * S'IL NE PEUT PAS LE VALIDER (leçon `fixtures.test.ts:1-10`, transposée à la
 * famille AUDIO du Prisme, #5805).
 */
import { expect, test } from 'bun:test';

import {
  MEDIA_BROKEN_IMAGE_WITNESS_ID,
  MEDIA_BROKEN_VOICE_WITNESS_ID,
  MEDIA_CONVERSATION,
  MEDIA_CONVERSATION_ID,
  MEDIA_IMAGE_WITNESS_ID,
  MEDIA_VOICE_DE_WITNESS_ID,
  MEDIA_VOICE_EN_WITNESS_ID,
  wavDataUri,
} from './fixtures-media';
import { messagesOf } from './fixtures';

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

test('les six messages du corpus médias sont servis par messagesOf, dans l’ordre chronologique', () => {
  const messages = messagesOf(MEDIA_CONVERSATION_ID);
  expect(messages).toHaveLength(6);
  const times = messages.map((m) => new Date(m.createdAt).getTime());
  expect(times).toEqual([...times].sort((a, b) => a - b));
  expect(messages.some((m) => m.id === MEDIA_BROKEN_IMAGE_WITNESS_ID)).toBe(true);
  expect(messages.some((m) => m.id === MEDIA_BROKEN_VOICE_WITNESS_ID)).toBe(true);
});

test('MEDIA_BROKEN_IMAGE_WITNESS_ID : aucune dimension déclarée (ratio de repli 300/240)', () => {
  const attachment = attachmentOf(MEDIA_BROKEN_IMAGE_WITNESS_ID);
  expect(attachment.width).toBeUndefined();
  expect(attachment.height).toBeUndefined();
  expect(attachment.fileUrl).toBe('data:image/png;base64,AAAA');
});

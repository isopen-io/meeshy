import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';

import { quotedAudioOf } from './quoted-audio';

/**
 * #8320 — LA CITATION D'UN AUDIO SE JOUE SUR PLACE.
 *
 * `quotedAudioOf` est le SITE UNIQUE de la question « la zone lecture d'une
 * citation a-t-elle quelque chose à jouer, et QUOI ? ». Elle répond `null`
 * — la citation garde son placeholder et n'offre AUCUN bouton — dès qu'il n'y
 * a rien d'honnête à jouer : message cité supprimé, protégé (vue unique,
 * flouté, chiffré, au niveau du MESSAGE ou de la PIÈCE), expiré, pièce sans
 * fichier, ou pièce qui n'est pas un audio.
 *
 * La PISTE suit le Prisme audio exactement comme le vocal d'origine
 * (`electAudio` → `resolveAudioTrack`) : les témoins de rang s'écrivent sur un
 * rang AUTRE que le premier (leçon 261).
 */

const NOW = new Date('2026-09-27T10:00:00.000Z');

const attachment = (partial: Partial<Attachment>): Attachment =>
  ({
    ...attachmentDefaults,
    id: 'a-voice',
    messageId: 'm-quoted',
    fileName: 'voice.m4a',
    originalName: 'voice.m4a',
    mimeType: 'audio/mp4',
    fileSize: 4096,
    fileUrl: 'https://cdn.meeshy.me/voice-en.m4a',
    uploadedBy: 'u-amina',
    createdAt: '2026-09-23T09:00:00.000Z',
    duration: 42_000,
    ...partial,
  }) as Attachment;

const voice = (partial: Partial<Attachment> = {}): Attachment =>
  attachment({
    transcription: { type: 'audio', transcribedText: 'Hello team', language: 'en', confidence: 0.9, source: 'whisper' },
    translations: {
      fr: { type: 'audio', transcription: 'Bonjour équipe', url: 'https://cdn.meeshy.me/voice-fr.m4a', durationMs: 40_000, createdAt: new Date() },
    },
    ...partial,
  });

const quoted = (partial: Partial<Message> = {}): Message =>
  ({
    id: 'm-quoted',
    conversationId: 'c-a',
    senderId: 'u-amina',
    content: '',
    originalLanguage: 'en',
    messageType: 'audio',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: new Date('2026-09-23T09:00:00.000Z'),
    attachments: [voice()],
    ...partial,
  }) as Message;

const audioOf = (message: Message, readerLanguages: readonly string[] = ['de', 'fr']) =>
  quotedAudioOf({ quoted: message, readerLanguages, now: NOW });

describe('quotedAudioOf — la zone lecture joue la BONNE pièce dans la BONNE langue', () => {
  test('rang 2 servi : ["de","fr"] ⇒ la piste FRANÇAISE, jamais l’original anglais', () => {
    expect(audioOf(quoted())).toEqual({
      attachmentId: 'a-voice',
      url: 'https://cdn.meeshy.me/voice-fr.m4a',
      language: 'fr',
      durationMs: 40_000,
    });
  });

  test('langue d’origine au rang 1 ⇒ l’original, jamais translations[0]', () => {
    expect(audioOf(quoted(), ['en', 'fr'])).toEqual({
      attachmentId: 'a-voice',
      url: 'https://cdn.meeshy.me/voice-en.m4a',
      language: 'en',
      durationMs: 42_000,
    });
  });

  test('la pièce NOMMÉE par la réponse l’emporte sur la première', () => {
    const second = attachment({ id: 'a-second', fileUrl: 'https://cdn.meeshy.me/second.m4a' });
    const message = { ...quoted({ attachments: [voice(), second] }), attachmentReplyTo: { attachmentId: 'a-second', kind: 'audio' } } as Message;
    expect(audioOf(message)?.attachmentId).toBe('a-second');
    expect(audioOf(message)?.url).toBe('https://cdn.meeshy.me/second.m4a');
  });

  test('un message cité NON audio n’offre pas la lecture', () => {
    const photo = attachment({ mimeType: 'image/jpeg', fileUrl: 'https://cdn.meeshy.me/p.jpg' });
    expect(audioOf(quoted({ attachments: [photo] }))).toBeNull();
    expect(audioOf(quoted({ attachments: [] }))).toBeNull();
  });
});

describe('quotedAudioOf — un message cité PROTÉGÉ n’offre pas la lecture (#8320, dimension 1)', () => {
  test('supprimé', () => {
    expect(audioOf(quoted({ deletedAt: new Date('2026-09-24T00:00:00.000Z') }))).toBeNull();
  });

  test('vue unique, flouté, chiffré — au niveau du MESSAGE', () => {
    expect(audioOf(quoted({ isViewOnce: true }))).toBeNull();
    expect(audioOf(quoted({ isBlurred: true }))).toBeNull();
    expect(audioOf(quoted({ isEncrypted: true }))).toBeNull();
    expect(audioOf(quoted({ effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }))).toBeNull();
  });

  test('vue unique ou floutée — au niveau de la PIÈCE seule', () => {
    expect(audioOf(quoted({ attachments: [voice({ isViewOnce: true })] }))).toBeNull();
    expect(audioOf(quoted({ attachments: [voice({ isBlurred: true })] }))).toBeNull();
  });

  test('éphémère EXPIRÉ ⇒ rien ; éphémère encore vivant ⇒ lisible, comme dans le fil', () => {
    expect(audioOf(quoted({ expiresAt: new Date('2026-09-27T09:59:59.000Z') }))).toBeNull();
    expect(audioOf(quoted({ expiresAt: new Date('2026-09-27T10:05:00.000Z') }))?.attachmentId).toBe('a-voice');
  });

  test('pièce sans fichier servi (masquée par la passerelle) ⇒ rien', () => {
    expect(audioOf(quoted({ attachments: [voice({ fileUrl: '' })] }))).toBeNull();
  });
});

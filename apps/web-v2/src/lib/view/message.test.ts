import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';

import type { Attachment } from '@/lib/api/types';

import { served } from '@/lib/api/prism';

import { checkStatusOf, deliveryOf, servedRowLanguage, translatedLanguagesOf } from './message';

const message = (partial: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    conversationId: 'c-a',
    senderId: 'u-viewer',
    content: 'bonjour',
    originalLanguage: 'fr',
    messageType: 'text',
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
    createdAt: new Date('2026-09-09T10:00:00.000Z'),
    timestamp: new Date('2026-09-09T10:00:00.000Z'),
    ...partial,
  }) as Message;

describe('checkStatusOf — l’accusé qu’une peau a le droit de peindre', () => {
  /**
   * LE POINT DE CE TÉMOIN (#5813, revue-correction). Un envoi ÉCHOUÉ porte
   * `deliveredCount: 0` — et `deliveryOf` lit `0` comme « envoyé ». La bande
   * de reprise disait donc « Non envoyé · Réessayer » pendant qu'une coche ✓
   * s'affichait à dix pixels de là, avec `title="envoyé"`
   * (`STATUS_LABEL.sent`). Deux affirmations contraires sur le MÊME message,
   * dont l'une est fausse. iOS ne peint jamais l'accusé d'un `.sendFailed`
   * (`BubbleFooter.swift:186-197` sert `exclamationmark.circle.fill`, jamais
   * la coche). `null` ⇒ la peau ne peint RIEN : la bande porte seule l'état.
   */
  test('local failed ⇒ null — jamais la coche « envoyé » à côté de « Non envoyé »', () => {
    expect(checkStatusOf(message(), 'failed')).toBeNull();
    expect(deliveryOf(message())).toBe('sent');
  });

  test('local pending ⇒ pending', () => {
    expect(checkStatusOf(message(), 'pending')).toBe('pending');
  });

  test('aucune opinion locale ⇒ l’accusé SERVI, inchangé', () => {
    expect(checkStatusOf(message(), undefined)).toBe('sent');
    expect(checkStatusOf(message({ deliveredCount: 2, recipientCount: 2 }), undefined)).toBe('delivered');
    expect(checkStatusOf(message({ readCount: 2, deliveredCount: 2, recipientCount: 2 }), undefined)).toBe('read');
  });

  test('un échec LOCAL ne peut pas être masqué par un accusé SERVI — le local prime', () => {
    expect(checkStatusOf(message({ deliveredCount: 5, recipientCount: 5 }), 'failed')).toBeNull();
  });
});

const voiceAttachment = (translations: Attachment['translations']): Attachment =>
  ({
    id: 'a1',
    messageId: 'm1',
    fileName: 'note.wav',
    originalName: 'note.wav',
    mimeType: 'audio/wav',
    fileSize: 1,
    fileUrl: 'data:audio/wav;base64,AA',
    uploadedBy: 'u-viewer',
    isAnonymous: false,
    createdAt: new Date().toISOString(),
    capturedInApp: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    isForwarded: false,
    isEncrypted: false,
    viewedCount: 0,
    downloadedCount: 0,
    consumedCount: 0,
    translations,
  }) as Attachment;

/**
 * `translatedLanguagesOf` (#5805) — miroir `BubbleContentBuilder
 * .buildAvailableFlags` (`:376-379`) : l'audio traduit rejoint la MÊME bande
 * que le texte, jamais une bande à part.
 */
describe('translatedLanguagesOf — le texte ET les pièces jointes (#5805)', () => {
  test('un vocal traduit SANS traduction texte ⇒ [\'fr\'] (l’audio seul alimente la bande)', () => {
    const m = message({
      translations: [],
      attachments: [
        voiceAttachment({ fr: { type: 'audio', transcription: 'Bonjour', createdAt: new Date() } }),
      ],
    });
    expect(translatedLanguagesOf(m)).toEqual(['fr']);
  });

  test('union du texte et des pièces, ordre stable, sans doublon', () => {
    const m = message({
      translations: [
        { id: 't1', messageId: 'm1', targetLanguage: 'en', translatedContent: 'Hello', translationModel: 'medium', createdAt: new Date() },
      ],
      attachments: [
        voiceAttachment({
          en: { type: 'audio', transcription: 'Hello', createdAt: new Date() }, // déjà vu via le texte
          de: { type: 'audio', transcription: 'Hallo', createdAt: new Date() },
        }),
      ],
    });
    expect(translatedLanguagesOf(m)).toEqual(['en', 'de']);
  });

  test('aucune traduction, ni texte ni pièce ⇒ tableau vide', () => {
    expect(translatedLanguagesOf(message())).toEqual([]);
  });

  test('une entrée de traduction sans texte (soft-supprimée / vide) n’entre pas dans la bande', () => {
    const m = message({
      translations: [],
      attachments: [
        voiceAttachment({
          es: { type: 'audio', transcription: '', createdAt: new Date() },
        }),
      ],
    });
    expect(translatedLanguagesOf(m)).toEqual([]);
  });
});

const imageAttachment = (translations: Attachment['translations']): Attachment =>
  ({ ...voiceAttachment(translations), mimeType: 'image/png', fileName: 'p.png', originalName: 'p.png' }) as Attachment;

/**
 * REVUE #5805 — `buildAvailableFlags` prend `translations` (texte) ET
 * `translatedAudios`, jamais « toute pièce traduite » : un drapeau dont le
 * seul effet serait de changer l'`alt` d'une image n'a aucun effet
 * OBSERVABLE (loi 4).
 */
describe('translatedLanguagesOf — une IMAGE traduite ne monte PAS la bande (revue #5805)', () => {
  test('seul l’alt d’une image est traduit ⇒ aucune langue dans la bande', () => {
    const m = message({
      translations: [],
      attachments: [imageAttachment({ en: { type: 'image', transcription: 'A dashboard', createdAt: new Date() } })],
    });
    expect(translatedLanguagesOf(m)).toEqual([]);
  });

  test('la MÊME carte sur un VOCAL la monte — c’est le type de la pièce qui décide, pas la carte', () => {
    const m = message({
      translations: [],
      attachments: [voiceAttachment({ en: { type: 'audio', transcription: 'A dashboard', createdAt: new Date() } })],
    });
    expect(translatedLanguagesOf(m)).toEqual(['en']);
  });
});

/**
 * REVUE #5805 — LE DÉFAUT QUE CE TÉMOIN GARDE : sur un message MÉDIA-SEUL,
 * `served(message.content).language` vaut l'ORIGINALE (le texte est vide),
 * alors que la transcription à l'écran est traduite. `languageBand` retirait
 * donc la mauvaise langue et proposait le drapeau de la traduction DÉJÀ
 * servie — mesuré au navigateur : cliquer ne changeait rien (contrôle inerte,
 * loi 4) et `aria-pressed="false"` niait la langue servie.
 */
describe('servedRowLanguage — le texte quand il existe, la pièce sinon (revue #5805)', () => {
  const textServed = (content: string, originalLanguage: string, preferred: readonly string[], translations: Message['translations'] = []) =>
    served({ preferredLanguages: preferred, originalLanguage, translations, original: content });

  test('message MÉDIA-SEUL : la langue de la TRANSCRIPTION servie, jamais l’originale du texte vide', () => {
    const attachments = [
      voiceAttachment({ fr: { type: 'audio', transcription: 'Bonjour', url: 'data:audio/wav;base64,FR', createdAt: new Date() } }),
    ];
    const language = servedRowLanguage({
      served: textServed('', 'en', ['fr', 'en']),
      preferredLanguages: ['fr', 'en'],
      attachments,
      fallbackLanguage: 'en',
    });
    expect(language).toBe('fr');
  });

  test('rang ≠ 1 : prisme [\'de\',\'fr\'] sur un vocal traduit en fr seulement ⇒ la langue servie est fr (rang 2)', () => {
    const attachments = [
      voiceAttachment({ fr: { type: 'audio', transcription: 'Bonjour', url: 'data:audio/wav;base64,FR', createdAt: new Date() } }),
    ];
    expect(
      servedRowLanguage({
        served: textServed('', 'en', ['de', 'fr']),
        preferredLanguages: ['de', 'fr'],
        attachments,
        fallbackLanguage: 'en',
      }),
    ).toBe('fr');
  });

  test('le TEXTE gagne dès qu’il y en a un — une pièce ne parle jamais à sa place', () => {
    const attachments = [
      voiceAttachment({ de: { type: 'audio', transcription: 'Hallo', url: 'data:audio/wav;base64,DE', createdAt: new Date() } }),
    ];
    const textPair = textServed('Hello', 'en', ['de', 'en'], []);
    expect(
      servedRowLanguage({ served: textPair, preferredLanguages: ['de', 'en'], attachments, fallbackLanguage: 'en' }),
    ).toBe(textPair.language);
  });

  test('aucune pièce audio (une image seule) : la langue du texte, inchangée', () => {
    expect(
      servedRowLanguage({
        served: textServed('', 'fr', ['en', 'fr']),
        preferredLanguages: ['en', 'fr'],
        attachments: [imageAttachment({ en: { type: 'image', transcription: 'A dashboard', createdAt: new Date() } })],
        fallbackLanguage: 'fr',
      }),
    ).toBe('fr');
  });

  /**
   * DÉFAUT MAJEUR, REVUE #5805 (second passage) — sur la forme RÉELLE du wire
   * (`type: 'audio'` avec `text`, jamais `transcribedText` : voir
   * `media.test.ts`, même revue), une élection PAR `type` rend `undefined`
   * pour `transcriptionTextOf`, donc `transcript.text === ''` ici, et la
   * bande de langue RETOMBE sur `served.language` — la langue du MESSAGE —
   * exactement le contrôle INERTE que ce lot prétendait avoir corrigé.
   */
  test('rangée média-seule sur la forme RÉELLE du wire (`type` présent, `text` seul) : la bande reste EFFECTIVE', () => {
    const attachments: Attachment[] = [
      {
        ...voiceAttachment({ fr: { type: 'audio', transcription: 'Bonjour équipe', url: 'data:audio/wav;base64,FR', createdAt: new Date() } }),
        transcription: { type: 'audio', text: 'Hello team', language: 'en', confidence: 0.9, source: 'whisper' } as never,
      },
    ];
    // Sans le correctif, `transcriptionTextOf` élit `undefined` sur cette
    // charge (le vrai champ `text` n'est jamais lu quand `type === 'audio'`),
    // `servedTranscript` retombe sur `originalName` ('note.wav', une chaîne
    // non vide) — la bande resterait donc « effective » PAR ACCIDENT mais
    // figée sur la langue ORIGINALE, jamais sur une traduction de rang
    // inférieur : c'est CE rang que le témoin garde.
    const language = servedRowLanguage({
      served: textServed('', 'en', ['fr', 'en']),
      preferredLanguages: ['fr', 'en'],
      attachments,
      fallbackLanguage: 'en',
    });
    expect(language).toBe('fr');
  });
});

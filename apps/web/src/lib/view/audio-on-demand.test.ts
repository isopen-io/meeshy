import { describe, expect, test } from 'bun:test';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment } from '@/lib/api/types';

import { electAudio } from './media';
import { translationOffers, withSupplied } from './audio-on-demand';

/**
 * #9256 — CE QUE LE LECTEUR A DEMANDÉ REJOINT LA PIÈCE AVANT LA DESCENTE.
 *
 * Une transcription ou une traduction obtenue à la demande ne se peint pas à
 * côté de la pièce : elle s'y greffe, puis `electAudio` descend le Prisme UNE
 * fois — le texte servi ET la piste jouée viennent de la même élection.
 */

const voice = (partial: Partial<Attachment> = {}): Attachment =>
  ({
    ...attachmentDefaults,
    id: 'a-voice',
    messageId: 'm-voice',
    mimeType: 'audio/wav',
    fileUrl: 'https://cdn.meeshy.me/original.wav',
    duration: 8_000,
    ...partial,
  }) as Attachment;

const transcription = { type: 'audio', transcribedText: 'Bonjour à tous', language: 'fr', confidence: 0.9, source: 'whisper' } as const;
const english = { type: 'audio', transcription: 'Hello everyone', url: 'https://cdn.meeshy.me/en.wav', createdAt: '2026-10-04T09:00:00.000Z' } as const;

describe('withSupplied (#9256)', () => {
  test('une transcription obtenue à la demande se sert comme celle de la passerelle', () => {
    const served = electAudio({ attachment: withSupplied(voice(), { transcription, translations: {} }), readerLanguages: ['fr'], fallbackLanguage: 'fr' });

    expect(served.described.text).toBe('Bonjour à tous');
    expect(served.described.language).toBe('fr');
  });

  test('une traduction obtenue à la demande élit le texte ET la piste, d’une seule descente', () => {
    const attachment = withSupplied(voice({ transcription }), { transcription: null, translations: { en: english } });

    const served = electAudio({ attachment, readerLanguages: ['en', 'fr'], fallbackLanguage: 'fr' });

    expect(served.described.text).toBe('Hello everyone');
    expect(served.track.language).toBe('en');
    expect(served.track.url).toBe('https://cdn.meeshy.me/en.wav');
  });

  test('ce que la passerelle a servi gagne sur ce que le lecteur avait obtenu', () => {
    const fresher = { ...transcription, transcribedText: 'Bonjour à toutes et à tous' };
    const servedEnglish = { ...english, transcription: 'Hello, everyone!' };

    const attachment = withSupplied(voice({ transcription: fresher, translations: { en: servedEnglish } }), { transcription, translations: { en: english } });

    expect(attachment.transcription).toEqual(fresher);
    expect(attachment.translations?.en).toEqual(servedEnglish);
  });

  test('rien d’obtenu : la pièce reste la même référence', () => {
    const attachment = voice({ transcription });

    expect(withSupplied(attachment, { transcription: null, translations: {} })).toBe(attachment);
  });
});

describe('translationOffers (#9256)', () => {
  test('les langues du lecteur d’abord, puis les autres, sans celles déjà disponibles', () => {
    const offers = translationOffers({ readerLanguages: ['pt', 'fr'], versions: ['fr', 'en'] });

    expect(offers[0]).toBe('pt');
    expect(offers).not.toContain('fr');
    expect(offers).not.toContain('en');
    expect(new Set(offers).size).toBe(offers.length);
    expect(offers).toContain('es');
  });

  test('une langue vide ou inconnue du lecteur n’est jamais offerte comme cible vide', () => {
    expect(translationOffers({ readerLanguages: ['', 'wo'], versions: ['fr'] })).toContain('wo');
    expect(translationOffers({ readerLanguages: ['', 'wo'], versions: ['fr'] })).not.toContain('');
  });
});

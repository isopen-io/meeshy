import { describe, it, expect } from '@jest/globals';
import { isBlankTranscriptionText, shouldProcessAudioAttachment } from '../../utils/transcription';

/**
 * Régression production : une transcription vide ("no speech" — VAD a retiré
 * tout l'audio) était persistée puis affichée comme "undefined". Le gateway
 * doit traiter un texte vide comme une absence de transcription.
 */
describe('isBlankTranscriptionText', () => {
  it('treats undefined / null as blank', () => {
    expect(isBlankTranscriptionText(undefined)).toBe(true);
    expect(isBlankTranscriptionText(null)).toBe(true);
  });

  it('treats empty / whitespace as blank', () => {
    expect(isBlankTranscriptionText('')).toBe(true);
    expect(isBlankTranscriptionText('   \n\t')).toBe(true);
  });

  it('treats the literal string "undefined" as blank (legacy bad data)', () => {
    expect(isBlankTranscriptionText('undefined')).toBe(true);
  });

  it('treats real speech as non-blank', () => {
    expect(isBlankTranscriptionText('Bonjour tout le monde')).toBe(false);
    expect(isBlankTranscriptionText('a')).toBe(false);
  });
});

/**
 * Idempotence du dispatch audio : si handleAttachments est rejoué (retry
 * outbox, REST+socket pour le même message), le même audio ne doit pas être
 * re-transcrit/re-traduit/re-TTS. On ne (re)traite que les audios SANS
 * transcription utilisable déjà stockée.
 */
describe('shouldProcessAudioAttachment', () => {
  it('processes an audio attachment with no transcription yet', () => {
    expect(shouldProcessAudioAttachment({ mimeType: 'audio/m4a', transcription: null })).toBe(true);
    expect(shouldProcessAudioAttachment({ mimeType: 'audio/mp4' })).toBe(true);
  });

  it('processes an audio attachment whose stored transcription is blank/undefined', () => {
    expect(shouldProcessAudioAttachment({ mimeType: 'audio/m4a', transcription: { text: '' } })).toBe(true);
    expect(shouldProcessAudioAttachment({ mimeType: 'audio/m4a', transcription: { text: 'undefined' } })).toBe(true);
  });

  it('skips an audio attachment that already has a real transcription (idempotency)', () => {
    expect(shouldProcessAudioAttachment({ mimeType: 'audio/m4a', transcription: { text: 'Bonjour' } })).toBe(false);
  });

  it('skips a non-audio attachment', () => {
    expect(shouldProcessAudioAttachment({ mimeType: 'image/png', transcription: null })).toBe(false);
    expect(shouldProcessAudioAttachment({ mimeType: null })).toBe(false);
  });
});

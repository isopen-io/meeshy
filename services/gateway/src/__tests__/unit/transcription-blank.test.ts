import { describe, it, expect } from '@jest/globals';
import { isBlankTranscriptionText } from '../../utils/transcription';

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

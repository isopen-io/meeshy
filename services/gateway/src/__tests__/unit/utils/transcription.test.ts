import { isBlankTranscriptionText, shouldProcessAudioAttachment } from '../../../utils/transcription';

describe('isBlankTranscriptionText', () => {
  it('returns true for undefined', () => {
    expect(isBlankTranscriptionText(undefined)).toBe(true);
  });

  it('returns true for null', () => {
    expect(isBlankTranscriptionText(null)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isBlankTranscriptionText('')).toBe(true);
  });

  it('returns true for whitespace-only string', () => {
    expect(isBlankTranscriptionText('   ')).toBe(true);
  });

  it('returns true for literal "undefined"', () => {
    expect(isBlankTranscriptionText('undefined')).toBe(true);
  });

  it('returns true for literal "null"', () => {
    expect(isBlankTranscriptionText('null')).toBe(true);
  });

  it('returns true for "UNDEFINED" (case-insensitive)', () => {
    expect(isBlankTranscriptionText('UNDEFINED')).toBe(true);
  });

  it('returns true for "NULL" (case-insensitive)', () => {
    expect(isBlankTranscriptionText('NULL')).toBe(true);
  });

  it('returns false for a real transcription', () => {
    expect(isBlankTranscriptionText('Hello world')).toBe(false);
  });

  it('returns false for a single character', () => {
    expect(isBlankTranscriptionText('a')).toBe(false);
  });
});

describe('shouldProcessAudioAttachment', () => {
  it('returns false when mimeType is absent', () => {
    expect(shouldProcessAudioAttachment({ mimeType: undefined })).toBe(false);
  });

  it('returns false when mimeType is null', () => {
    expect(shouldProcessAudioAttachment({ mimeType: null })).toBe(false);
  });

  it('returns false for non-audio mime type', () => {
    expect(shouldProcessAudioAttachment({ mimeType: 'image/jpeg' })).toBe(false);
  });

  it('returns true for audio mime type with no transcription', () => {
    expect(shouldProcessAudioAttachment({ mimeType: 'audio/mp3' })).toBe(true);
  });

  it('returns true for audio mime type with blank transcription text', () => {
    expect(shouldProcessAudioAttachment({ mimeType: 'audio/wav', transcription: { text: '' } })).toBe(true);
  });

  it('returns true for audio mime type with null transcription text', () => {
    expect(shouldProcessAudioAttachment({ mimeType: 'audio/ogg', transcription: { text: null } })).toBe(true);
  });

  it('returns false for audio mime type with a real transcription', () => {
    expect(shouldProcessAudioAttachment({ mimeType: 'audio/mp4', transcription: { text: 'Some speech here' } })).toBe(false);
  });

  it('returns true when transcription is a non-object (guard branch)', () => {
    expect(shouldProcessAudioAttachment({ mimeType: 'audio/mp3', transcription: 42 })).toBe(true);
  });
});

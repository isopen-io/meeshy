/**
 * Unit tests for transcription utilities.
 * Covers isBlankTranscriptionText and shouldProcessAudioAttachment.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  isBlankTranscriptionText,
  shouldProcessAudioAttachment,
} from '../../../utils/transcription';

// ─── isBlankTranscriptionText ─────────────────────────────────────────────────

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
    expect(isBlankTranscriptionText('   \t\n  ')).toBe(true);
  });

  it('returns true for the literal string "undefined"', () => {
    expect(isBlankTranscriptionText('undefined')).toBe(true);
  });

  it('returns true for "undefined" with surrounding whitespace', () => {
    expect(isBlankTranscriptionText('  undefined  ')).toBe(true);
  });

  it('returns true for the literal string "null"', () => {
    expect(isBlankTranscriptionText('null')).toBe(true);
  });

  it('returns true for "NULL" (case-insensitive)', () => {
    expect(isBlankTranscriptionText('NULL')).toBe(true);
  });

  it('returns false for a real transcription', () => {
    expect(isBlankTranscriptionText('Hello world')).toBe(false);
  });

  it('returns false for a single non-whitespace character', () => {
    expect(isBlankTranscriptionText('.')).toBe(false);
  });

  it('returns false for a string that contains "undefined" but has extra text', () => {
    expect(isBlankTranscriptionText('undefined text')).toBe(false);
  });
});

// ─── shouldProcessAudioAttachment ─────────────────────────────────────────────

describe('shouldProcessAudioAttachment', () => {
  it('returns false when mimeType is missing', () => {
    expect(shouldProcessAudioAttachment({})).toBe(false);
  });

  it('returns false when mimeType is null', () => {
    expect(shouldProcessAudioAttachment({ mimeType: null })).toBe(false);
  });

  it('returns false when mimeType is not audio', () => {
    expect(shouldProcessAudioAttachment({ mimeType: 'image/jpeg' })).toBe(false);
  });

  it('returns false when mimeType is video', () => {
    expect(shouldProcessAudioAttachment({ mimeType: 'video/mp4' })).toBe(false);
  });

  it('returns true for audio/mpeg with no transcription', () => {
    expect(shouldProcessAudioAttachment({ mimeType: 'audio/mpeg' })).toBe(true);
  });

  it('returns true for audio/wav with null transcription text', () => {
    expect(shouldProcessAudioAttachment({
      mimeType: 'audio/wav',
      transcription: { text: null },
    })).toBe(true);
  });

  it('returns true for audio/ogg with blank transcription text', () => {
    expect(shouldProcessAudioAttachment({
      mimeType: 'audio/ogg',
      transcription: { text: '   ' },
    })).toBe(true);
  });

  it('returns true for audio/mp4 with legacy "undefined" transcription text', () => {
    expect(shouldProcessAudioAttachment({
      mimeType: 'audio/mp4',
      transcription: { text: 'undefined' },
    })).toBe(true);
  });

  it('returns false for audio with a real transcription', () => {
    expect(shouldProcessAudioAttachment({
      mimeType: 'audio/mpeg',
      transcription: { text: 'Hello this is speech' },
    })).toBe(false);
  });

  it('returns true when transcription is a non-object value (no text field)', () => {
    expect(shouldProcessAudioAttachment({
      mimeType: 'audio/mpeg',
      transcription: 'raw string',
    })).toBe(true);
  });

  it('returns true when transcription is a number', () => {
    expect(shouldProcessAudioAttachment({
      mimeType: 'audio/mpeg',
      transcription: 42,
    })).toBe(true);
  });
});

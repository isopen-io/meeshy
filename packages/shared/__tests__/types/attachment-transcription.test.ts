import { describe, it, expect } from 'vitest';
import {
  isAudioTranscription,
  isVideoTranscription,
  isDocumentTranscription,
  isImageTranscription,
  isAudioTranslation,
  isVideoTranslation,
  isDocumentTranslation,
  isImageTranslation,
} from '../../types/attachment-transcription';
import type {
  AttachmentTranscription,
  AttachmentTranslation,
} from '../../types/attachment-transcription';

// ── factories ──────────────────────────────────────────────────────────────

function makeTranscription(type: AttachmentTranscription['type']): AttachmentTranscription {
  return { type, text: 'sample', language: 'en', confidence: 0.9, source: 'whisper' };
}

function makeTranslation(type: AttachmentTranslation['type']): AttachmentTranslation {
  return { type, transcription: 'sample', createdAt: '2024-01-01T00:00:00Z' };
}

// ── transcription type guards ──────────────────────────────────────────────

describe('isAudioTranscription', () => {
  it('returns true for audio type', () => {
    expect(isAudioTranscription(makeTranscription('audio'))).toBe(true);
  });

  it('returns false for non-audio types', () => {
    expect(isAudioTranscription(makeTranscription('video'))).toBe(false);
    expect(isAudioTranscription(makeTranscription('document'))).toBe(false);
    expect(isAudioTranscription(makeTranscription('image'))).toBe(false);
  });
});

describe('isVideoTranscription', () => {
  it('returns true for video type', () => {
    expect(isVideoTranscription(makeTranscription('video'))).toBe(true);
  });

  it('returns false for non-video types', () => {
    expect(isVideoTranscription(makeTranscription('audio'))).toBe(false);
    expect(isVideoTranscription(makeTranscription('document'))).toBe(false);
    expect(isVideoTranscription(makeTranscription('image'))).toBe(false);
  });
});

describe('isDocumentTranscription', () => {
  it('returns true for document type', () => {
    expect(isDocumentTranscription(makeTranscription('document'))).toBe(true);
  });

  it('returns false for non-document types', () => {
    expect(isDocumentTranscription(makeTranscription('audio'))).toBe(false);
    expect(isDocumentTranscription(makeTranscription('video'))).toBe(false);
    expect(isDocumentTranscription(makeTranscription('image'))).toBe(false);
  });
});

describe('isImageTranscription', () => {
  it('returns true for image type', () => {
    expect(isImageTranscription(makeTranscription('image'))).toBe(true);
  });

  it('returns false for non-image types', () => {
    expect(isImageTranscription(makeTranscription('audio'))).toBe(false);
    expect(isImageTranscription(makeTranscription('video'))).toBe(false);
    expect(isImageTranscription(makeTranscription('document'))).toBe(false);
  });
});

// ── translation type guards ────────────────────────────────────────────────

describe('isAudioTranslation', () => {
  it('returns true for audio type', () => {
    expect(isAudioTranslation(makeTranslation('audio'))).toBe(true);
  });

  it('returns false for non-audio types', () => {
    expect(isAudioTranslation(makeTranslation('video'))).toBe(false);
    expect(isAudioTranslation(makeTranslation('document'))).toBe(false);
    expect(isAudioTranslation(makeTranslation('image'))).toBe(false);
  });
});

describe('isVideoTranslation', () => {
  it('returns true for video type', () => {
    expect(isVideoTranslation(makeTranslation('video'))).toBe(true);
  });

  it('returns false for non-video types', () => {
    expect(isVideoTranslation(makeTranslation('audio'))).toBe(false);
    expect(isVideoTranslation(makeTranslation('document'))).toBe(false);
    expect(isVideoTranslation(makeTranslation('image'))).toBe(false);
  });
});

describe('isDocumentTranslation', () => {
  it('returns true for document type', () => {
    expect(isDocumentTranslation(makeTranslation('document'))).toBe(true);
  });

  it('returns false for non-document types', () => {
    expect(isDocumentTranslation(makeTranslation('audio'))).toBe(false);
    expect(isDocumentTranslation(makeTranslation('video'))).toBe(false);
    expect(isDocumentTranslation(makeTranslation('image'))).toBe(false);
  });
});

describe('isImageTranslation', () => {
  it('returns true for image type', () => {
    expect(isImageTranslation(makeTranslation('image'))).toBe(true);
  });

  it('returns false for non-image types', () => {
    expect(isImageTranslation(makeTranslation('audio'))).toBe(false);
    expect(isImageTranslation(makeTranslation('video'))).toBe(false);
    expect(isImageTranslation(makeTranslation('document'))).toBe(false);
  });
});

import { describe, it, expect } from '@jest/globals';
import { shouldReturnExistingTranscription } from '../../routes/attachments/translation';

describe('shouldReturnExistingTranscription', () => {
  it('returns true when a transcription exists and force is not set', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: true, force: false })).toBe(true);
  });

  it('returns false when force is true even if a transcription exists', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: true, force: true })).toBe(false);
  });

  it('returns false when no transcription exists', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: false, force: false })).toBe(false);
  });

  it('returns false when no transcription exists and force is true', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: false, force: true })).toBe(false);
  });
});

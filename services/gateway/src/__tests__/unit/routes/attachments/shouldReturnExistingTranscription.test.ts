/**
 * routes/attachments/translation — shouldReturnExistingTranscription unit tests
 *
 * @jest-environment node
 */

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

import { shouldReturnExistingTranscription } from '../../../../routes/attachments/translation';

describe('shouldReturnExistingTranscription', () => {
  it('returns true when transcription exists and force is false', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: true, force: false })).toBe(true);
  });

  it('returns false when transcription exists but force is true (bypass cache)', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: true, force: true })).toBe(false);
  });

  it('returns false when no transcription and force is false', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: false, force: false })).toBe(false);
  });

  it('returns false when no transcription and force is true', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: false, force: true })).toBe(false);
  });
});

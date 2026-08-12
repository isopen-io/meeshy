import { describe, it, expect } from '@jest/globals';
import { StoryAudioObjectSchema } from '../types';

describe('StoryAudioObjectSchema — bornes', () => {
  const base = { id: 'track-1', postMediaId: '507f1f77bcf86cd799439011' };

  it('test_soundId_validObjectId_isAccepted', () => {
    const r = StoryAudioObjectSchema.safeParse({ ...base, soundId: '507f1f77bcf86cd799439012' });
    expect(r.success).toBe(true);
  });

  it('test_soundId_notAnObjectId_isRejected', () => {
    const r = StoryAudioObjectSchema.safeParse({ ...base, soundId: '../../etc/passwd' });
    expect(r.success).toBe(false);
  });

  it('test_mediaURL_overLimit_isRejected', () => {
    const r = StoryAudioObjectSchema.safeParse({ ...base, mediaURL: 'x'.repeat(2049) });
    expect(r.success).toBe(false);
  });
});

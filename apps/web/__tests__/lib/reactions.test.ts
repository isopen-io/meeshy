import { HEART_EMOJI, isHeartLikedByMe } from '@/lib/reactions';

describe('isHeartLikedByMe', () => {
  it('is true when currentUserReactions contains the heart emoji', () => {
    expect(isHeartLikedByMe({ currentUserReactions: [HEART_EMOJI] })).toBe(true);
  });

  it('is true when isLikedByMe is set even without reactions', () => {
    expect(isHeartLikedByMe({ isLikedByMe: true })).toBe(true);
  });

  it('is false when neither the heart reaction nor isLikedByMe is present', () => {
    expect(isHeartLikedByMe({ currentUserReactions: ['👍'] })).toBe(false);
  });

  it('is false for an empty entity', () => {
    expect(isHeartLikedByMe({})).toBe(false);
  });

  it('tolerates null/undefined currentUserReactions', () => {
    expect(isHeartLikedByMe({ currentUserReactions: null })).toBe(false);
    expect(isHeartLikedByMe({ currentUserReactions: undefined })).toBe(false);
  });
});

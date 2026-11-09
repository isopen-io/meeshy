import { describe, it, expect } from '@jest/globals';
import { repostCommunityId } from '../repostCommunity';

const X = '64b000000000000000000001';
const Y = '64b000000000000000000002';

describe('repostCommunityId (#16892)', () => {
  it('une republication d’une publication réservée à X reste dans X', () => {
    expect(repostCommunityId({ visibility: 'COMMUNITY', communityId: X }, undefined)).toBe(X);
    expect(repostCommunityId({ visibility: 'COMMUNITY', communityId: X }, X)).toBe(X);
  });

  it('refuse de la poser dans une autre communauté', () => {
    expect(() => repostCommunityId({ visibility: 'COMMUNITY', communityId: X }, Y)).toThrow(
      expect.objectContaining({ statusCode: 403, code: 'REPOST_COMMUNITY_MISMATCH' }),
    );
  });

  it('une source publique ou sans communauté garde la communauté demandée', () => {
    expect(repostCommunityId({ visibility: 'PUBLIC', communityId: X }, undefined)).toBeUndefined();
    expect(repostCommunityId({ visibility: 'PUBLIC', communityId: X }, Y)).toBe(Y);
    expect(repostCommunityId({ visibility: 'COMMUNITY', communityId: null }, Y)).toBe(Y);
  });
});

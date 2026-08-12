/**
 * @jest-environment node
 *
 * storyContentEditRequested — the single predicate deciding whether a
 * PUT /posts/:postId payload is a CONTENT edit of a story (→ engagement
 * reset + `engagementReset: true` on the story:updated broadcast) or a
 * metadata-only update (visibility, audience) that must leave views and
 * reactions untouched. Shared by PostService (reset) and the route
 * (broadcast flag) so the two can never diverge.
 */

import { describe, it, expect } from '@jest/globals';
import { storyContentEditRequested } from '../../../services/posts/storyEditPolicy';

describe('storyContentEditRequested', () => {
  it('is true when content is provided (even empty string)', () => {
    expect(storyContentEditRequested({ content: 'new text' })).toBe(true);
    expect(storyContentEditRequested({ content: '' })).toBe(true);
  });

  it('is true when storyEffects is provided (even empty object)', () => {
    expect(storyContentEditRequested({ storyEffects: { textObjects: [] } })).toBe(true);
    expect(storyContentEditRequested({ storyEffects: {} })).toBe(true);
  });

  it('is true when new media is attached', () => {
    expect(storyContentEditRequested({ mediaIds: ['m1'] })).toBe(true);
  });

  it('is false for an empty mediaIds array', () => {
    expect(storyContentEditRequested({ mediaIds: [] })).toBe(false);
  });

  it('is false for a visibility-only update', () => {
    expect(storyContentEditRequested({ visibility: 'FRIENDS', visibilityUserIds: [] })).toBe(false);
  });

  it('is false for an empty payload', () => {
    expect(storyContentEditRequested({})).toBe(false);
  });

  // removeMediaIds alone is deliberately NOT a content edit: the composer
  // always ships a fresh storyEffects blob alongside any media removal, and
  // the service filters foreign ids the route cannot see — keying the reset
  // on removeMediaIds would let the two sides disagree.
  it('is false for removeMediaIds alone', () => {
    expect(storyContentEditRequested({ removeMediaIds: ['m1'] })).toBe(false);
  });
});

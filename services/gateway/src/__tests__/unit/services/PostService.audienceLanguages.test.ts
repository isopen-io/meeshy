/**
 * G3 — pure pins for the shared audience-language resolution used by BOTH
 * story translation pipelines (content + textObjects). Replaces the fixed
 * 10-language list the textObjects pipeline used to fire regardless of who
 * could actually see the story.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PostService } from '../../../services/PostService';

describe('PostService.audienceLanguages', () => {
  it('dedupes and preserves first-seen order', () => {
    expect(PostService.audienceLanguages(['fr', 'es', 'fr', 'pt', 'es']))
      .toEqual(['fr', 'es', 'pt']);
  });

  it('drops the en pivot and empty values', () => {
    expect(PostService.audienceLanguages(['en', null, undefined, '', 'de']))
      .toEqual(['de']);
  });

  it('caps at 10 languages', () => {
    const many = ['fr', 'es', 'de', 'pt', 'ar', 'zh', 'ja', 'ko', 'ru', 'it', 'nl', 'sv'];
    expect(PostService.audienceLanguages(many)).toHaveLength(10);
  });

  it('returns empty for an author without contacts (no ZMQ job fired)', () => {
    expect(PostService.audienceLanguages([])).toEqual([]);
  });
});

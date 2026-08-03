import { describe, it, expect } from '@jest/globals';
import { HashtagService } from '../../../services/HashtagService';

describe('HashtagService.extractHashtags', () => {
  const service = new HashtagService({} as any);

  it('test_extractHashtags_findsASingleHashtag', () => {
    expect(service.extractHashtags('Belle journée #paris aujourd\'hui'))
      .toEqual([{ tag: 'paris', display: '#paris' }]);
  });

  it('test_extractHashtags_lowercasesTheMatchingTagButKeepsDisplayCasing', () => {
    expect(service.extractHashtags('#Paris est belle'))
      .toEqual([{ tag: 'paris', display: '#Paris' }]);
  });

  it('test_extractHashtags_allowsUnicodeLetters', () => {
    expect(service.extractHashtags('#été à #café'))
      .toEqual([{ tag: 'été', display: '#été' }, { tag: 'café', display: '#café' }]);
  });

  it('test_extractHashtags_deduplicatesByTag_firstDisplayWins', () => {
    expect(service.extractHashtags('#Paris et encore #paris'))
      .toEqual([{ tag: 'paris', display: '#Paris' }]);
  });

  it('test_extractHashtags_ignoresHashInsideAWord', () => {
    expect(service.extractHashtags('C#paris')).toEqual([]);
  });

  it('test_extractHashtags_ignoresUrlFragment', () => {
    expect(service.extractHashtags('Voir https://exemple.com/#section'))
      .toEqual([]);
  });

  it('test_extractHashtags_rejectsHyphens_stopsAtTheHyphen', () => {
    expect(service.extractHashtags('#paris-2026'))
      .toEqual([{ tag: 'paris', display: '#paris' }]);
  });

  it('test_extractHashtags_emptyContent_returnsEmpty', () => {
    expect(service.extractHashtags('')).toEqual([]);
  });

  it('test_extractHashtags_tooLong_returnsEmpty', () => {
    expect(service.extractHashtags('#a '.repeat(4000))).toEqual([]);
  });

  it('test_extractHashtags_capsAtMaxHashtagsPerPost', () => {
    const content = Array.from({ length: 40 }, (_, i) => `#tag${i}`).join(' ');
    expect(service.extractHashtags(content)).toHaveLength(30);
  });

  it('test_extractHashtags_singleCharTooShortIsStillValid', () => {
    expect(service.extractHashtags('#a')).toEqual([{ tag: 'a', display: '#a' }]);
  });
});

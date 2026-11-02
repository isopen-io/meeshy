import { describe, it, expect } from 'vitest';
import { STORY_LIMITS, clampStoryText, remainingStoryDuration, storyTextLength } from '../story-limits';

describe('plafonds d\'une story (#13590)', () => {
  it('tient les nombres de la décision porteur', () => {
    expect(STORY_LIMITS).toEqual({
      maxTextCharacters: 1000,
      maxStickersPerScene: 50,
      maxImagesPerScene: 50,
      maxTextsPerScene: 50,
      maxAudiosPerScene: 50,
      maxVideosPerScene: 50,
      maxStoryDurationSeconds: 7200,
    });
  });

  it('coupe un texte à 1000 caractères sans casser un emoji', () => {
    expect(Array.from(clampStoryText('😀'.repeat(1500)))).toHaveLength(1000);
    expect(clampStoryText('court')).toBe('court');
  });

  it('compte en caractères AFFICHÉS : un emoji composé ou un drapeau vaut un, comme iOS et la passerelle', () => {
    expect(storyTextLength('👨‍👩‍👧🇫🇷é')).toBe(3);
    expect(clampStoryText('👨‍👩‍👧'.repeat(1500))).toBe('👨‍👩‍👧'.repeat(1000));
    expect(clampStoryText('a'.repeat(999) + '🇫🇷🇩🇪')).toBe('a'.repeat(999) + '🇫🇷');
  });

  it('ne laisse jamais un reste négatif', () => {
    expect(remainingStoryDuration(5000)).toBe(2200);
    expect(remainingStoryDuration(9000)).toBe(0);
    expect(remainingStoryDuration(Number.NaN)).toBe(7200);
  });
});

import { describe, expect, test } from 'bun:test';

import { STORY_LIMITS } from '@meeshy/shared/utils/story-limits';

import { currentStudioPage, emptyStudioDraft, studioTextRefusal, withAddedText, withText } from './studio';
import { emptyStudioPage } from './studio-page';
import { pagesWithinStoryDuration } from './studio-timeline';

const full = () => {
  let draft = emptyStudioDraft('fr');
  while (currentStudioPage(draft).texts.length < STORY_LIMITS.maxTextsPerScene) draft = withAddedText(draft, 'fr');
  return draft;
};

describe('plafonds d’une story (#13590)', () => {
  test('la scène porte cinquante textes, pas un de plus', () => {
    const draft = full();
    expect(currentStudioPage(draft).texts).toHaveLength(50);
    expect(studioTextRefusal(draft)).toBe('text-max');
    expect(withAddedText(draft, 'fr')).toBe(draft);
  });

  test('sous le plafond, aucun refus', () => {
    expect(studioTextRefusal(emptyStudioDraft('fr'))).toBeNull();
  });

  test('un texte est coupé à mille caractères', () => {
    const draft = emptyStudioDraft('fr');
    const id = currentStudioPage(draft).texts[0]!.id;
    const written = withText(draft, id, 'x'.repeat(1400));
    expect(currentStudioPage(written).texts[0]!.text).toHaveLength(1000);
  });

  test('la story entière tient en deux heures : chaque page ne prend que le reste', () => {
    const page = (id: string, duration: number) => ({ ...emptyStudioPage(id, 'text-1', 'fr'), duration });
    const bounded = pagesWithinStoryDuration([page('a', 5000), page('b', 4000), page('c', 10)]);
    expect(bounded.map((p) => p.duration)).toEqual([5000, 2200, 0]);
  });

  test('rien ne dépasse ⇒ le MÊME tableau', () => {
    const pages = [emptyStudioPage('a', 'text-1', 'fr')];
    expect(pagesWithinStoryDuration(pages)).toBe(pages);
  });
});

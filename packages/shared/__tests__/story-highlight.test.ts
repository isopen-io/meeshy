/**
 * #19394 — les stories « à la une » : ce que l'auteur écrit, et ce que la passerelle sert.
 */
import { describe, it, expect } from 'vitest';
import {
  STORY_HIGHLIGHT_MAX_STORIES,
  STORY_HIGHLIGHT_TITLE_MAX_LENGTH,
  storyHighlightCreateSchema,
  storyHighlightOrderSchema,
  storyHighlightUpdateSchema,
} from '../types/story-highlight.js';

const S1 = '65a0000000000000000000a1';
const S2 = '65a0000000000000000000a2';

describe('#19394 — storyHighlightCreateSchema', () => {
  it('accepte un album nommé, glyphé, avec ses stories, et rogne le titre', () => {
    const parsed = storyHighlightCreateSchema.parse({ title: '  Lisbonne ', glyph: 'map-pin', storyIds: [S1, S2] });
    expect(parsed).toEqual({ title: 'Lisbonne', glyph: 'map-pin', storyIds: [S1, S2] });
  });

  it('refuse un titre vide ou trop long', () => {
    expect(storyHighlightCreateSchema.safeParse({ title: '   ', glyph: 'moon', storyIds: [] }).success).toBe(false);
    expect(
      storyHighlightCreateSchema.safeParse({ title: 'x'.repeat(STORY_HIGHLIGHT_TITLE_MAX_LENGTH + 1), glyph: 'moon', storyIds: [] }).success,
    ).toBe(false);
  });

  it('refuse un glyphe qui n’est pas un nom d’icône', () => {
    expect(storyHighlightCreateSchema.safeParse({ title: 'Nuit', glyph: '<svg>', storyIds: [] }).success).toBe(false);
    expect(storyHighlightCreateSchema.safeParse({ title: 'Nuit', glyph: 'Moon Star', storyIds: [] }).success).toBe(false);
  });

  it('refuse un identifiant de story illisible, un doublon, ou trop de stories', () => {
    expect(storyHighlightCreateSchema.safeParse({ title: 'Nuit', glyph: 'moon', storyIds: ['nope'] }).success).toBe(false);
    expect(storyHighlightCreateSchema.safeParse({ title: 'Nuit', glyph: 'moon', storyIds: [S1, S1] }).success).toBe(false);
    const many = Array.from({ length: STORY_HIGHLIGHT_MAX_STORIES + 1 }, (_, i) => `65a00000000000000000${String(i).padStart(4, '0')}`);
    expect(storyHighlightCreateSchema.safeParse({ title: 'Nuit', glyph: 'moon', storyIds: many }).success).toBe(false);
  });
});

describe('#19394 — storyHighlightUpdateSchema et storyHighlightOrderSchema', () => {
  it('une édition nomme au moins un champ', () => {
    expect(storyHighlightUpdateSchema.safeParse({}).success).toBe(false);
    expect(storyHighlightUpdateSchema.parse({ storyIds: [] })).toEqual({ storyIds: [] });
  });

  it('un ordre nomme chaque album une seule fois', () => {
    expect(storyHighlightOrderSchema.safeParse({ ids: [S1, S1] }).success).toBe(false);
    expect(storyHighlightOrderSchema.parse({ ids: [S2, S1] })).toEqual({ ids: [S2, S1] });
  });
});

import { describe, expect, test } from 'bun:test';

import { CARD_LINKS } from '@/lib/export/message-card-templates';

import { linkSketch, sketchMarks } from './thread-export-link-sketch';

describe('une case du choix de liaison montre la liaison posée (#18809)', () => {
  test('chaque case montre la citation, la réponse et, entre les deux, la marque de sa liaison', () => {
    for (const link of CARD_LINKS) {
      const sketch = linkSketch(link);
      expect(sketch.quote.length).toBeGreaterThan(0);
      expect(sketch.reply.length).toBeGreaterThan(0);
      if (link === 'silence') expect(sketch.link).toEqual([]);
      else if (link === 'bulles') expect(sketchMarks(sketch).some((mark) => mark.kind === 'panel')).toBe(true);
      else expect(sketch.link.length > 0 && sketch.link.every((mark) => mark.ink === 'accent')).toBe(true);
    }
  });

  test('deux liaisons ne se ressemblent jamais', () => {
    const drawn = CARD_LINKS.map((link) => JSON.stringify(linkSketch(link)));
    expect(new Set(drawn).size).toBe(CARD_LINKS.length);
  });
});

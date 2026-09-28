import { describe, expect, test } from 'bun:test';

import { STORY_FONT_FAMILIES } from '@/lib/canvas/story-fonts';

import {
  ALL_TEMPLATE_IDS,
  CARD_LINKS,
  CARD_PALETTE_IDS,
  CARD_STORY_FONTS,
  CARD_TYPEFACE_IDS,
  DEFAULT_TEMPLATE_ID,
  FEATURED_TEMPLATE_IDS,
  canvasFont,
  parseTemplateId,
  randomTemplateId,
  templateFonts,
  templateOf,
} from './message-card-templates';

describe('les templates de carte — des centaines, composés', () => {
  test('chaque famille employée est une police de story embarquée, à la graisse de son fichier', () => {
    for (const [style, font] of Object.entries(CARD_STORY_FONTS)) {
      const embedded = STORY_FONT_FAMILIES[style as keyof typeof STORY_FONT_FAMILIES];
      expect({ family: embedded.css, weight: embedded.weight }).toEqual({ family: font.family, weight: font.weight });
    }
  });

  test('palettes × typographies × liaisons : des centaines d’identifiants, tous distincts', () => {
    expect(ALL_TEMPLATE_IDS.length).toBe(CARD_PALETTE_IDS.length * CARD_TYPEFACE_IDS.length * CARD_LINKS.length);
    expect(ALL_TEMPLATE_IDS.length >= 300).toBe(true);
    expect(new Set(ALL_TEMPLATE_IDS).size).toBe(ALL_TEMPLATE_IDS.length);
  });

  test('plusieurs façons de lier la question à la réponse, pas seulement « ——— ○ ——— »', () => {
    expect(CARD_LINKS.length >= 5).toBe(true);
    expect(CARD_LINKS).toContain('orbite');
    expect(CARD_LINKS).toContain('bulles');
  });

  test('un identifiant se relit en son template, et un identifiant inconnu en rien', () => {
    for (const id of [...FEATURED_TEMPLATE_IDS, DEFAULT_TEMPLATE_ID]) expect(parseTemplateId(id)).toBe(id);
    expect(templateOf('neige.systeme.bulles').link).toBe('bulles');
    expect(parseTemplateId('aurore')).toBeNull();
    expect(parseTemplateId('aurore.rond.orbite.extra')).toBeNull();
    expect(parseTemplateId('toString.rond.orbite')).toBeNull();
    expect(parseTemplateId(42)).toBeNull();
  });

  test('le hasard tire un template qui existe, bornes comprises', () => {
    expect(randomTemplateId(() => 0)).toBe(ALL_TEMPLATE_IDS[0] ?? DEFAULT_TEMPLATE_ID);
    expect(randomTemplateId(() => 0.9999999)).toBe(ALL_TEMPLATE_IDS[ALL_TEMPLATE_IDS.length - 1] ?? DEFAULT_TEMPLATE_ID);
    expect(ALL_TEMPLATE_IDS).toContain(randomTemplateId(() => 0.5));
  });

  test('la peinture attend les polices embarquées du template — et la didone des guillemets', () => {
    expect(templateFonts(templateOf('neige.systeme.orbite'))).toEqual([]);
    expect(templateFonts(templateOf('neige.didone.guillemets')).map((font) => font.family)).toEqual(['Prata']);
    expect(templateFonts(templateOf('aurore.plume.guillemets')).map((font) => font.family)).toEqual(['Caveat', 'Patrick Hand', 'Prata']);
  });

  test('la chaîne de police nomme la famille puis la pile native, jamais un générique seul', () => {
    expect(canvasFont({ family: 'Prata', weight: 400, style: 'normal' }, 40.4)).toBe(
      '400 40px "Prata", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    );
    expect(canvasFont({ family: null, weight: 600, style: 'italic' }, 30).startsWith('italic 600 30px -apple-system')).toBe(true);
  });
});

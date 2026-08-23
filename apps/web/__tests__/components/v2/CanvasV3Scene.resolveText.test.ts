/**
 * Prisme par objet (Canvas V3) — résolution de texte robuste à la forme du code
 * de langue. `resolveText`/`translationFor` parcourent les langues du lecteur DANS
 * L'ORDRE ; la première servie gagne, par une traduction ou parce que l'objet est
 * déjà écrit dans cette langue. La comparaison passait par `split('-')[0]`, qui ne
 * réduit ni le séparateur `_`, ni les codes ISO 639-2/3, ni les alias dépréciés —
 * une clé de traduction ou une `locale` sous forme divergente était manquée.
 * SSOT : normalizeLanguageForDedup (packages/shared/utils/language-normalize.ts).
 */
import type { ObjectV3 } from '@meeshy/shared/types/canvas-v3';
import { resolveText, translationFor } from '@/components/v2/CanvasV3Scene';

const textObject = (
  payload: Record<string, unknown>,
  locale?: string,
): ObjectV3 =>
  ({
    id: 'o1',
    kind: 'text',
    anchor: { t: 'free', at: { x: 0.5, y: 0.5 } },
    plane: 'content',
    z: 0,
    transform: { scale: 1, rotation: 0, opacity: 1 },
    locale,
    payload,
  }) as unknown as ObjectV3;

describe('translationFor — canonicalisation des clés de traduction', () => {
  it('matche une clé région-taguée séparée par underscore (fr_FR) pour une préférence fr', () => {
    const table = { fr_FR: 'Bonjour' } as Record<string, unknown>;
    expect(translationFor(table, 'fr')).toBe('Bonjour');
  });

  it('matche une clé 3-lettres (fra) pour une préférence fr', () => {
    const table = { fra: 'Bonjour' } as Record<string, unknown>;
    expect(translationFor(table, 'fr')).toBe('Bonjour');
  });

  it('matche une clé legacy (iw) pour une préférence he', () => {
    const table = { iw: 'שלום' } as Record<string, unknown>;
    expect(translationFor(table, 'he')).toBe('שלום');
  });

  it('ne matche jamais deux langues distinctes (fil ≠ fi)', () => {
    const table = { fil: 'Kumusta' } as Record<string, unknown>;
    expect(translationFor(table, 'fi')).toBeUndefined();
  });
});

describe('resolveText — Prisme robuste à la forme du code', () => {
  it('sert la traduction de la langue primaire quand elle est keyée sous une forme taguée', () => {
    const o = textObject({ text: 'Hello', translations: { 'fr-FR': 'Bonjour' } });
    expect(resolveText(o, ['fr'])).toBe('Bonjour');
  });

  it("montre l'original quand la langue primaire du lecteur EST la langue de l'objet, même sous forme divergente", () => {
    // Prisme : `fr_FR` (rang 1) est la langue de l'objet (locale `fr`) ⇒ ORIGINAL,
    // jamais la traduction anglaise de rang inférieur. `split('-')` ratait ce rang.
    const o = textObject({ text: 'Bonjour', translations: { en: 'Hello' } }, 'fr_FR');
    expect(resolveText(o, ['fr_FR', 'en'])).toBe('Bonjour');
  });

  it("parcourt les langues dans l'ordre : la primaire traduite gagne sur la secondaire d'origine", () => {
    const o = textObject({ text: 'Hello', translations: { fra: 'Bonjour' } }, 'en');
    expect(resolveText(o, ['fr', 'en'])).toBe('Bonjour');
  });

  it("retombe sur l'original quand aucune langue du lecteur n'est servie", () => {
    const o = textObject({ text: 'Hello', translations: { de: 'Hallo' } }, 'en');
    expect(resolveText(o, ['fi'])).toBe('Hello');
  });
});

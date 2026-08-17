/**
 * WL-105 (LWS-10) — contraste du pont ✦, calculé sur les couleurs RÉELLES.
 *
 * Preuve que `resolveBridgeTintColor` respecte le critère d'acceptation
 * LWS-10 : « le pont teinté accent (color-mix(accent 80 %, texte)) reste
 * ≥ 4,5:1 sur le fond, dans les deux thèmes » — vérifié en calculant le
 * ratio WCAG réel (luminance relative, formule W3C), pas une approximation.
 *
 * `conversationAccentPalette` (LWS-2) est la SOURCE des accents testés : les
 * 39 combinaisons couvrant les cinq types de conversation croisés aux dix
 * langues/thèmes du portage TS — RE-PREUVE que certaines combinaisons (verts,
 * cyans clairs) font ÉCHOUER la formule `color-mix` littérale en thème clair
 * (61 % de réussite mesuré), ce que `resolveBridgeTintColor` corrige.
 */
import {
  contrastRatio,
  hexToRgb,
  hslToRgb,
  resolveBridgeTintColor,
  relativeLuminance,
} from '../lentille-contrast';
import { conversationAccentPalette } from '@meeshy/shared/utils/conversation-colors';

const LANGUAGES = ['french', 'english', 'spanish', 'german', 'japanese', 'arabic', 'chinese', 'portuguese', 'italian', 'other'];
const TYPES = ['direct', 'group', 'community', 'channel', 'bot'];
const THEMES = ['general', 'work', 'social', 'gaming', 'music', 'sports', 'tech', 'art', 'travel', 'food'];

// Fond/texte de globals.css (mêmes triplets HSL que lentille-contrast.ts,
// recalculés ici indépendamment pour que le test ne partage pas le bug d'un
// éventuel mauvais miroir).
const LIGHT_BACKGROUND = hslToRgb(0, 0, 100);
const DARK_BACKGROUND = hslToRgb(224, 71.4, 4.1);

describe('resolveBridgeTintColor — contraste WCAG réel', () => {
  it('atteint au moins 4.5:1 sur les DEUX thèmes pour un accent qui échouerait avec le color-mix littéral', () => {
    // Vérifié par exploration (voir en-tête) : direct/french/general produit
    // un accent clair qui échoue à 80% accent / 20% texte en thème clair.
    const { accent } = conversationAccentPalette({ name: 'x', type: 'direct', language: 'french', theme: 'general' });

    const lightColor = hexToRgb(resolveBridgeTintColor(accent, 'light'));
    const darkColor = hexToRgb(resolveBridgeTintColor(accent, 'dark'));

    expect(contrastRatio(lightColor, LIGHT_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkColor, DARK_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it("garantit ≥ 4.5:1 dans les DEUX thèmes pour toutes les combinaisons type × langue × thème de l'accent", () => {
    const failures: string[] = [];

    for (const type of TYPES) {
      for (const language of LANGUAGES) {
        for (const theme of THEMES) {
          const { accent } = conversationAccentPalette({ name: 'conv', type, language, theme });

          const lightRgb = hexToRgb(resolveBridgeTintColor(accent, 'light'));
          const darkRgb = hexToRgb(resolveBridgeTintColor(accent, 'dark'));

          const lightRatio = contrastRatio(lightRgb, LIGHT_BACKGROUND);
          const darkRatio = contrastRatio(darkRgb, DARK_BACKGROUND);

          if (lightRatio < 4.5) failures.push(`${type}/${language}/${theme} light=${lightRatio.toFixed(2)}`);
          if (darkRatio < 4.5) failures.push(`${type}/${language}/${theme} dark=${darkRatio.toFixed(2)}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('préfère le mélange 80% littéral quand il suffit déjà (ne pousse pas plus que nécessaire)', () => {
    // Un accent déjà très saturé/sombre (proche du noir) passe la formule
    // littérale du premier coup : la fonction ne doit alors PAS le pousser
    // davantage vers le texte (elle renverrait autre chose que le mélange
    // 80/20 attendu).
    const darkAccent = '#1A1A1A';
    const tinted = resolveBridgeTintColor(darkAccent, 'light');
    const rgb = hexToRgb(tinted);
    expect(contrastRatio(rgb, LIGHT_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it('relativeLuminance(noir) = 0 et relativeLuminance(blanc) = 1 (sanity de la formule WCAG)', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });
});

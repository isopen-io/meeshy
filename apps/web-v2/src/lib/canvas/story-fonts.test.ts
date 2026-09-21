import { describe, expect, test } from 'bun:test';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { STORY_FONT_FAMILIES, STORY_FONT_STYLES, storyFontStack } from './story-fonts';

const HERE = new URL('.', import.meta.url).pathname;
const STYLES_DIR = join(HERE, '..', '..', 'styles');
/** Les COMMENTAIRES d'abord : la prose de cette feuille cite `@font-face` pour
 * l'expliquer, et un témoin qui découpe le fichier brut mesure alors son
 * propre en-tête — le premier bloc rendu était le doc-comment. */
const SHEET = readFileSync(join(STYLES_DIR, 'story-fonts.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Un bloc `@font-face` par famille — découpé comme le navigateur le lit. */
const FACES = SHEET.split('@font-face').slice(1);

describe('les treize familles d’iOS qui exigent une police embarquée', () => {
  test('la table nomme les TREIZE familles que la police système ne sait pas rendre', () => {
    expect([...STORY_FONT_STYLES]).toEqual([
      'handwriting',
      'calligraphy',
      'cartoon',
      'futuristic',
      'fantasy',
      'curve',
      'tag',
      'retro',
      'elegant',
      'poster',
      'bubble',
      'note',
      'brush',
    ]);
  });

  test('chaque famille cite le nom PostScript d’iOS qu’elle remplace', () => {
    // `StoryTextStyle.fontName` — packages/MeeshySDK/…/Story/StoryTextStyle.swift.
    expect(Object.fromEntries(STORY_FONT_STYLES.map((s) => [s, STORY_FONT_FAMILIES[s].ios]))).toEqual({
      handwriting: 'SnellRoundhand',
      calligraphy: 'Zapfino',
      cartoon: 'ChalkboardSE-Bold',
      futuristic: 'Futura-CondensedExtraBold',
      fantasy: 'Papyrus',
      curve: 'SavoyeLetPlain',
      tag: 'MarkerFelt-Wide',
      retro: 'AmericanTypewriter',
      elegant: 'Didot',
      poster: 'AvenirNextCondensed-Heavy',
      bubble: 'ArialRoundedMTBold',
      note: 'Noteworthy-Bold',
      brush: 'BradleyHandITCTT-Bold',
    });
  });

  /**
   * LE CLIQUET, AU NIVEAU DE LA SOURCE (#6951) — `budgets.json` borne la SOMME
   * dans le `dist/` ; ici chaque fichier porte sa propre mesure. Remplacer une
   * police sans rouvrir ce nombre est impossible : c'est ce qui rend le poids
   * d'une famille une DÉCISION, jamais une dérive.
   */
  test('chaque fichier pèse EXACTEMENT ce que la table déclare', () => {
    const mesure = Object.fromEntries(
      STORY_FONT_STYLES.map((s) => [s, statSync(join(STYLES_DIR, 'fonts', STORY_FONT_FAMILIES[s].file)).size]),
    );
    const declare = Object.fromEntries(STORY_FONT_STYLES.map((s) => [s, STORY_FONT_FAMILIES[s].bytes]));
    expect(mesure).toEqual(declare);
  });

  test('la feuille déclare une face par famille, et pas une de plus', () => {
    expect(FACES.length).toBe(STORY_FONT_STYLES.length);
  });

  test('chaque face nomme sa famille, son fichier et la graisse que le fichier porte', () => {
    for (const style of STORY_FONT_STYLES) {
      const { css, file, weight } = STORY_FONT_FAMILIES[style];
      const faces = FACES.filter((f) => f.includes(`font-family: '${css}'`));
      expect({ style, faces: faces.length }).toEqual({ style, faces: 1 });
      expect(faces[0]).toContain(`fonts/${file}`);
      expect(faces[0]).toContain(`font-weight: ${weight};`);
    }
  });

  /**
   * LA QUESTION QUI DÉCIDE (#6951) — une famille dont le fichier n'a pas chargé
   * doit rendre la police SYSTÈME, jamais un faux-semblant. `swap` peint le
   * texte tout de suite dans la pile native puis échange ; `block` laisserait
   * le texte INVISIBLE jusqu'à trois secondes, `optional` renoncerait à la
   * police pour toute la première visite.
   */
  test('chaque face échange plutôt que de masquer le texte', () => {
    for (const face of FACES) expect(face).toContain('font-display: swap;');
  });

  /**
   * SANS `unicode-range`, le navigateur TÉLÉCHARGE la police pour un texte
   * qu'elle ne sait pas écrire — une story en arabe paierait 25 Ko pour afficher
   * des tofus. Avec, elle ne part que si un caractère la concerne.
   */
  test('chaque face borne les caractères qu’elle sert', () => {
    for (const face of FACES) expect(face).toContain('unicode-range: U+0000-00FF');
  });

  /**
   * LE REPLI N'A PAS LE DROIT DE MENTIR : derrière la famille il y a la pile
   * NATIVE, jamais `cursive`, `fantasy` ou `serif` — un générique rendrait une
   * police d'allure voisine et ferait croire que le fichier a chargé.
   */
  test('le repli d’une famille est la police système, jamais un générique', () => {
    for (const style of STORY_FONT_STYLES) {
      expect(storyFontStack(style)).toBe(`'${STORY_FONT_FAMILIES[style].css}', var(--font-native)`);
    }
  });

  test('aucune famille ne remplace une autre : treize substituts distincts', () => {
    const noms = STORY_FONT_STYLES.map((s) => STORY_FONT_FAMILIES[s].css);
    expect(new Set(noms).size).toBe(noms.length);
  });

  test('chaque substitut est redistribuable', () => {
    for (const style of STORY_FONT_STYLES) {
      expect(['OFL-1.1', 'Apache-2.0']).toContain(STORY_FONT_FAMILIES[style].licence);
    }
  });
});

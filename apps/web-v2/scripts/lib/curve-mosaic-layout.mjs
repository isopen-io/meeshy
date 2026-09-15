import { readFileSync } from 'node:fs';

/**
 * PARTIE 12 — L'AGENCEMENT D'UNE PUBLICATION (#6514). `src/lib/feed/mosaic-layout.ts`
 * DÉRIVE trois sources, jamais importées (du Swift, et un schéma zod qu'on ne
 * fait pas entrer dans le bundle pour cinq chaînes) :
 *
 *  - `MosaicLayoutMode` et son défaut (`CanvasV3.swift`), et le schéma du fil
 *    (`MosaicLayoutModeSchema`, `packages/shared/types/canvas-v3.ts`) — les
 *    cinq valeurs brutes que les trois clients lisent ;
 *  - la géométrie `MosaicLayout` (`MosaicLayout.swift`) — plafond, gouttière,
 *    rapports de boîte, cotes des quatre mosaïques, budgets de légende ;
 *  - le rendu `PostSceneMosaic.swift` — voile et chiffre du « +N », rayon d'une
 *    tuile.
 *
 * Plusieurs cotes Swift sont des `let` LOCAUX d'une fonction (`large` dans
 * `hero`, `largeur` dans `reel`, `hauteur` dans `sine`) : chacune est lue dans
 * le CORPS de sa fonction, sans quoi `largeur` attraperait celle de `wave`,
 * déclarée plus haut. Rend ses défauts ; l'hôte reste le seul à les imprimer
 * (motif PARTIE 11, `curve-media-grid.mjs`).
 */
export const MOSAIC_LAYOUT_COTES = 19;

export function mosaicLayoutCurveFailures({ root, count }) {
  const failures = [];
  const canvasSwift = readFileSync(`${root}packages/MeeshySDK/Sources/MeeshySDK/Models/CanvasV3.swift`, 'utf8');
  const layoutSwift = readFileSync(`${root}packages/MeeshySDK/Sources/MeeshyUI/Story/MosaicLayout.swift`, 'utf8');
  const mosaicSwift = readFileSync(`${root}apps/ios/Meeshy/Features/Main/Views/PostSceneMosaic.swift`, 'utf8');
  const sharedSchema = readFileSync(`${root}packages/shared/types/canvas-v3.ts`, 'utf8');
  const derived = readFileSync(`${root}apps/web-v2/src/lib/feed/mosaic-layout.ts`, 'utf8');

  const first = (text, pattern) => {
    const m = pattern.exec(text);
    return m === null ? null : m[1];
  };
  const numberOf = (text, pattern) => {
    const raw = first(text, pattern);
    return raw === null ? null : Number(raw);
  };
  const swiftNumber = (text, name) => numberOf(text, new RegExp(`\\b${name}\\s*(?::\\s*\\w+\\s*)?=\\s*(-?[0-9.]+)`));
  const swiftFunction = (name) => {
    const start = layoutSwift.indexOf(`static func ${name}(`);
    if (start < 0) return '';
    const next = layoutSwift.indexOf('static func', start + 1);
    return layoutSwift.slice(start, next < 0 ? undefined : next);
  };

  const check = (what, swiftValue, derivedValue) => {
    if (swiftValue === null) failures.push(`${what} : introuvable côté source`);
    else if (derivedValue === null) failures.push(`${what} : introuvable côté dérivé`);
    else if (swiftValue !== derivedValue) failures.push(`${what} : source ${swiftValue}, dérivée ${derivedValue}`);
  };
  const sameSet = (what, source, target) => {
    if (source.length === 0) failures.push(`${what} : introuvable côté source`);
    else if (target.length === 0) failures.push(`${what} : introuvable côté dérivé`);
    else if ([...source].sort().join(',') !== [...target].sort().join(','))
      failures.push(`${what} : source [${source.join(', ')}], dérivée [${target.join(', ')}]`);
  };
  const quoted = (list) => [...(list ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);

  // --- Les cinq valeurs brutes et le défaut ---
  const enumBlock = /enum MosaicLayoutMode\b[\s\S]*?static let fallback/.exec(canvasSwift)?.[0] ?? '';
  const swiftModes = [...enumBlock.matchAll(/^\s*case (\w+)\s*$/gm)].map((m) => m[1]);
  const derivedModes = quoted(first(derived, /MOSAIC_LAYOUT_MODES = \[([^\]]*)\]/));
  sameSet('agencement : valeurs de MosaicLayoutMode (CanvasV3.swift)', swiftModes, derivedModes);
  sameSet('agencement : valeurs de MosaicLayoutModeSchema (canvas-v3.ts)', quoted(first(sharedSchema, /MosaicLayoutModeSchema = z\.enum\(\[([^\]]*)\]\)/)), derivedModes);
  check(
    'agencement : défaut (MosaicLayoutMode.fallback)',
    first(canvasSwift, /static let fallback: MosaicLayoutMode = \.(\w+)/),
    first(derived, /MOSAIC_FALLBACK_LAYOUT: MosaicLayoutMode = '(\w+)'/),
  );

  // --- La géométrie ---
  check('mosaïque : plafond de tuiles (maxVisible)', swiftNumber(layoutSwift, 'maxVisible'), count(derived, 'MOSAIC_MAX_VISIBLE'));
  check('mosaïque : gouttière (gutter)', swiftNumber(layoutSwift, 'gutter'), count(derived, 'MOSAIC_GUTTER'));
  const ratios = /ASPECT_RATIOS[^{]*\{[^}]*\}/.exec(derived)?.[0] ?? '';
  for (const mode of ['wave', 'hero', 'reel', 'sine']) {
    check(
      `mosaïque : rapport de boîte de « ${mode} » (aspectRatio)`,
      numberOf(layoutSwift, new RegExp(`case \\.${mode}: return (-?[0-9.]+)`)),
      count(ratios, mode),
    );
  }
  check('hero : largeur de la grande tuile (large)', swiftNumber(swiftFunction('hero'), 'large'), count(derived, 'HERO_LARGE_WIDTH'));
  check('vague : hauteur d’un creux', numberOf(swiftFunction('wave'), /creux \? ([0-9.]+) : 1\.0/), count(derived, 'WAVE_HOLLOW_HEIGHT'));
  check('défilement : largeur d’une tuile (largeur)', swiftNumber(swiftFunction('reel'), 'largeur'), count(derived, 'REEL_TILE_WIDTH'));
  check('sinusoïde : hauteur d’une tuile (hauteur)', swiftNumber(swiftFunction('sine'), 'hauteur'), count(derived, 'SINE_TILE_HEIGHT'));

  // --- La légende ---
  check('légende : budget plein (fullCaptionWords)', swiftNumber(layoutSwift, 'fullCaptionWords'), count(derived, 'FULL_CAPTION_WORDS'));
  check('légende : budget d’une mosaïque', numberOf(layoutSwift, /case \.wave, \.hero, \.sine: return ([0-9]+)/), count(derived, 'MOSAIC_CAPTION_WORDS'));
  check('légende : plancher (captionWordFloor)', swiftNumber(layoutSwift, 'captionWordFloor'), count(derived, 'CAPTION_WORD_FLOOR'));

  // --- Le rendu (PostSceneMosaic.swift) ---
  check(
    '« +N » : opacité du voile (report)',
    numberOf(mosaicSwift, /Rectangle\(\)\.fill\(\.black\.opacity\(([0-9.]+)\)\)\s*Text\("\+/),
    count(derived, 'MOSAIC_OVERFLOW_VEIL_OPACITY'),
  );
  check(
    '« +N » : chiffre en .title2 (22 pt au corps par défaut)',
    /Text\("\+\\\(tuile\.overflow\)"\)\s*\.font\(\.title2\.weight\(\.bold\)\)/.test(mosaicSwift) ? 22 : null,
    count(derived, 'MOSAIC_OVERFLOW_LABEL_SIZE'),
  );
  check(
    'tuile : rayon (clipShape de vignette)',
    numberOf(mosaicSwift, /\.clipShape\(RoundedRectangle\(cornerRadius: ([0-9.]+)\)\)\s*\.overlay\(alignment: \.center\) \{ report\(/),
    count(derived, 'MOSAIC_TILE_RADIUS'),
  );

  return failures;
}

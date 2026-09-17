import { readFileSync } from 'node:fs';

/**
 * PARTIE 14 — LE PLATEAU ET L'IMAGE SEULE DU LECTEUR DE STORY (#6899). Trois
 * fichiers web DÉRIVENT des cotes Swift, jamais importées (le SDK est du
 * Swift) : `lib/stories/framing.ts` (le plateau, `readerCanvasFraming`, et le
 * fond flou, `storyBlurredBackdrop`), `lib/stories/letterbox.ts`
 * (`StoryLetterboxFill`) et `lib/stories/image-only.ts`
 * (`StoryImageOnlyPresentation`). Même dispositif que `curve-scene-framing.mjs`
 * (PARTIE 13) : extraction textuelle par regex, comparaison des VALEURS.
 */
export const STORY_READER_COTES = 11;

export function storyReaderCurveFailures({ root }) {
  const failures = [];
  const read = (path) => readFileSync(`${root}${path}`, 'utf8');
  const canvas = read('apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift');
  const letterboxSwift = read('packages/MeeshySDK/Sources/MeeshySDK/Story/StoryLetterboxFill.swift');
  const imageOnlySwift = read('packages/MeeshySDK/Sources/MeeshySDK/Story/StoryImageOnlyPresentation.swift');
  const framing = read('apps/web-v2/src/lib/stories/framing.ts');
  const letterbox = read('apps/web-v2/src/lib/stories/letterbox.ts');
  const imageOnly = read('apps/web-v2/src/lib/stories/image-only.ts');

  const first = (pattern, text) => {
    const m = pattern.exec(text);
    return m === null ? null : Number(m[1]);
  };
  const constant = (name, text) => first(new RegExp(`\\b${name}\\s*=\\s*(-?[0-9.]+)`), text);
  const check = (what, swiftValue, derivedValue) => {
    if (swiftValue === null) failures.push(`${what} : introuvable côté source (Swift)`);
    else if (derivedValue === null) failures.push(`${what} : introuvable côté dérivé (web-v2)`);
    else if (Math.abs(swiftValue - derivedValue) > 1e-9) failures.push(`${what} : source ${swiftValue}, dérivée ${derivedValue}`);
  };

  // `readerCanvasFraming` — les quatre cotes du plateau, dans l'appel
  // `StoryCanvasFraming.resolve(.init(…))` qu'il pose.
  const plateauStart = canvas.indexOf('var readerCanvasFraming');
  const plateau = plateauStart < 0 ? '' : canvas.slice(plateauStart, plateauStart + 2400);
  check('plateau — en-tête (headerInset: topInset + …)', first(/headerInset:\s*topInset\s*\+\s*([0-9.]+)/, plateau), constant('READER_HEADER_INSET', framing));
  check('plateau — bas (bottomInset)', first(/bottomInset:\s*([0-9.]+)/, plateau), constant('READER_BOTTOM_INSET', framing));
  check('plateau — côtés (sideInset)', first(/sideInset:\s*([0-9.]+)/, plateau), constant('READER_SIDE_INSET', framing));
  check('plateau — coins (cardedCornerRadius)', first(/cardedCornerRadius:\s*([0-9.]+)/, plateau), constant('READER_CARD_CORNER_RADIUS', framing));

  // `storyBlurredBackdrop(for:)` — le fond flou plein écran, borné à sa
  // fonction : d'autres `.blur`/`.opacity` vivent dans le même fichier.
  const backdropStart = canvas.indexOf('func storyBlurredBackdrop');
  const backdropEnd = canvas.indexOf('func resolvedBackdropImage');
  const backdrop = backdropStart < 0 || backdropEnd < backdropStart ? '' : canvas.slice(backdropStart, backdropEnd);
  check('fond flou — rayon (.blur(radius:))', first(/\.blur\(radius:\s*([0-9.]+)\)/, backdrop), constant('READER_BACKDROP_BLUR', framing));
  check('fond flou — échelle (.scaleEffect)', first(/\.scaleEffect\(([0-9.]+)\)/, backdrop), constant('READER_BACKDROP_SCALE', framing));
  check('fond flou — opacité (.opacity)', first(/\.opacity\(([0-9.]+)\)/, backdrop), constant('READER_BACKDROP_OPACITY', framing));

  check('bande — seuil (minimumBandPoints)', first(/minimumBandPoints:\s*CGFloat\s*=\s*([0-9.]+)/, letterboxSwift), constant('LETTERBOX_MINIMUM_BAND', letterbox));
  check('bande — opacité (fillOpacity)', first(/fillOpacity:\s*Float\s*=\s*([0-9.]+)/, letterboxSwift), constant('LETTERBOX_FILL_OPACITY', letterbox));

  check('image seule — tolérance de débord (overflowTolerance)', first(/overflowTolerance:\s*CGFloat\s*=\s*([0-9.]+)/, imageOnlySwift), constant('OVERFLOW_TOLERANCE', imageOnly));
  check(
    'image seule — fond « tourné » (backgroundRotationTolerance)',
    first(/backgroundRotationTolerance:\s*Double\s*=\s*([0-9.]+)/, imageOnlySwift),
    constant('BACKGROUND_ROTATION_TOLERANCE', imageOnly),
  );

  return failures;
}

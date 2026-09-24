import { readFileSync } from 'node:fs';

/**
 * PARTIE 14 — LE PLATEAU DU LECTEUR DE STORY (#6899, réaligné par #6904).
 * Deux fichiers web DÉRIVENT des cotes Swift, jamais importées (le SDK est
 * du Swift) : `lib/stories/framing.ts` (le plateau, `readerCanvasFraming`,
 * et le sol flou, `SceneFloorView`) et `lib/stories/letterbox.ts`
 * (`StoryLetterboxFill`). Même dispositif que `curve-scene-framing.mjs`
 * (PARTIE 13) : extraction textuelle par regex, comparaison des VALEURS.
 *
 * Depuis #6904 (lot « une scène a UNE forme »), trois cotes ont changé de
 * MAISON sans changer de valeur, et ce gate lit chacune là où elle habite :
 * le rayon de la carte cadrée est la loi `SceneShape.cardedCornerRadius`
 * (le plateau iOS ne porte plus un nombre mais une référence à la loi) ; le
 * sol flou — rayon, échelle, opacité — vit dans `SceneFloorView`, le
 * composant que la story, la galerie et le réel partagent (le lecteur n'a
 * plus de `storyBlurredBackdrop` à lui).
 *
 * `lib/stories/image-only.ts` n'a PLUS de source Swift : iOS a retiré
 * `StoryImageOnlyPresentation` comme API sans appelant (e59e4b0247, #6904) —
 * elle n'était déjà câblée nulle part quand ce gate est né. Ses deux
 * tolérances sont donc une loi WEB, gardée par `image-only.test.ts`, et non
 * plus une dérivation ; ce que web-v2 doit en faire est une question de
 * parité ouverte à part, pas une cote à lire ici.
 */
export const STORY_READER_COTES = 9;

export function storyReaderCurveFailures({ root }) {
  const failures = [];
  const read = (path) => readFileSync(`${root}${path}`, 'utf8');
  const canvas = read('apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift');
  const sceneShape = read('packages/MeeshySDK/Sources/MeeshySDK/Story/SceneShape.swift');
  const sceneFloor = read('packages/MeeshySDK/Sources/MeeshyUI/Story/ScenePlayer/SceneFloorView.swift');
  const letterboxSwift = read('packages/MeeshySDK/Sources/MeeshySDK/Story/StoryLetterboxFill.swift');
  const framing = read('apps/web/src/lib/stories/framing.ts');
  const letterbox = read('apps/web/src/lib/stories/letterbox.ts');

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

  // `readerCanvasFraming` — les trois marges du plateau, dans l'appel
  // `StoryCanvasFraming.resolve(.init(…))` qu'il pose.
  const plateauStart = canvas.indexOf('var readerCanvasFraming');
  const plateau = plateauStart < 0 ? '' : canvas.slice(plateauStart, plateauStart + 2400);
  check('plateau — en-tête (headerInset: topInset + …)', first(/headerInset:\s*topInset\s*\+\s*([0-9.]+)/, plateau), constant('READER_HEADER_INSET', framing));
  check('plateau — bas (bottomInset)', first(/bottomInset:\s*([0-9.]+)/, plateau), constant('READER_BOTTOM_INSET', framing));
  check('plateau — côtés (sideInset)', first(/sideInset:\s*([0-9.]+)/, plateau), constant('READER_SIDE_INSET', framing));

  // Le rayon de la carte cadrée est la LOI `SceneShape.cardedCornerRadius`,
  // que le plateau iOS cite au lieu d'écrire un nombre : on exige la citation
  // dans le plateau, et on lit la valeur dans la loi.
  if (!/cardedCornerRadius:\s*SceneShape\.cardedCornerRadius/.test(plateau)) {
    failures.push('plateau — coins : `readerCanvasFraming` ne cite pas `SceneShape.cardedCornerRadius` (un nombre écrit à la main y diverge en silence)');
  }
  check('plateau — coins (SceneShape.cardedCornerRadius)', first(/cardedCornerRadius:\s*CGFloat\s*=\s*([0-9.]+)/, sceneShape), constant('READER_CARD_CORNER_RADIUS', framing));

  // `SceneFloorView` — le sol flou plein écran, partagé par la story, la
  // galerie et le réel ; ses trois cotes sont des constantes nommées.
  check('sol flou — rayon (SceneFloorView.blurRadius)', first(/blurRadius:\s*CGFloat\s*=\s*([0-9.]+)/, sceneFloor), constant('READER_BACKDROP_BLUR', framing));
  check('sol flou — échelle (SceneFloorView.scale)', first(/\bscale:\s*CGFloat\s*=\s*([0-9.]+)/, sceneFloor), constant('READER_BACKDROP_SCALE', framing));
  check('sol flou — opacité (SceneFloorView.opacity)', first(/\bopacity:\s*Double\s*=\s*([0-9.]+)/, sceneFloor), constant('READER_BACKDROP_OPACITY', framing));

  check('bande — seuil (minimumBandPoints)', first(/minimumBandPoints:\s*CGFloat\s*=\s*([0-9.]+)/, letterboxSwift), constant('LETTERBOX_MINIMUM_BAND', letterbox));
  check('bande — opacité (fillOpacity)', first(/fillOpacity:\s*Float\s*=\s*([0-9.]+)/, letterboxSwift), constant('LETTERBOX_FILL_OPACITY', letterbox));

  return failures;
}

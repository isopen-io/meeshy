import { readFileSync } from 'node:fs';

/**
 * PARTIE 13 — LE CADRAGE D'UNE SCÈNE DE FIL (#6898). `src/lib/feed/
 * scene-framing.ts` DÉRIVE `SceneFraming.swift`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Story/SceneFraming.swift`) — sept
 * cotes, jamais importées (le SDK est du Swift). Même dispositif que
 * `curve-mosaic-layout.mjs` (PARTIE 12) : extraction textuelle par regex,
 * comparaison des VALEURS.
 */
export const SCENE_FRAMING_COTES = 7;

export function sceneFramingCurveFailures({ root }) {
  const failures = [];
  const swift = readFileSync(`${root}packages/MeeshySDK/Sources/MeeshyUI/Story/SceneFraming.swift`, 'utf8');
  const derived = readFileSync(`${root}apps/web-v2/src/lib/feed/scene-framing.ts`, 'utf8');

  const swiftNumber = (name) => {
    const m = new RegExp(`\\b${name}\\s*:\\s*CGFloat\\s*=\\s*(-?[0-9.]+)`).exec(swift);
    return m === null ? null : Number(m[1]);
  };
  const derivedNumber = (name) => {
    const m = new RegExp(`\\b${name}\\s*=\\s*(-?[0-9.]+)`).exec(derived);
    return m === null ? null : Number(m[1]);
  };
  const check = (what, swiftValue, derivedValue) => {
    if (swiftValue === null) failures.push(`${what} : introuvable côté source (SceneFraming.swift)`);
    else if (derivedValue === null) failures.push(`${what} : introuvable côté dérivé (scene-framing.ts)`);
    else if (Math.abs(swiftValue - derivedValue) > 1e-9) failures.push(`${what} : source ${swiftValue}, dérivée ${derivedValue}`);
  };

  // `sceneAspect: CGFloat = 9.0 / 16.0` — une DIVISION, pas un littéral : les
  // deux côtés s'écrivent en division pour que 9/16 ne soit jamais arrondi.
  const swiftAspect = /sceneAspect:\s*CGFloat\s*=\s*([0-9.]+)\s*\/\s*([0-9.]+)/.exec(swift);
  const derivedAspect = /SCENE_ASPECT\s*=\s*([0-9.]+)\s*\/\s*([0-9.]+)/.exec(derived);
  if (swiftAspect === null) failures.push('sceneAspect : introuvable côté source (attendu une DIVISION, ex. 9.0 / 16.0)');
  else if (derivedAspect === null) failures.push('SCENE_ASPECT : introuvable côté dérivé (attendu une DIVISION, ex. 9 / 16)');
  else {
    const s = Number(swiftAspect[1]) / Number(swiftAspect[2]);
    const d = Number(derivedAspect[1]) / Number(derivedAspect[2]);
    if (Math.abs(s - d) > 1e-9) failures.push(`sceneAspect : source ${s}, dérivée ${d}`);
  }

  check('marge d’objet (objectPadding)', swiftNumber('objectPadding'), derivedNumber('OBJECT_PADDING'));
  check('côté plancher (minimumSide)', swiftNumber('minimumSide'), derivedNumber('MINIMUM_SIDE'));
  check('bande — haut (bandTopY)', swiftNumber('bandTopY'), derivedNumber('BAND_TOP_Y'));
  check('bande — bas (bandBottomY)', swiftNumber('bandBottomY'), derivedNumber('BAND_BOTTOM_Y'));
  check('plafond de hauteur (maxCardHeightRatio)', swiftNumber('maxCardHeightRatio'), derivedNumber('MAX_CARD_HEIGHT_RATIO'));

  // `guard resultat.height < 0.999 else { return nil }` — un littéral INLINE,
  // pas une constante nommée côté Swift (le seuil « couvre tout »).
  const swiftThreshold = /resultat\.height\s*<\s*([0-9.]+)/.exec(swift);
  const derivedThreshold = derivedNumber('FULL_HEIGHT_THRESHOLD');
  check('seuil « couvre tout » (focus, hauteur < …)', swiftThreshold === null ? null : Number(swiftThreshold[1]), derivedThreshold);

  return failures;
}

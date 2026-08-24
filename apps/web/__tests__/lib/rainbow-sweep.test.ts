import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RAINBOW_SWEEP } from '@/lib/rainbow-sweep';

/**
 * Garde jumelle du `rainbow` — iOS et web décrivent LA MÊME comète.
 *
 * Les deux plateformes rendent l'effet avec des mécaniques différentes
 * (`Shape.trim` piloté par `animatableData` côté Swift, `stroke-dasharray` sur
 * un `pathLength="1"` côté SVG), mais elles doivent décrire la même course :
 * même durée de cycle, même longueur d'arc, même part de repos, même fondu.
 * Rien dans un build ne rapproche ces deux fichiers — sans cette garde, une
 * retouche d'un côté laisse l'autre en place et l'effet devient deux effets.
 *
 * La garde lit la source Swift, pas une copie : c'est ce qui la rend
 * incontournable.
 */

const SWIFT_SOURCE = join(
  __dirname,
  '../../../../packages/MeeshySDK/Sources/MeeshySDK/Models/RainbowSweep.swift',
);

const CSS_SOURCE = join(__dirname, '../../app/globals.css');

function swiftConstant(source: string, name: string): number {
  const match = source.match(new RegExp(`static let ${name}[^=]*=\\s*([0-9.]+)`));
  if (!match) {
    throw new Error(
      `Constante \`${name}\` introuvable dans RainbowSweep.swift. ` +
        'Le fichier a bougé ou la constante a été renommée — un balayage vide ne doit ' +
        "jamais être indiscernable d'un succès.",
    );
  }
  return Number(match[1]);
}

describe('RAINBOW_SWEEP mirrors the Swift rule', () => {
  const swift = readFileSync(SWIFT_SOURCE, 'utf8');

  it.each([
    ['cycle', 'cycle'],
    ['sweepFraction', 'sweepFraction'],
    ['arcLength', 'arcLength'],
    ['fadeFraction', 'fadeFraction'],
  ] as const)('agrees with Swift on %s', (tsKey, swiftName) => {
    expect(RAINBOW_SWEEP[tsKey]).toBeCloseTo(swiftConstant(swift, swiftName), 6);
  });

  it('keeps rest the dominant part of the cycle', () => {
    expect(RAINBOW_SWEEP.sweepFraction).toBeLessThan(0.6);
  });
});

/**
 * Les constantes TS ne servent à rien si le CSS peint d'autres valeurs.
 *
 * `arcLength` et `cycle` traversent en custom properties, donc le composant les
 * SERT réellement. Les bornes du cycle, elles, vivent en pourcentages de
 * keyframes — qu'aucune `var()` ne peut porter. Ce bloc est ce qui les tient
 * alignées sur la règle.
 */
describe('the CSS keyframes match the shared rule', () => {
  const css = readFileSync(CSS_SOURCE, 'utf8');

  const keyframes = (() => {
    const match = css.match(/@keyframes msg-fx-rainbow-comet-kf\s*\{([\s\S]*?)\n\}/);
    if (!match) throw new Error('Keyframes `msg-fx-rainbow-comet-kf` introuvables dans globals.css.');
    return match[1];
  })();

  const percent = (value: number) => `${Number((value * 100).toFixed(2))}%`;

  it('ends the sweep exactly at sweepFraction', () => {
    expect(keyframes).toContain(percent(RAINBOW_SWEEP.sweepFraction));
  });

  it('reaches full opacity after the fade-in, and starts fading out before the end', () => {
    const fadeIn = RAINBOW_SWEEP.sweepFraction * RAINBOW_SWEEP.fadeFraction;
    const fadeOut = RAINBOW_SWEEP.sweepFraction * (1 - RAINBOW_SWEEP.fadeFraction);

    expect(keyframes).toContain(percent(fadeIn));
    expect(keyframes).toContain(percent(fadeOut));
  });

  it('travels the whole perimeter across one sweep', () => {
    expect(keyframes).toMatch(/stroke-dashoffset:\s*-1/);
  });

  it('rests — the comet is invisible from the end of the sweep to the end of the cycle', () => {
    const rest = keyframes.slice(keyframes.indexOf(percent(RAINBOW_SWEEP.sweepFraction)));
    expect(rest).toMatch(/100%\s*\{[^}]*opacity:\s*0/);
  });
});

/**
 * Le spectre est POSÉ : seule la comète bouge. Si la rotation du dégradé
 * revient, l'effet retombe dans le mouvement sans intention que la seconde
 * passe de la directive 2026-08-24 a précisément retiré.
 */
describe('the spectrum stays posed', () => {
  const css = readFileSync(CSS_SOURCE, 'utf8');

  it('no longer animates the conic gradient angle', () => {
    expect(css).not.toMatch(/animation:\s*msg-fx-rainbow-kf/);
  });

  it('still paints the house spectrum on the border', () => {
    expect(css).toMatch(/\.msg-fx-rainbow::after[\s\S]*?conic-gradient/);
  });
});

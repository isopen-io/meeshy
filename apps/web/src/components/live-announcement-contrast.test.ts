import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveColor, wcagContrastRatio } from '../../scripts/lib/glass-contrast.mjs';

/**
 * **LE CONTRASTE DU TON `error`, REJOUÉ DEPUIS LES JETONS RÉELS** (revue-
 * correction de #6149, défaut majeur 1, issue #7859) — jamais depuis une
 * valeur recopiée, même discipline que `scripts/lib/glass-contrast.test.ts`
 * pour les tons de verre : un `--color-danger` ou un `--color-on-status`
 * régénéré change ce résultat au prochain `bun test`, sans qu'aucune valeur
 * n'ait été écrite ici en dur.
 *
 * **LE DÉFAUT, MESURÉ** — `LiveAnnouncement` peignait `#fff` codé en dur sur
 * `--color-error` (alias de `--color-danger`) et affirmait dans son doc-
 * comment que c'était « la seule encre qui tienne AA dans les DEUX
 * schémas ». Faux en sombre : `--color-danger` y vaut `#f45b5b`
 * (`packages/design-tokens/dark.css`), luminance relative 0,275, sur lequel
 * du blanc ne contraste qu'à 3,23:1 — sous le 4,5:1 qu'exige
 * `text-caption font-semibold` (WCAG 1.4.3). Chaque échec annoncé par la
 * pastille (profil, découvrir, invitation, « Mes stories ») était donc sous
 * AA en sombre.
 *
 * **LE CORRECTIF** — l'encre suit désormais `--color-on-status`, le jeton
 * PAR SCHÉMA déjà servi ailleurs pour ce même besoin (texte plein sur une
 * puce de statut colorée, `share-link-detail-parts.tsx`) : blanc en clair,
 * `--color-bg` (quasi noir) en sombre. Aucune encre FIXE ne pouvait tenir AA
 * sur les deux rouges à la fois — `#c81e1e` (clair) est presque deux fois
 * plus sombre que `#f45b5b` (sombre), donc l'un demande une encre claire et
 * l'autre une encre foncée.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const DARK_CSS = readFileSync(join(ROOT, 'packages/design-tokens/dark.css'), 'utf8');
const LIGHT_CSS = readFileSync(join(ROOT, 'packages/design-tokens/light.css'), 'utf8');

/** Toutes les déclarations `--jeton: valeur;` d'un fichier, jamais recopiées :
 * lues à chaque exécution, pour que `resolveColor` puisse suivre un
 * `var(--autre-jeton)` (`--color-on-status: var(--color-bg)` en sombre). */
function parseAllVars(css: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map[m[1]!] = m[2]!.trim();
  return map;
}

/* `:root.light` ne SURCHARGE que ce qu'il déclare — le reste vient de
   `:root, :root.dark`, universel. Même cascade que `loadIosSchemes()`
   (`scripts/lib/glass-contrast.mjs`). */
const darkVars = parseAllVars(DARK_CSS);
const lightVars = { ...darkVars, ...parseAllVars(LIGHT_CSS) };

const WHITE = { r: 255, g: 255, b: 255, a: 1 } as const;

const scheme = {
  light: {
    danger: resolveColor(lightVars['--color-danger']!, lightVars),
    onStatus: resolveColor(lightVars['--color-on-status']!, lightVars),
  },
  dark: {
    danger: resolveColor(darkVars['--color-danger']!, darkVars),
    onStatus: resolveColor(darkVars['--color-on-status']!, darkVars),
  },
} as const;

describe('LiveAnnouncement — le ton `error` tient AA dans les DEUX schémas (issue #7859)', () => {
  test('LE DÉFAUT REJOUÉ : `#fff` fixe sur `--color-error` sombre reste SOUS AA', () => {
    expect(wcagContrastRatio(WHITE, scheme.dark.danger)).toBeLessThan(4.5);
  });

  test('l\'encre servie (`--color-on-status`) sur `--color-error` clair tient AA', () => {
    expect(wcagContrastRatio(scheme.light.onStatus, scheme.light.danger)).toBeGreaterThanOrEqual(4.5);
  });

  test('l\'encre servie (`--color-on-status`) sur `--color-error` SOMBRE tient AA — c\'était le défaut', () => {
    expect(wcagContrastRatio(scheme.dark.onStatus, scheme.dark.danger)).toBeGreaterThanOrEqual(4.5);
  });
});

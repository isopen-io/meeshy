import type { CSSProperties } from 'react';

import type { ComposerAccentState } from './compose-protection';

/**
 * L'ACCENT SUBSTITUÉ DU COMPOSEUR, POSÉ EN CSS (#6175, revue-correction
 * défaut majeur 2) — `composerAccentOf` (`compose-protection.ts`) était
 * écrite, testée par quatre témoins, et n'avait AUCUN consommateur : le
 * mécanisme était écrit, jamais activé (miroir `ConversationView
 * +Composer.swift:49-70`).
 *
 * TROIS JETONS DÉJÀ DÉRIVÉS (D-4), AUCUNE VALEUR NOUVELLE — `--color-error`
 * (= `errorHex`), `--color-i600` (= `trackingAccentHex`, indigo600) et
 * `--color-ios-brand` (= `brandPrimaryHex`, indigo500) existent déjà dans
 * `packages/design-tokens/ios.css` et sont déjà consommés ailleurs dans ce
 * même fichier (`composer.tsx`, `composer-top-row.tsx`). Ce module ne fait
 * QUE choisir LEQUEL des trois `--accent` reçoit, jamais une teinte inventée.
 *
 * CE QUI N'EST PAS FAIT ICI, ET POURQUOI — `--accent-ink` reste
 * INTENTIONNELLEMENT NON SUBSTITUÉ : le calculer exigerait soit un hex écrit
 * à la main (interdit, D-4 — et une dérive silencieuse dès que
 * `MeeshyColors.errorHex`/`.indigo600`/`.indigo500` changeraient), soit une
 * lecture `getComputedStyle` au montage (un mécanisme qui n'existe nulle part
 * ailleurs dans ce dépôt et qui mérite sa PROPRE spécification, pas une
 * improvisation dans ce lot). L'unique consommateur actuel de `--accent-ink`
 * est la capsule « Désactivé » du sélecteur de durée éphémère
 * (`composer-top-row.tsx`, `armedStyle` inactif) — et elle ne peint
 * `--accent` QUE quand `ephemeralSeconds === undefined`, c'est-à-dire
 * EXACTEMENT quand `composerAccentOf` ne substitue RIEN pour l'état
 * `'ephemeral'` (qui exige `ephemeralSeconds !== undefined`) : les deux ne se
 * chevauchent jamais pour cet état. Le chevauchement résiduel — flou ou effets
 * armés PENDANT que le sélecteur de durée est ouvert sans choix encore fait —
 * est une combinaison RARE (deux gestes distincts, dans cet ordre précis) où
 * la capsule "Désactivé" pourrait perdre un peu de contraste ; issue
 * compagnon pour un jeton d'encre dérivé avant de fermer complètement ce
 * résidu.
 */
const SUBSTITUTED_ACCENT_VAR: Readonly<Record<Exclude<ComposerAccentState, null>, string>> = {
  ephemeral: '--color-error',
  blur: '--color-i600',
  effects: '--color-ios-brand',
};

export { SUBSTITUTED_ACCENT_VAR };

/** Le style à poser sur la racine du composeur — `undefined` quand rien
 * n'est armé (l'appelant garde alors l'accent de la conversation, hérité). */
export function composerChromeAccentStyle(state: ComposerAccentState): CSSProperties | undefined {
  if (state === null) return undefined;
  return { '--accent': `var(${SUBSTITUTED_ACCENT_VAR[state]})` } as CSSProperties;
}

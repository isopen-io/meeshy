import type { CSSProperties } from 'react';

import type { ComposerAccentState } from './compose-protection';

/**
 * L'ACCENT SUBSTITUÉ DU COMPOSEUR, POSÉ EN CSS (#6175, puis #7667).
 *
 * LA PROTECTION LA PLUS FORTE COLORE LA BARRE (#7667), miroir
 * `ComposerProtection.tintHex` (iOS). Vue unique et flou prennent le jeton
 * d'ÉTAT que le fil peint sur leur capsule (#7599, `thread-protection.css`) :
 * `--ios-state-view-once` (violet, le « 1 » cerclé), `--ios-state-concealed`
 * (gris). L'éphémère prend `--color-error`, le ROUGE d'alerte — directive
 * porteur « la barre sera rouge pour éphémère » ; le fil le peint en orange,
 * et laquelle unifier est la décision #7677. Tous DÉRIVÉS de
 * `MeeshyColors.swift` (`packages/design-tokens/ios.css`) : ce module ne fait
 * QUE choisir lequel `--accent` reçoit, jamais une teinte inventée. L'effet en
 * attente garde `--color-ios-brand` (indigo500, `brandPrimaryHex`).
 *
 * Jusqu'au #7667, le flou substituait l'indigo de traçage et la vue unique ne
 * substituait rien du tout.
 *
 * CE QUI N'EST PAS FAIT ICI, ET POURQUOI — `--accent-ink` reste
 * INTENTIONNELLEMENT NON SUBSTITUÉ : le calculer exigerait un hex écrit à la
 * main (interdit, D-4) ou une lecture `getComputedStyle` au montage. Les
 * capsules armées de la rangée haute gardent l'encre `--color-ios-ink`
 * (`armedStyle`, `composer-top-row.tsx`), qui tient la barre AA sur un lavis
 * de n'importe laquelle de ces teintes.
 */
const SUBSTITUTED_ACCENT_VAR: Readonly<Record<Exclude<ComposerAccentState, null>, string>> = {
  ephemeral: '--color-error',
  viewOnce: '--ios-state-view-once',
  blur: '--ios-state-concealed',
  effects: '--color-ios-brand',
};

export { SUBSTITUTED_ACCENT_VAR };

/** Le style à poser sur la racine du composeur — `undefined` quand rien
 * n'est armé (l'appelant garde alors l'accent de la conversation, hérité). */
export function composerChromeAccentStyle(state: ComposerAccentState): CSSProperties | undefined {
  if (state === null) return undefined;
  return { '--accent': `var(${SUBSTITUTED_ACCENT_VAR[state]})` } as CSSProperties;
}

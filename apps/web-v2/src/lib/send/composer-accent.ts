import type { CSSProperties } from 'react';

import type { ComposerAccentState } from './compose-protection';

/**
 * L'ACCENT SUBSTITUÉ DU COMPOSEUR, POSÉ EN CSS (#6175, puis #7667).
 *
 * UNE PROTECTION A UNE COULEUR PARTOUT (#7667) — la barre prend le jeton
 * d'ÉTAT que le fil peint sur la capsule de la même protection (#7599,
 * `thread-protection.css`) : `--ios-state-ephemeral` (orange, la flamme),
 * `--ios-state-view-once` (violet, le « 1 » cerclé), `--ios-state-concealed`
 * (gris, le flou). Tous trois DÉRIVÉS de `MeeshyColors.swift`
 * (`packages/design-tokens/ios.css`) : ce module ne fait QUE choisir lequel
 * `--accent` reçoit, jamais une teinte inventée. L'effet en attente garde
 * `--color-ios-brand` (indigo500, `brandPrimaryHex`).
 *
 * Jusqu'au #7667, l'éphémère substituait le ROUGE D'ERREUR et le flou
 * l'indigo de traçage — deux teintes qui ne disaient pas la protection
 * ailleurs dans l'app — et la vue unique ne substituait rien du tout.
 *
 * CE QUI N'EST PAS FAIT ICI, ET POURQUOI — `--accent-ink` reste
 * INTENTIONNELLEMENT NON SUBSTITUÉ : le calculer exigerait un hex écrit à la
 * main (interdit, D-4) ou une lecture `getComputedStyle` au montage. Les
 * capsules armées de la rangée haute gardent l'encre `--color-ios-ink`
 * (`armedStyle`, `composer-top-row.tsx`), qui tient la barre AA sur un lavis
 * de n'importe laquelle de ces teintes.
 */
const SUBSTITUTED_ACCENT_VAR: Readonly<Record<Exclude<ComposerAccentState, null>, string>> = {
  ephemeral: '--ios-state-ephemeral',
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

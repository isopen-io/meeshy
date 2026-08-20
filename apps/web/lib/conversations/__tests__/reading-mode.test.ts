/**
 * « Le mode bulle est le mode par défaut » — décision produit 2026-08-20
 * (`docs/superpowers/plans/2026-08-20-composer-droits-et-bulle-par-defaut.md`,
 * tâche 5).
 *
 * Le chemin corrigé ici est celui du drapeau `reading_modes` ÉTEINT — l'état
 * de production aujourd'hui, et donc le SEUL chemin que les utilisateurs
 * voient réellement. Le chemin drapeau allumé a déjà son propre défaut
 * bulles (`PROVISIONAL_DEFAULT_RENDER`, `use-thread-reading-mode.ts`,
 * décision du 2026-08-17/2026-08-18) : il n'est pas concerné par ce fichier.
 *
 * `resume` et `riviere` restent rabattus sur `focal`, JAMAIS sur `bubble` —
 * ce repli reproduit le repli de la loi partagée (`CLAMP_FALLBACK_MODE`,
 * `packages/shared/utils/reading-modes.ts`, non touché), et n'a rien à voir
 * avec le défaut de rendu que cette tâche déplace. Sans ce témoin, une
 * implémentation naïve (faire pivoter `auto`/`resume`/`riviere` sur la même
 * variable) ferait glisser silencieusement ces deux préférences vers
 * `bubble` aussi.
 */
import {
  DEFAULT_READING_MODE,
  readingModeFromPreference,
} from '../reading-mode';

describe('reading-mode — la bulle devient le défaut du chemin drapeau-éteint (2026-08-20)', () => {
  it('sans préférence, le fil rend des bulles', () => {
    expect(DEFAULT_READING_MODE).toBe('bubble');
  });

  it("une préférence 'auto' se replie sur les bulles", () => {
    expect(readingModeFromPreference('auto')).toBe('bubble');
  });

  it('un choix explicite garde tout son pouvoir', () => {
    expect(readingModeFromPreference('focal')).toBe('focal');
    expect(readingModeFromPreference('script')).toBe('script');
  });

  it('`resume` et `riviere` restent rabattus sur `focal`, jamais `bubble` (repli aligné sur la loi partagée)', () => {
    expect(readingModeFromPreference('resume')).toBe('focal');
    expect(readingModeFromPreference('riviere')).toBe('focal');
  });
});

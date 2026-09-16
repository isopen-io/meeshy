import { AuthBrandFooter } from './auth-chrome';
import { AuthColumn, AuthColumnBar } from './auth-column';
import { MagicLinkPanel, type MagicLinkPanelDeps } from './magic-link-panel';

/**
 * L'ÉCRAN PLEIN DU LIEN MAGIQUE (#5816) — anatomie de `MagicLinkView.swift`
 * (351 l.) : DEUX étapes exclusives (saisie / attente), le compte à rebours
 * dérivant de `Date.now()` via `useCountdown` (jamais un compteur qui saute
 * quand l'onglet dort, dimension 4).
 *
 * **Ce fichier n'est plus que le CHROME** (#6404) : l'en-tête, le pied, et la
 * fermeture vers `/login`. Toute la machine — saisie, envoi, attente, renvoi,
 * erreurs — vit dans `MagicLinkPanel`, que `/login` monte aussi, désormais
 * comme porte PAR DÉFAUT. Cette adresse reste servie telle quelle : c'est celle
 * que l'e-mail vise (`MagicLinkService.ts:548`) et que les liens déjà envoyés
 * ouvrent.
 *
 * **Et ce chrome est la colonne de la connexion** (#6643) : le même panneau
 * s'étalait ici sur toute la largeur de l'écran pendant que `/login` le rangeait
 * au centre.
 */

export type MagicLinkFlowDeps = MagicLinkPanelDeps;

export function MagicLinkFlow({ deps, next = null }: { deps?: MagicLinkFlowDeps; readonly next?: string | null }) {
  return (
    <AuthColumn>
      <AuthColumnBar to="login" title="Connexion par e-mail" />
      <MagicLinkPanel {...(deps === undefined ? {} : { deps })} autoFocus next={next} />
      <AuthBrandFooter />
    </AuthColumn>
  );
}

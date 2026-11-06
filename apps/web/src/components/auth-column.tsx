import type { ReactNode } from 'react';

import { AuthAmbient } from './auth-chrome';

/* L'écran des moins de 13 ans (#9928) voyage avec la géométrie des pages
   d'accès : seules ces pages le montrent, et passer par ce module le range
   dans leur chunk commun au lieu d'en ouvrir un de plus, dont le nom
   pèserait sur la première peinture (budgets.json › first_paint). */
export { AgeBlocked, isAgeBelowMinimum } from './age-blocked';

/**
 * LA GÉOMÉTRIE DES PAGES D'ACCÈS — celle de la connexion, écrite UNE fois
 * (#6643, D-72).
 *
 * Directive porteur 2026-09-15 : « Les pages doivent être responsives et même
 * sur tablette ou ordinateur avoir le style de la page de connexion (au
 * centre) […] Les pages d'inscription, reset de mot de passe, 2FA, MFA doivent
 * être centrées même hors smartphone ! »
 *
 * La connexion et l'accueil posaient un fond plein écran et une colonne
 * `max-w-sm` centrée. L'inscription, le mot de passe oublié, le nouveau mot de
 * passe, le lien par e-mail et la vérification d'e-mail recopiaient chacun leur
 * propre racine pleine largeur : sur un écran de 1 440 px, leurs champs
 * s'étalaient sur 1 392 px. Aucune source ne tenait la géométrie — chaque écran
 * la recopiait, et cinq sur sept l'avaient perdue.
 *
 * CE QUI VIT ICI : le FOND (plein écran, halo d'ambiance, marges de sécurité,
 * défilement) et la COLONNE (pleine largeur jusqu'à 384 px, centrée). CE QUI
 * RESTE À L'ÉCRAN : l'agencement DANS la colonne, par `className` — la
 * connexion centre et espace ses sections, l'inscription borne sa hauteur
 * (`min-h-0`) pour faire défiler son formulaire sous une barre qui reste en
 * place.
 *
 * `data-auth-column` nomme la colonne pour les témoins DOM
 * (`test-support/auth-column.ts`). Le gate navigateur
 * (`scripts/check-access-column.mjs`) ne le lit PAS : il mesure la géométrie de
 * ce qui se lit et se touche, et rougirait sur un écran qui porterait
 * l'attribut sans tenir dans la colonne.
 */
const COLUMN = 'relative flex w-full max-w-sm flex-1 flex-col';

export function AuthColumn({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className="relative flex h-dvh flex-col items-center overflow-y-auto pt-safe pb-safe">
      <AuthAmbient />
      <div data-auth-column className={className === undefined ? COLUMN : `${COLUMN} ${className}`}>
        {children}
      </div>
    </div>
  );
}

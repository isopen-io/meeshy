import type { ReactNode } from 'react';

import { Link } from '@/routes/route-table';

import { AuthAmbient } from './auth-chrome';
import { Glyph } from './glyph';

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

/**
 * LA BARRE DE FERMETURE — DANS la colonne, jamais au bord de l'écran (D-72).
 *
 * iOS pose sa croix au bord de l'écran (`safeAreaInset(edge: .top)`) au-dessus
 * d'un formulaire que `iPadFormWidth()` borne. Sur un écran de 1 440 px, la même
 * pose mettrait la croix à plus de 500 px de ce qu'elle ferme, seule dans un
 * coin. Dans la colonne, elle se lit avec le titre qu'elle accompagne, et la
 * page entière tient au centre — ce que la directive demande. Sur téléphone,
 * la colonne occupe l'écran : la croix reste où elle était.
 *
 * FERMER REFERME (`replace`) et mène là où l'écran le dit — la connexion, sauf
 * la vérification d'e-mail d'une session déjà ouverte, qui rend la liste.
 * `window.history.back()` supposait qu'on venait de `/login` : sur un lien
 * profond, un démarrage de PWA ou un lancement de coque, il n'y a AUCUNE entrée
 * d'historique de l'application, et le geste sortait de l'app (revue de #5555,
 * défaut 3).
 */
export function AuthColumnBar({ to, title }: { readonly to: 'login' | 'list'; readonly title?: string }) {
  return (
    <div className="flex shrink-0 items-center px-2 pt-1">
      <Link
        to={to}
        replace
        className="grid place-items-center rounded-chip"
        style={{ minHeight: 44, minWidth: 44, color: 'var(--color-ios-ink-2)' }}
        aria-label="Fermer"
      >
        <Glyph name="x" size={20} />
      </Link>
      {title === undefined ? null : (
        <h1 className="flex-1 text-center text-title font-semibold" style={{ color: 'var(--color-ios-ink)', marginRight: 44 }}>
          {title}
        </h1>
      )}
    </div>
  );
}

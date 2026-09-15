import { Link } from '@/routes/route-table';

import { AuthBrandFooter } from './auth-chrome';
import { Glyph } from './glyph';
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
 */

export type MagicLinkFlowDeps = MagicLinkPanelDeps;

export function MagicLinkFlow({ deps }: { deps?: MagicLinkFlowDeps }) {
  return (
    <div className="flex h-dvh flex-col pt-safe pb-safe">
      <FlowHeader />
      <MagicLinkPanel {...(deps === undefined ? {} : { deps })} autoFocus />
      <AuthBrandFooter />
    </div>
  );
}

function FlowHeader() {
  return (
    <div className="flex shrink-0 items-center px-2 pt-1">
      <Link
        to="login"
        replace
        className="grid place-items-center rounded-chip"
        style={{ minHeight: 44, minWidth: 44, color: 'var(--color-ios-ink-2)' }}
        aria-label="Fermer"
      >
        <Glyph name="x" size={20} />
      </Link>
      <h1 className="flex-1 text-center text-title font-semibold" style={{ color: 'var(--color-ios-ink)', marginRight: 44 }}>
        Connexion par e-mail
      </h1>
    </div>
  );
}

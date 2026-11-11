import type { TreasuryTierKey } from '@meeshy/shared/utils/game/treasury';

/**
 * L'EMBLÈME D'UN CONTENANT DE L'HÉRITAGE (#17437) — une image par contenant, lisible à 20 px : la bourse, le sac de
 * l'escarcelle, le coffret, le coffre, la couronne du trésor, l'édifice de la Réserve. Le jumeau de
 * `TreasuryTierEmblem` (MeeshyUI). Décoratif : l'hôte dit le nom du contenant au lecteur d'écran.
 */
const PATHS: Readonly<Record<TreasuryTierKey, string>> = {
  bourse: 'M9 3h6l-1.5 3h-3zM8.5 7h7C19 10 21 13.5 21 16.5 21 19.5 18.5 21 15.5 21h-7C5.5 21 3 19.5 3 16.5 3 13.5 5 10 8.5 7z',
  escarcelle: 'M8 7V6a4 4 0 0 1 8 0v1h3.2l1.3 13a1 1 0 0 1-1 1.1h-15a1 1 0 0 1-1-1.1L4.8 7zm2 0h4V6a2 2 0 0 0-4 0z',
  coffret: 'M3 8l9-4 9 4v10l-9 4-9-4zm9 2.2L5.6 7.4 5 7.7v9l6 2.7v-9z',
  coffre: 'M4 4h16a1 1 0 0 1 1 1v4H3V5a1 1 0 0 1 1-1zM3 11h18v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm7 2v2h4v-2z',
  tresor: 'M3 7l4.5 3.5L12 4l4.5 6.5L21 7l-2 11H5zM5 19.5h14V21H5z',
  reserve: 'M12 2l10 5v2H2V7zM4 10h3v8H4zm6.5 0h3v8h-3zM17 10h3v8h-3zM2 19h20v3H2z',
};

export function TreasuryEmblem({ tier, size = 20 }: { readonly tier: TreasuryTierKey; readonly size?: number }) {
  return (
    <svg aria-hidden="true" data-treasury-emblem={tier} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" focusable="false">
      <path fillRule="evenodd" d={PATHS[tier]} />
    </svg>
  );
}

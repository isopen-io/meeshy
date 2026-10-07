import type { ReactNode } from 'react';

/**
 * LA SURFACE DES PIÈCES DU JEU (#9383) — les jetons et la carte que
 * `game-hero`, `game-missions`, `game-mint-preview` et `game-flame-panel`
 * partagent. Les couleurs sont les JETONS de l'écran Progression (iOS,
 * `MeeshyColors`) : aucun littéral, la palette du jeu (`--game-*`) vit dans
 * `styles/game.css` pour les dessins seulement.
 *
 * Une carte porte un `id` d'ancre quand le guide peut y mener (« voir ma
 * Flamme ») : le bouton de la carte du guide fait défiler jusqu'à elle.
 */

export const GAME_BRAND = 'var(--color-ios-brand)';
export const GAME_INK = 'var(--color-ios-ink)';
export const GAME_INK_2 = 'var(--color-ios-ink-2)';
export const GAME_CARD = 'var(--color-ios-card)';
/* Les couleurs d'ÉTAT suivent le thème : les jetons `--ios-*` bruts sont ceux
   du thème sombre et tombent sous 3:1 sur la surface claire. */
export const GAME_WARM = 'var(--color-warn)';
/** Le texte posé SUR un fond `GAME_WARM` (un bouton de dépense). */
export const GAME_ON_WARM = 'var(--color-on-state)';
export const GAME_GOOD = 'var(--color-ok)';
export const GAME_ERROR = 'var(--color-error)';

export function GameCard({
  id,
  labelledBy,
  tint,
  children,
}: {
  readonly id?: string;
  readonly labelledBy: string;
  readonly tint?: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      {...(id === undefined ? {} : { id })}
      aria-labelledby={labelledBy}
      className="flex min-w-0 flex-col gap-2 rounded-card px-4 py-4"
      style={
        tint === undefined
          ? { backgroundColor: GAME_CARD }
          : {
              backgroundColor: `color-mix(in srgb, ${tint} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${tint} 24%, transparent)`,
            }
      }
    >
      {children}
    </section>
  );
}

export function GameChip({ children, tint }: { readonly children: ReactNode; readonly tint: string }) {
  return (
    <span
      data-chip=""
      className="inline-flex items-center whitespace-nowrap rounded-chip px-2 py-0.5 text-check font-semibold"
      style={{ backgroundColor: `color-mix(in srgb, ${tint} 16%, transparent)`, color: GAME_INK }}
    >
      {children}
    </span>
  );
}

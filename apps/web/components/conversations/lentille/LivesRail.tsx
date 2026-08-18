/**
 * `LivesRail` — rail « vivants & stories » (WL-103, LWS-10).
 *
 * Cotes par tokens (pastille `48`, anneau `3.5` pulsé si live). Masqué (rend
 * `null`) si vide — contrat : « rail ≤ 6 masqué si vide ». Le plafond de 6
 * entrées est un NOMBRE, pas une cote CSS : il doit exister côté JS (pour
 * `slice`), donc il ne peut pas vivre uniquement dans
 * `--lentille-list-rail-max-entries`. Il est mirroré ici et gardé contre la
 * dérive par `__tests__/lentille-rail-max-entries.parity.test.ts` (même
 * discipline que `MeeshyTokenParityTest` : ne jamais réparer le test en y
 * recopiant la valeur qui a dérivé — réparer le miroir).
 */
'use client';

export type LentilleLiveEntry = {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly isLive: boolean;
  /**
   * Famille de « ça vit maintenant » (`lentille-rail-entries.ts`). La maquette
   * pose un badge par famille (rendu `railHtml` : `LIVE` pour une Scène, `✦`
   * pour une salve de non-lus, `…` pour quelqu'un qui écrit). Optionnelle :
   * un appelant qui ne compose pas ses entrées (test, aperçu) garde un rail
   * sans badge.
   */
  readonly kind?: 'live' | 'typing' | 'bridge';
};

/** Badge de la maquette (`railHtml`) — un glyphe par famille, jamais un chiffre. */
const RAIL_BADGE: Readonly<Record<NonNullable<LentilleLiveEntry['kind']>, string>> = {
  live: 'LIVE',
  bridge: '✦',
  typing: '…',
};

export interface LivesRailProps {
  readonly entries: readonly LentilleLiveEntry[];
  readonly label: string;
}

/** Miroir de `packages/shared/design/lentille-tokens.json` → `list.rail.maxEntries` (= `--lentille-list-rail-max-entries`, M-049). */
export const LENTILLE_LIST_RAIL_MAX_ENTRIES = 6;

export function LivesRail({ entries, label }: LivesRailProps) {
  if (entries.length === 0) return null;

  const capped = entries.slice(0, LENTILLE_LIST_RAIL_MAX_ENTRIES);

  return (
    <div
      role="list"
      aria-label={label}
      data-testid="lentille-lives-rail"
      className="flex gap-3 overflow-x-auto px-4 py-2"
    >
      {capped.map((entry) => (
        <div
          key={entry.id}
          role="listitem"
          data-testid="lentille-lives-rail-entry"
          data-kind={entry.kind}
          className="flex flex-col items-center gap-1 shrink-0"
        >
          <div
            className="relative rounded-full overflow-hidden bg-muted flex items-center justify-center text-xs font-semibold"
            style={{
              width: 'var(--lentille-list-rail-size)',
              height: 'var(--lentille-list-rail-size)',
              boxShadow: entry.isLive
                ? '0 0 0 var(--lentille-list-rail-ring) var(--row-accent, currentColor)'
                : undefined,
            }}
          >
            {entry.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={entry.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              entry.name.slice(0, 2).toUpperCase()
            )}
            {entry.isLive && <span className="absolute inset-0 rounded-full animate-pulse" aria-hidden="true" />}
            {entry.kind && (
              <span
                aria-hidden="true"
                data-testid="lentille-lives-rail-badge"
                className="absolute -bottom-0.5 -right-1 rounded-full bg-primary px-1 text-[8.5px] font-extrabold leading-none text-primary-foreground"
              >
                {RAIL_BADGE[entry.kind]}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground truncate max-w-full">{entry.name}</span>
        </div>
      ))}
    </div>
  );
}

export default LivesRail;

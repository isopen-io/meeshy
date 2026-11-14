import type { GameActsRing } from '@meeshy/shared/utils/game/acts-ring';

/** La circonférence de référence : chaque acte en reçoit une part égale. */
const TOUR = 300;
/** Le jour entre deux segments, en unités de `TOUR`. */
const JOUR = 14;
/** L'anneau déborde le disque de quelques pixels, sans le toucher. */
const DEBORD = 5;
const TRAIT = 3.5;

/**
 * **L'ANNEAU DES ACTES** (#17768) — un segment par acte du rêve du jour, allumé quand l'acte est réalisé. Aucun texte,
 * aucun élément ajouté à l'écran : il se pose AUTOUR du bouton du menu, qui est déjà là. Décoratif (`aria-hidden`) —
 * c'est le bouton qui le décrit, par `aria-describedby`. Immobile : le mouvement attend la table #17381.
 */
export function MenuActsRing({ ring, size }: { readonly ring: GameActsRing; readonly size: number }) {
  const side = size + DEBORD * 2;
  const radius = (side - TRAIT) / 2;
  const part = TOUR / ring.total;
  return (
    <svg
      data-acts-ring={`${ring.done}/${ring.total}`}
      aria-hidden="true"
      width={side}
      height={side}
      viewBox={`0 0 ${side} ${side}`}
      className="pointer-events-none absolute"
      style={{ left: -DEBORD, top: -DEBORD }}
    >
      {Array.from({ length: ring.total }, (_, index) => {
        const done = index < ring.done;
        return (
          <circle
            key={index}
            data-act-segment={done ? 'done' : 'todo'}
            cx={side / 2}
            cy={side / 2}
            r={radius}
            fill="none"
            pathLength={TOUR}
            stroke={done ? 'var(--ios-warning)' : 'color-mix(in srgb, var(--color-media-backdrop) 35%, transparent)'}
            strokeWidth={TRAIT}
            strokeLinecap="round"
            strokeDasharray={`${part - JOUR} ${TOUR - part + JOUR}`}
            strokeDashoffset={-(index * part + JOUR / 2)}
            transform={`rotate(-90 ${side / 2} ${side / 2})`}
          />
        );
      })}
    </svg>
  );
}

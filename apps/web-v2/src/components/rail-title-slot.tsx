import { useEffect, useRef } from 'react';

import { RAIL_TITLE_SLOT } from '@/components/rail-tile';
import { StoryRail, type StoryRailProps } from '@/components/story-rail';
import { HIDDEN_CHROME_EASE_OUT_MS } from '@/lib/reading-mode/metrics';

/**
 * **LA FENTE DU TITRE, OÙ LA BANDE ÉPINGLÉE PREND SA PLACE** — extraite de
 * `ListHeader` (#6103) pour servir aussi l'en-tête du Flux (#6277).
 *
 * iOS monte le MÊME `CollapsibleHeader` sur la liste et sur le fil, avec la
 * MÊME `PinnedStoryTrailBand` dans son `titleAccessory`
 * (`ConversationListView+Overlays.swift`, `FeedView.swift:610-634`). Réécrire
 * la bascule dans l'en-tête du fil aurait produit la jumelle qui diverge — et
 * celle-ci porte deux défauts déjà payés, qu'une copie aurait dû repayer :
 *
 * - **la hauteur** : la fente déclare `RAIL_TITLE_SLOT` (44), la cible tactile
 *   des liens qu'elle accueille — sans ce plancher, le `<ul>` de la bande, que
 *   `overflow-x-auto` rend défilant sur les DEUX axes, débordait d'un pixel et
 *   devenait une région défilante verticale (#6103, mesuré `scrollHeight` 43
 *   pour `clientHeight` 42). La bande y est `absolute` : elle ne pousse rien,
 *   l'en-tête garde sa hauteur qu'elle soit peinte ou non ;
 * - **le focus** : un utilisateur qui parcourt la bande au clavier puis fait
 *   remonter l'écran ne doit pas voir son focus retomber sur `<body>`.
 *   `onFocusCapture` retient l'auteur focalisé PENDANT que la bande existe ;
 *   l'effet qui suit la bascule `pinned: true → false` reporte le focus sur la
 *   tuile JUMELLE du grand plateau — mais SEULEMENT si le retrait l'a laissé
 *   orphelin : un focus parti ailleurs (la recherche) n'est jamais arraché.
 *
 * Le croisement titre ↔ bande est un fondu d'OPACITÉ sur
 * `HIDDEN_CHROME_EASE_OUT_MS` (règle 32 de la charte — jamais la géométrie),
 * coupé sous `motion-reduce`. iOS l'anime sur une rampe de défilement
 * continue ; cet en-tête reste statique, écart assumé (`targets/lentille.md`
 * § 3.1).
 */
export function RailTitleSlot({
  title,
  pinned,
  railProps,
}: {
  readonly title: string;
  readonly pinned: boolean;
  readonly railProps: StoryRailProps;
}) {
  const lastFocusedIdRef = useRef<string | null>(null);
  const wasPinnedRef = useRef(pinned);

  useEffect(() => {
    const id = lastFocusedIdRef.current;
    if (wasPinnedRef.current && !pinned && id !== null) {
      lastFocusedIdRef.current = null;
      const orphelin = document.activeElement === null || document.activeElement === document.body;
      if (orphelin) {
        const jumelle = document.querySelector<HTMLElement>(`[data-rail="grande"] [data-story-author="${CSS.escape(id)}"]`);
        jumelle?.focus();
      }
    }
    wasPinnedRef.current = pinned;
  }, [pinned]);

  return (
    <div data-title-slot className="relative flex min-w-0 flex-1 items-center" style={{ minHeight: RAIL_TITLE_SLOT }}>
      <h1
        aria-hidden={pinned ? 'true' : undefined}
        className="min-w-0 flex-1 truncate text-large-title font-bold transition-opacity motion-reduce:transition-none"
        style={{
          opacity: pinned ? 0 : 1,
          transitionDuration: `${HIDDEN_CHROME_EASE_OUT_MS}ms`,
          background: 'linear-gradient(90deg, var(--color-ios-brand), var(--color-ios-brand-deep))',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        {title}
      </h1>
      {pinned ? (
        <div
          className="absolute inset-0 flex items-center"
          onFocusCapture={(e) => {
            const cible = e.target instanceof Element ? e.target.closest('[data-story-author]') : null;
            lastFocusedIdRef.current = cible?.getAttribute('data-story-author') ?? null;
          }}
        >
          <StoryRail variant="pinned" {...railProps} />
        </div>
      ) : null}
    </div>
  );
}

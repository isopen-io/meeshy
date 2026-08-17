/**
 * `RiverThread` — l'hôte de l'écran Rivière (R-134, §7bis/§7ter, miroir web de
 * `RiverStreamHost.swift`).
 *
 * Composeur SEUL — la loi (`resolveRiverStep`/`resolveRiverLaneHeaders`), les
 * tokens (`--lentille-river-*`/`--lentille-thread-*`) et les trois feuilles
 * (`RiverBubble`, `RiverLaneOverlay`, `RiverLaneHeaderStrip`) en une grille
 * défilable à deux axes. C'est le SEUL fichier qui les assemble — chacune
 * d'elles reste montable et testable seule.
 *
 * **Grille rang-majeur, pas position absolue** : CSS Grid à colonnes fixes
 * (`--lentille-river-lane-width-reference`, ou une largeur passée par
 * l'appelant via la feuille de styles — §7ter, « `maxLanes`/la largeur de
 * couloir restent des PARAMÈTRES d'entrée, jamais tronquer le texte »), une
 * bulle par rang (la loi le garantit — `geometry.bubbles` a `rankCount`
 * entrées, une par rang). Ordre du DOM = `geometry.bubbles` = ordre
 * chronologique STRICT (§7bis/§7ter) — les traits SVG restent décoratifs.
 *
 * **Sérialisée** (`geometry.layout === 'serialized'`) : `geometry.laneCount`
 * vaut déjà `1` côté loi — la grille tombe naturellement à une seule colonne,
 * et `buildRiverPaint` rend un `RiverPaint` vide (AUCUNE branche dessinée,
 * vérifié indépendamment par `river-paint.ts`).
 *
 * **Mesure APRÈS rendu, jamais une hauteur de rang supposée** (§7ter A1) :
 * `ResizeObserver` sur le conteneur défilant, `getBoundingClientRect()` de
 * chaque bulle montée — exactement la mécanique de la maquette normative
 * (`measure()`/`paint()`) et de `useFocalScroller` (`hooks/conversations/`,
 * rAF-libre ici car SVG se contente d'un état React, pas d'écritures directes
 * de style à 60 Hz).
 *
 * **En-tête de couloirs** : `focusRank` fractionnaire calculé depuis le
 * défilement RÉEL (`riverFocusRankAt`, `river-focus.ts`) avec la MÊME bande de
 * focus que le reste de la Lentille (`FOCUS_BAND_OFFSET`,
 * `packages/shared/utils/focus-curve.ts`) — jamais une seconde loi de
 * défilement.
 *
 * **Deux axes qui se PARCOURENT** : les flèches du clavier traduisent leur
 * direction en `left`/`right`/`up`/`down` et délèguent INTÉGRALEMENT à
 * `resolveRiverStep` — aucune arithmétique de couloir/rang n'est écrite ici
 * (garde R15). Un clic/`Enter` sur une bulle déplace le curseur dessus
 * (`onSelectMessage` + curseur local) sans passer par la loi — un choix
 * explicite du lecteur, pas un pas, même distinction que `moveTo` dans la
 * maquette.
 *
 * **Non monté nulle part** (R-134 livre la peau, pas son point d'entrée dans
 * l'app — R-135) : témoin `apps/web/__tests__/riviere/riviere-screen-not-
 * mounted.test.ts`.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveRiverStep,
  resolveRiverLaneHeaders,
  type RiverGeometry,
  type RiverCursor,
  type RiverStepDirection,
  type RiverStepReason,
} from '@meeshy/shared/utils/river-lanes';
import { FOCUS_BAND_OFFSET } from '@meeshy/shared/utils/focus-curve';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { RiverBubble } from './RiverBubble';
import { RiverLaneOverlay } from './RiverLaneOverlay';
import { RiverLaneHeaderStrip } from './RiverLaneHeaderStrip';
import { buildRiverPaint, type RiverRowExtent } from './river-paint';
import { riverFocusRankAt, clampRiverFocusRank } from './river-focus';
import { connectorBow } from './river-metrics';
import type { RiverBubbleContent } from './river-bubble-types';

export interface RiverThreadProps {
  readonly geometry: RiverGeometry;
  /** `messageId → contenu résolu` (Prisme déjà appliqué par l'appelant) — une bulle sans entrée reste invisible, jamais un crash. */
  readonly contents: ReadonlyMap<string, RiverBubbleContent>;
  /** Résolu par l'appelant (`t('focal.row.you')`) — aucune clé i18n propre à la Rivière n'est nécessaire. */
  readonly youLabel: string;
  readonly initialCursor?: RiverCursor;
  readonly onSelectMessage?: (messageId: string) => void;
}

const KEY_TO_DIRECTION: Readonly<Record<string, RiverStepDirection>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

export function RiverThread({
  geometry,
  contents,
  youLabel,
  initialCursor,
  onSelectMessage,
}: RiverThreadProps) {
  const reducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bubbleElementsRef = useRef(new Map<number, HTMLDivElement>());

  const [rowExtents, setRowExtents] = useState<ReadonlyMap<number, RiverRowExtent>>(new Map());
  const [laneWidthPx, setLaneWidthPx] = useState(0);
  const [containerHeightPx, setContainerHeightPx] = useState(0);
  const [focusRank, setFocusRank] = useState(0);

  const firstBubble = geometry.bubbles[0];
  const [cursor, setCursor] = useState<RiverCursor>(
    initialCursor ?? { laneIndex: firstBubble?.laneIndex ?? 0, rank: 0 }
  );
  const [lastReason, setLastReason] = useState<RiverStepReason | null>(null);

  const laneCount = Math.max(1, geometry.laneCount);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const nextExtents = new Map<number, RiverRowExtent>();
    bubbleElementsRef.current.forEach((el, rank) => {
      const rect = el.getBoundingClientRect();
      nextExtents.set(rank, {
        top: rect.top - containerRect.top + container.scrollTop,
        bottom: rect.bottom - containerRect.top + container.scrollTop,
      });
    });

    setRowExtents(nextExtents);
    setLaneWidthPx(laneCount > 0 ? containerRect.width / laneCount : 0);
    setContainerHeightPx(container.scrollHeight);
  }, [laneCount]);

  const registerBubbleRef = useCallback(
    (rank: number) => (el: HTMLDivElement | null) => {
      if (el) bubbleElementsRef.current.set(rank, el);
      else bubbleElementsRef.current.delete(rank);
    },
    []
  );

  useEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(container);
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
    // `geometry` change ⇒ un nouveau lot de bulles est monté ⇒ re-mesurer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, geometry]);

  const updateFocusRank = useCallback(() => {
    const container = containerRef.current;
    if (!container || rowExtents.size === 0) return;

    const ranksAscending = geometry.bubbles.map((bubble) => bubble.rank);
    const focusY = container.scrollTop + Math.max(0, container.clientHeight - FOCUS_BAND_OFFSET);
    const rowTop = new Map<number, number>();
    const rowBottom = new Map<number, number>();
    rowExtents.forEach((extent, rank) => {
      rowTop.set(rank, extent.top);
      rowBottom.set(rank, extent.bottom);
    });

    const raw = riverFocusRankAt(focusY, ranksAscending, rowTop, rowBottom);
    setFocusRank(clampRiverFocusRank(raw, geometry.rankCount));
  }, [rowExtents, geometry]);

  useEffect(() => {
    updateFocusRank();
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('scroll', updateFocusRank, { passive: true });
    return () => container.removeEventListener('scroll', updateFocusRank);
  }, [updateFocusRank]);

  const laneHeaders = useMemo(
    () => resolveRiverLaneHeaders({ geometry, focusRank }),
    [geometry, focusRank]
  );

  const railX = useCallback(
    (laneIndex: number) => laneIndex * laneWidthPx + laneWidthPx / 2,
    [laneWidthPx]
  );

  const paint = useMemo(
    () =>
      buildRiverPaint({
        geometry,
        rowExtents,
        railX,
        resolveBow: (laneDistancePx) => connectorBow(laneDistancePx, containerRef.current),
        idPrefix: 'river-thread',
      }),
    [geometry, rowExtents, railX]
  );

  const step = useCallback(
    (direction: RiverStepDirection) => {
      const result = resolveRiverStep({ geometry, cursor, direction });
      setCursor(result.cursor);
      setLastReason(result.reason);
    },
    [geometry, cursor]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const direction = KEY_TO_DIRECTION[event.key];
      if (!direction) return;
      event.preventDefault();
      step(direction);
    },
    [step]
  );

  const onSelect = useCallback(
    (messageId: string) => {
      const bubble = geometry.bubbles.find((candidate) => candidate.messageId === messageId);
      if (bubble) {
        setCursor({ laneIndex: bubble.laneIndex, rank: bubble.rank });
        setLastReason('moved');
      }
      onSelectMessage?.(messageId);
    },
    [geometry, onSelectMessage]
  );

  const totalWidthPx = laneCount * laneWidthPx;

  return (
    <div
      data-testid="river-thread"
      data-layout={geometry.layout}
      data-serialization-reason={geometry.serializationReason ?? ''}
      data-cursor-lane={cursor.laneIndex}
      data-cursor-rank={cursor.rank}
      data-last-reason={lastReason ?? ''}
      // Documentaire/testable : le tracé (`RiverLaneOverlay`) ne pose de toute
      // façon jamais de transition CSS — reduce-motion ne change donc rien à
      // CE composant, mais l'attribut prouve que l'état est bien lu (§7bis).
      data-reduced-motion={reducedMotion}
      role="grid"
      aria-rowcount={geometry.rankCount}
      aria-colcount={laneCount}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <RiverLaneHeaderStrip headers={laneHeaders} railX={railX} widthPx={totalWidthPx} youLabel={youLabel} />

      <div ref={containerRef} data-testid="river-scroller" style={{ position: 'relative', overflow: 'auto' }}>
        <div
          data-testid="river-grid"
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: `repeat(${laneCount}, var(--lentille-river-lane-width-reference))`,
          }}
        >
          {/* Reduce motion : cette peau ne pose jamais de transition sur le tracé
              (voir RiverLaneOverlay) — elle reste montée sous reduce motion, elle
              ne s'anime simplement jamais (§7bis, « aucun tracé animé »). */}
          <RiverLaneOverlay paint={paint} widthPx={totalWidthPx} heightPx={containerHeightPx} />

          {geometry.bubbles.map((bubble) => {
            const content = contents.get(bubble.messageId);
            if (!content) return null;

            return (
              <RiverBubble
                key={bubble.messageId}
                content={content}
                youLabel={youLabel}
                registerRef={registerBubbleRef(bubble.rank)}
                onSelect={onSelect}
                style={{
                  gridColumn: bubble.laneIndex + 1,
                  gridRow: bubble.rank + 1,
                  paddingLeft: 'var(--lentille-river-lane-gutter)',
                  paddingRight: 'var(--lentille-river-lane-gutter)',
                  position: 'relative',
                  zIndex: 1,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default RiverThread;

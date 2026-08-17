/**
 * `RiverLaneHeaderStrip` — l'en-tête de couloirs (R-134, §7ter B, miroir web
 * de `RiverLaneHeaderStrip.swift`).
 *
 * « Les noms en tête doivent refléter les auteurs de la ligne — fading et
 * apparition du nom correspondant à la ligne affichée pendant le scroll
 * vertical. » Cette vue ne RECALCULE RIEN : elle reçoit
 * `readonly RiverLaneHeader[]`, déjà rendu par `resolveRiverLaneHeaders`
 * (laneIndex, laneId, colorSeed, isViewer, alpha), et se contente de POSER un
 * libellé par entrée à l'opacité fournie. La hauteur de la bande
 * (`--lentille-river-lane-header-height`) est le SEUL token que cette vue
 * consomme directement — distincte de `RIVER_HEADER_FADE_RANKS` (loi, en
 * RANGS), qui ne franchit jamais la frontière loi → peau.
 *
 * Identité = l'INDEX du tableau, jamais `laneIndex` seul : au partage de
 * colonnes (§7ter C, plus de 7 voix), deux entrées PEUVENT porter le même
 * `laneIndex` pendant un fondu croisé (« occupations qui se touchent » — deux
 * `laneId` différents, même colonne). `laneIndex` seul romprait l'unicité de
 * la clé React.
 *
 * `aria-hidden` — décoratif : le nom vit DÉJÀ dans chaque bulle en tête de
 * groupe (§7ter A2), VoiceOver n'a rien à annoncer de plus ici.
 */
'use client';

import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import type { RiverLaneHeader } from '@meeshy/shared/utils/river-lanes';

export interface RiverLaneHeaderStripProps {
  readonly headers: readonly RiverLaneHeader[];
  readonly railX: (laneIndex: number) => number;
  readonly widthPx: number;
  /** Résolu par l'appelant (`t('focal.row.you')`) — même patron que `RiverBubble`. */
  readonly youLabel: string;
}

export function RiverLaneHeaderStrip({ headers, railX, widthPx, youLabel }: RiverLaneHeaderStripProps) {
  return (
    <div
      data-testid="river-lane-header-strip"
      aria-hidden="true"
      style={{
        position: 'relative',
        width: widthPx,
        height: 'var(--lentille-river-lane-header-height)',
      }}
    >
      {headers.map((header, index) => {
        const color = colorForName(header.colorSeed);
        const label = header.isViewer ? youLabel : header.colorSeed;

        return (
          <div
            key={`${header.laneId}-${index}`}
            data-testid="river-lane-header"
            data-lane-index={header.laneIndex}
            data-lane-id={header.laneId}
            style={{
              position: 'absolute',
              left: railX(header.laneIndex),
              top: 0,
              height: 'var(--lentille-river-lane-header-height)',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: header.alpha,
              color,
              whiteSpace: 'nowrap',
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: color }}
            />
            <b style={{ fontSize: '11.5px', letterSpacing: '0.08em' }}>{label.toUpperCase()}</b>
          </div>
        );
      })}
    </div>
  );
}

export default RiverLaneHeaderStrip;

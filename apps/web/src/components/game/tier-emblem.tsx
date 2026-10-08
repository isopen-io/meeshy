import { useId } from 'react';

import type { LevelTierKey } from '@meeshy/shared/utils/game/levels';

import { isSpectralTier } from '@/lib/game/ladder';
import { paintUrl, safeUid } from '@/lib/game/materials';
import { EMBLEM_BOX, TIER_EMBLEMS, type EmblemShape } from '@/lib/game/tier-emblem';

import { PaintDefs } from './paint-defs';
import { SignatureGlyph } from './signature';

/**
 * L'EMBLÈME D'UN PALIER (#9481) — le dessin du palier (`lib/game/tier-emblem.ts`,
 * dix formes bâties autour de la Signature) à la couleur spectrale du palier :
 * un jeton `--game-tier-<palier>`, le prisme pour Galaxie.
 *
 *   · `TierEmblemGlyph` se pose DANS le SVG d'un hôte (l'anneau de niveau, en
 *     filigrane) ; l'hôte déclare les peintures de ses `<defs>` ;
 *   · `TierEmblem` est un dessin autonome.
 *
 * DÉCORATIF (`aria-hidden`) : l'hôte dit le palier.
 */

/** La couleur du palier : son jeton, ou le prisme (`uid` nomme les `<defs>` de l'hôte). */
export const tierColor = (uid: string, tier: LevelTierKey): string => (isSpectralTier(tier) ? paintUrl(uid, 'prism') : `var(--game-tier-${tier})`);

const SIGNATURE_SIZE = 30;
const KNOCKOUT = 'var(--ios-surface-card)';

function Shape({ shape, color }: { readonly shape: EmblemShape; readonly color: string }) {
  if (shape.kind === 'line') {
    return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={color} strokeWidth={shape.width} strokeLinecap="round" />;
  }
  const paint = shape.paint === 'fill' ? { fill: color } : { fill: 'none', stroke: color, strokeWidth: shape.width ?? 4, strokeLinecap: 'round' as const };
  return shape.kind === 'circle' ? <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...paint} /> : <path d={shape.d} {...paint} />;
}

type GlyphProps = {
  readonly uid: string;
  readonly tier: LevelTierKey;
  /** Centre et côté du carré de 100, dans le repère de l'hôte. */
  readonly cx: number;
  readonly cy: number;
  readonly size: number;
  /** Transparence du filigrane (1 : plein). */
  readonly opacity?: number;
};

export function TierEmblemGlyph({ uid, tier, cx, cy, size, opacity = 1 }: GlyphProps) {
  const design = TIER_EMBLEMS[tier];
  const color = tierColor(uid, tier);
  return (
    <g data-game-emblem={tier} opacity={opacity} transform={`translate(${cx} ${cy}) scale(${size / EMBLEM_BOX})`}>
      {design.shapes.map((shape, index) => (
        <Shape key={index} shape={shape} color={color} />
      ))}
      <SignatureGlyph cx={0} cy={0} size={SIGNATURE_SIZE} color={design.core === 'filled' ? KNOCKOUT : color} mode="flat" strokeWidth={120} />
    </g>
  );
}

export function TierEmblem({ tier, size }: { readonly tier: LevelTierKey; readonly size: number }) {
  const uid = safeUid(useId());
  return (
    <svg viewBox={`0 0 ${EMBLEM_BOX} ${EMBLEM_BOX}`} width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <PaintDefs uid={uid} paints={['prism']} />
      </defs>
      <TierEmblemGlyph uid={uid} tier={tier} cx={EMBLEM_BOX / 2} cy={EMBLEM_BOX / 2} size={EMBLEM_BOX - 6} />
    </svg>
  );
}

import { useId } from 'react';

import type { EngagementAxisFamily } from '@meeshy/shared/types/engagement';

import { inkToken, paintUrl, safeUid, tokenVar } from '@/lib/game/materials';
import {
  MEDAL_ARC_CIRCUMFERENCE,
  MEDAL_ARC_RADIUS,
  MEDAL_BEZEL_RADIUS,
  MEDAL_CENTER,
  MEDAL_ENAMEL_RADIUS,
  arcLength,
  enamelToken,
  hasRibbon,
  medalMaterial,
  pearls,
  type MedalPictogram,
} from '@/lib/game/medal';

import { PaintDefs } from './paint-defs';
import { SignatureGlyph } from './signature';

/**
 * LA MÉDAILLE (#9466) — la forme d'un badge d'accumulation (`lib/game/medal.ts`
 * en tient les règles) : une lunette de métal biseautée, un champ émaillé à la
 * couleur de la famille, un pictogramme d'axe au trait, sept perles de palier,
 * le poinçon Signature, un ruban à partir de l'Or portant le palier en
 * cartouche, et l'arc de progression vers le palier suivant. Le prisme irise
 * son émail. `tier` 0 dessine l'EMPREINTE d'un badge éteint : la même
 * médaille en creux, sans métal, et `missing` (« −37 ») sous elle.
 *
 * DÉCORATIVE (`aria-hidden`) tant que l'hôte ne passe pas `label` (« Messages
 * texte, Or, 100 sur 500 vers Platine »). Le corps porte `data-game-badge-body`
 * et l'empreinte `data-game-imprint` : ce sont les cibles de la chorégraphie
 * « badge » (le métal remonte, l'empreinte se retire).
 */

const { x: CX, y: CY } = MEDAL_CENTER;
const INK = 'var(--game-glint)';
const MUTED = 'var(--ios-ink-2)';

const starPath = (r: number): string =>
  Array.from({ length: 10 }, (_, k) => {
    const a = (k * Math.PI) / 5 - Math.PI / 2;
    const rr = k % 2 === 1 ? r * 0.45 : r;
    return `${k === 0 ? 'M' : 'L'}${(rr * Math.cos(a)).toFixed(1)} ${(rr * Math.sin(a)).toFixed(1)}`;
  }).join('') + 'Z';

/** Les pictogrammes, au trait, centrés sur l'origine : jamais une bulle de conversation. */
function Pictogram({ kind, color }: { readonly kind: MedalPictogram; readonly color: string }) {
  const line = { fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (kind) {
    case 'text':
      return (
        <text y="5" textAnchor="middle" fontFamily="var(--font-native)" fontWeight="800" fontSize="15" fill={color}>
          Aa
        </text>
      );
    case 'voice':
      return (
        <>
          <rect x="-4" y="-10" width="8" height="13" rx="4" fill={color} />
          <path d="M-8 0a8 8 0 0 0 16 0M0 8v5" {...line} strokeWidth={2.2} />
        </>
      );
    case 'story':
      return (
        <>
          <circle r="9" {...line} strokeDasharray="4 3" />
          <circle r="3.5" fill={color} />
        </>
      );
    case 'post':
      return (
        <>
          <rect x="-8" y="-8" width="16" height="16" rx="3" {...line} />
          <path d="M-4 -2h8M-4 3h5" {...line} strokeWidth={2} />
        </>
      );
    case 'reel':
      return <path d="M-5 -8 L9 0 L-5 8 Z" fill={color} />;
    case 'comment':
      return <path d="M-9 -6h6v6l-3 6h-3l2-6h-2zM2 -6h6v6l-3 6h-3l2-6h-2z" fill={color} />;
    case 'conversation':
      return (
        <>
          <circle cx="-6" cy="0" r="4" fill={color} />
          <circle cx="7" cy="0" r="4" fill={color} />
          <path d="M-2 0h5" stroke={color} strokeWidth="2.6" />
        </>
      );
    case 'tool':
      return <path d={starPath(10)} fill={color} />;
    case 'social':
      return (
        <>
          <rect x="-11" y="-4" width="12" height="8" rx="4" {...line} />
          <rect x="-1" y="-4" width="12" height="8" rx="4" {...line} />
        </>
      );
  }
}

type Props = {
  readonly size: number;
  readonly family: EngagementAxisFamily;
  readonly pictogram: MedalPictogram;
  /** Les paliers atteints, 0 à 7 ; 0 : l'empreinte d'un badge éteint. */
  readonly tier: number;
  /** La part du chemin vers le palier suivant, 0 à 1. */
  readonly progress?: number;
  /** Le palier atteint, écrit dans le cartouche du ruban (« 100 »). */
  readonly threshold?: string;
  /** Ce qu'il manque pour rallumer l'empreinte (« −37 »). */
  readonly missing?: string;
  /** Le libellé lu par un lecteur d'écran ; absent : la médaille est décorative. */
  readonly label?: string;
};

export function GameMedal({ size, family, pictogram, tier, progress = 0, threshold, missing, label }: Props) {
  const uid = safeUid(useId());
  const material = medalMaterial(tier);
  const enamel = enamelToken(family);
  const root = {
    viewBox: '0 0 100 112',
    width: size,
    height: Math.round(size * 1.12),
    focusable: 'false' as const,
    'data-game-medal': family,
    ...(label === undefined ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': label }),
  };

  if (material === null) {
    return (
      <svg {...root}>
        <g data-game-imprint="">
          <circle cx={CX} cy={CY} r={MEDAL_BEZEL_RADIUS} fill="var(--ios-surface-card)" stroke={MUTED} strokeWidth="2" strokeDasharray="4 4" />
          <circle cx={CX} cy={CY} r={MEDAL_ENAMEL_RADIUS - 1} fill="none" stroke={tokenVar('track')} strokeWidth="2" />
          <g transform={`translate(${CX} ${CY - 2})`} opacity="0.35" data-game-pictogram={pictogram}>
            <Pictogram kind={pictogram} color={MUTED} />
          </g>
          {missing === undefined ? null : (
            <text x={CX} y="104" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill={MUTED}>
              {missing}
            </text>
          )}
        </g>
      </svg>
    );
  }

  const ink = inkToken(material);
  return (
    <svg {...root} data-game-material={material}>
      <defs>
        <PaintDefs uid={uid} paints={[...new Set([material, 'prism' as const])]} sheen />
      </defs>
      <g data-game-badge-body="">
        {hasRibbon(tier) ? (
          <g data-game-ribbon="">
            <path d="M38 74 l-8 30 9-6 5 9 6-30z" fill={enamel} />
            <path d="M62 74 l8 30 -9-6 -5 9 -6-30z" fill={enamel} opacity="0.85" />
          </g>
        ) : null}
        <circle data-game-medal-track="" cx={CX} cy={CY} r={MEDAL_ARC_RADIUS} fill="none" stroke={tokenVar('track')} strokeWidth="3" />
        <circle
          data-game-medal-arc=""
          cx={CX}
          cy={CY}
          r={MEDAL_ARC_RADIUS}
          fill="none"
          stroke={enamel}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${arcLength(progress).toFixed(1)} ${MEDAL_ARC_CIRCUMFERENCE.toFixed(1)}`}
          transform={`rotate(-90 ${CX} ${CY})`}
        />
        <circle data-game-bezel="" cx={CX} cy={CY} r={MEDAL_BEZEL_RADIUS} fill={paintUrl(uid, material)} stroke={tokenVar('edge')} strokeOpacity="0.3" />
        <circle cx={CX} cy={CY} r={MEDAL_BEZEL_RADIUS - 1} fill="none" stroke={tokenVar('glint')} strokeOpacity="0.4" strokeWidth="1" />
        <circle cx={CX} cy={CY} r={MEDAL_BEZEL_RADIUS - 5} fill="none" stroke={tokenVar('glint')} strokeOpacity="0.55" strokeWidth="1.4" />
        <circle data-game-enamel="" cx={CX} cy={CY} r={MEDAL_ENAMEL_RADIUS} fill={enamel} />
        <circle cx={CX} cy={CY} r={MEDAL_ENAMEL_RADIUS} fill={`url(#${uid}-sheen)`} opacity="0.18" />
        {material === 'prism' ? <circle data-game-iridescence="" cx={CX} cy={CY} r={MEDAL_ENAMEL_RADIUS} fill={paintUrl(uid, 'prism')} opacity="0.38" /> : null}
        <g transform={`translate(${CX} ${CY - 2})`} data-game-pictogram={pictogram}>
          <Pictogram kind={pictogram} color={INK} />
        </g>
        {pearls(tier).map((pearl, k) => (
          <circle
            key={k}
            data-game-pearl={pearl.lit ? 'on' : 'off'}
            cx={pearl.x}
            cy={pearl.y}
            r="2.1"
            fill={pearl.lit ? INK : 'none'}
            stroke={INK}
            strokeOpacity="0.8"
            strokeWidth="1"
          />
        ))}
        <SignatureGlyph cx={CX} cy={80.5} size={13} color={ink} mode="engraved" strokeWidth={130} />
        {hasRibbon(tier) && threshold !== undefined ? (
          <>
            <rect x="36" y="99" width="28" height="11" rx="3" fill={tokenVar('edge')} />
            <text data-game-ribbon-label="" x={CX} y="107" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="7.5" fill={INK}>
              {threshold}
            </text>
          </>
        ) : null}
      </g>
    </svg>
  );
}

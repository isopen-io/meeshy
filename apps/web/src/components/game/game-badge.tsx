import { useId } from 'react';

import { inkToken, paintUrl, safeUid, tokenVar, type GameMaterial } from '@/lib/game/materials';

import { PaintDefs } from './paint-defs';
import { SignatureGlyph } from './signature';

/**
 * LES BADGES (#9380) — trois formes pour trois sens :
 *   · hexagone  `accumulation` — combien de fois (`label` : « 100 ») ;
 *   · losange   `record`       — le meilleur ;
 *   · médaillon `collection`   — à réunir (`collected` points pleins sur `total`).
 * Sept matières (cuivre, bronze, argent, or, platine, obsidienne, prisme) :
 * la matière dit la hauteur atteinte, la Signature y est GRAVÉE à l'encre de
 * la matière.
 *
 * `imprint` dessine l'EMPREINTE d'un badge ÉTEINT : le contour en pointillé,
 * sans matière, et ce qu'il manque pour le rallumer (`label` : « −37 »).
 * Le moteur d'animation la fait « se retirer en pointillé » ou la matière
 * « remonter du bas » : le corps porte `data-game-badge-body`.
 *
 * DÉCORATIF (`aria-hidden`) : l'hôte dit « Messages texte, or, 100 ».
 */

export type GameBadgeShape = 'accumulation' | 'record' | 'collection';

const HEXAGON = '36,4 64,20 64,52 36,68 8,52 8,20';
const DIAMOND = 'M36 3 L66 36 L36 69 L6 36 Z';

const DEFAULT_MATERIAL: Readonly<Record<GameBadgeShape, GameMaterial>> = { accumulation: 'gold', record: 'platinum', collection: 'prism' };

const count = (value: number | undefined, fallback: number): number => (value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, Math.floor(value)));

type Props = {
  readonly shape: GameBadgeShape;
  readonly size: number;
  readonly material?: GameMaterial;
  readonly label?: string;
  readonly imprint?: boolean;
  readonly collected?: number;
  readonly total?: number;
};

const MUTED = 'var(--ios-ink-2)';

function Outline({ shape }: { readonly shape: GameBadgeShape }) {
  const stroke = { fill: 'none', stroke: MUTED, strokeWidth: 2, strokeDasharray: '4 4' } as const;
  if (shape === 'accumulation') return <polygon points={HEXAGON} {...stroke} />;
  if (shape === 'record') return <path d={DIAMOND} {...stroke} />;
  return <circle cx="36" cy="36" r="30" {...stroke} />;
}

function CollectionDots({ collected, total }: { readonly collected: number; readonly total: number }) {
  const slots = Math.max(1, total);
  const full = Math.min(collected, slots);
  return (
    <>
      {Array.from({ length: slots }, (_, k) => {
        const angle = (k / slots) * Math.PI * 2 - Math.PI / 2;
        const on = k < full;
        return (
          <circle
            key={k}
            data-game-dot={on ? 'on' : 'off'}
            cx={(36 + 18 * Math.cos(angle)).toFixed(1)}
            cy={(36 + 18 * Math.sin(angle)).toFixed(1)}
            r="3.6"
            fill={on ? 'var(--ios-indigo-600)' : 'none'}
            stroke="var(--ios-indigo-600)"
            strokeWidth="1.4"
          />
        );
      })}
    </>
  );
}

export function GameBadge({ shape, size, material, label, imprint = false, collected, total }: Props) {
  const uid = safeUid(useId());
  const paint = material ?? DEFAULT_MATERIAL[shape];
  const ink = inkToken(paint);
  const edge = { stroke: tokenVar('edge'), strokeOpacity: 0.25 } as const;
  return (
    <svg viewBox="0 0 72 72" width={size} height={size} aria-hidden="true" focusable="false" data-game-badge={shape}>
      <defs>
        <PaintDefs uid={uid} paints={[paint]} />
      </defs>
      {imprint ? (
        <g data-game-imprint="">
          <Outline shape={shape} />
          <SignatureGlyph cx={36} cy={32} size={34} color={MUTED} mode="flat" strokeWidth={90} />
          {label !== undefined ? (
            <text x="36" y="58" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={MUTED}>
              {label}
            </text>
          ) : null}
        </g>
      ) : (
        <g data-game-badge-body="">
          {shape === 'accumulation' ? (
            <>
              <polygon points={HEXAGON} fill={paintUrl(uid, paint)} {...edge} />
              <SignatureGlyph cx={36} cy={32} size={34} color={ink} mode="engraved" strokeWidth={100} />
              {label !== undefined ? (
                <text x="36" y="58" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" fill={ink}>
                  {label}
                </text>
              ) : null}
            </>
          ) : null}
          {shape === 'record' ? (
            <>
              <path d={DIAMOND} fill={paintUrl(uid, paint)} {...edge} />
              <SignatureGlyph cx={36} cy={36} size={34} color={ink} mode="engraved" strokeWidth={100} />
            </>
          ) : null}
          {shape === 'collection' ? (
            <>
              <circle cx="36" cy="36" r="31" fill={paintUrl(uid, paint)} />
              <circle cx="36" cy="36" r="24" fill="var(--ios-surface-card)" />
              <CollectionDots collected={count(collected, 0)} total={count(total, 6)} />
              <SignatureGlyph cx={36} cy={36} size={22} color="var(--ios-ink)" mode="flat" strokeWidth={110} />
            </>
          ) : null}
        </g>
      )}
    </svg>
  );
}

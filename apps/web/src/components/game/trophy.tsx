import { useId } from 'react';

import { inkToken, paintUrl, safeUid, tokenVar, type GameMaterial, type GamePaint } from '@/lib/game/materials';

import { BirdCutDefs, PaintDefs, PlacedBird } from './paint-defs';
import { SignatureGlyph } from './signature';

/**
 * LES TROPHÉES (#9380, conception IV.4) — la coupe de ligue (or, argent ou
 * bronze), de saison (platine), de Prestige (prisme, avec Mee et Meo
 * couronnés à la base) et de Flamme (feu). La Signature y est FRAPPÉE ; la
 * plaque porte l'étiquette que l'hôte donne, localisée (« JADE · S41 »).
 *
 * DÉCORATIF (`aria-hidden`) : l'hôte dit « Coupe de ligue Jade, saison 41 ».
 */

export type TrophyKind = 'league' | 'season' | 'prestige' | 'flame';

const DEFAULT_PAINT: Readonly<Record<TrophyKind, GamePaint>> = { league: 'gold', season: 'platinum', prestige: 'prism', flame: 'flame' };

type Props = {
  readonly kind: TrophyKind;
  /** Largeur dessinée ; la hauteur suit. */
  readonly size: number;
  /** La matière de la coupe de ligue (or par défaut). Ignorée par les autres. */
  readonly material?: GameMaterial;
  /** Le texte de la plaque, en capitales, localisé par l'hôte. */
  readonly label?: string;
};

const CUP_WIDTH = 120;
const CUP_HEIGHT = 124;
const PRESTIGE_WIDTH = 170;

function Cup({ uid, paint, label }: { readonly uid: string; readonly paint: GamePaint; readonly label: string | undefined }) {
  const fill = paintUrl(uid, paint);
  return (
    <g data-game-cup="">
      <path d="M30 22 c-17 0 -19 24 3 28 M90 22 c17 0 19 24 -3 28" fill="none" stroke={fill} strokeWidth="5" />
      <path d="M30 12 h60 v22 c0 22 -14 36 -30 38 c-16 -2 -30 -16 -30 -38 z" fill={fill} stroke={tokenVar('edge')} strokeOpacity="0.3" />
      <rect x="54" y="72" width="12" height="16" fill={fill} />
      <rect x="36" y="88" width="48" height="9" rx="2" fill={fill} />
      <rect x="30" y="97" width="60" height="17" rx="3" fill={tokenVar('edge')} fillOpacity="0.88" />
      <SignatureGlyph cx={60} cy={38} size={42} color={inkToken(paint)} mode="struck" strokeWidth={100} />
      {label !== undefined ? (
        <text x="60" y="109" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="7.5" letterSpacing="1" fill={tokenVar('glint')}>
          {label}
        </text>
      ) : null}
    </g>
  );
}

export function Trophy({ kind, size, material, label }: Props) {
  const uid = safeUid(useId());
  const paint: GamePaint = kind === 'league' && material !== undefined ? material : DEFAULT_PAINT[kind];
  const prestige = kind === 'prestige';
  const width = prestige ? PRESTIGE_WIDTH : CUP_WIDTH;
  return (
    <svg
      viewBox={`0 0 ${width} ${CUP_HEIGHT}`}
      width={size}
      height={Math.round((size * CUP_HEIGHT) / width)}
      aria-hidden="true"
      focusable="false"
      data-game-trophy={kind}
    >
      <defs>
        <PaintDefs uid={uid} paints={[paint]} />
        {prestige ? <BirdCutDefs uid={uid} /> : null}
      </defs>
      {prestige ? (
        <>
          <PlacedBird uid={uid} bird="meeCrown" x={0} y={58} scale={0.4} />
          <PlacedBird uid={uid} bird="meoCrown" x={170} y={58} scale={0.4} flip />
          <g transform="translate(25 0)">
            <Cup uid={uid} paint={paint} label={label} />
          </g>
        </>
      ) : (
        <Cup uid={uid} paint={paint} label={label} />
      )}
    </svg>
  );
}

import { useId } from 'react';

import type { GloryDivision, GloryRankOrMythic } from '@meeshy/shared/utils/game/glory';

import { blasonDesign } from '@/lib/game/ranks';
import { inkToken, paintUrl, safeUid, tokenVar, type GamePaint } from '@/lib/game/materials';

import { BirdCutDefs, PaintDefs, PlacedBird } from './paint-defs';
import { SignatureGlyph } from './signature';

/**
 * LE BLASON D'UN RANG (#9380, conception IV.3). Un écu par rang ; la matière
 * et les pièces héraldiques montent avec lui (`lib/game/ranks.ts` en tient la
 * table). À partir d'Ambassadeur, Mee et Meo tiennent l'écu ; à Légende ils
 * sont couronnés ; à Mythe, auréolés. La division s'affiche en chevrons sous
 * l'écu (III = 3 chevrons, I = 1) ; le Mythe n'en a pas.
 *
 * La Signature est GRAVÉE au cœur de l'écu. Le ruban porte le nom du rang :
 * l'hôte passe `label` déjà localisé (aucun texte n'est écrit ici).
 *
 * DÉCORATIF (`aria-hidden`) : le rang et sa division sont dits par l'hôte.
 * `data-game-shield` est la cible du geste « l'écu monte » ; les `data-game-dash`
 * de la Signature, celle de « la Signature se grave trait par trait » ; les
 * `data-game-bird`, celle de « les tenants se posent ».
 */

const ECU = 'M14 10 h72 v38 c0 24 -16 37 -36 45 c-20 -8 -36 -21 -36 -45 z';
const INNER = 'M21 16 h58 v32 c0 19 -12 30 -29 37 c-17 -7 -29 -18 -29 -37 z';
const BAND = 'M14 10 h72 v15 h-72z';
const CROWN = 'M78 26 l6 -16 8 10 8 -14 8 14 8 -10 6 16 z';

const starPath = (x: number, y: number, r: number): string =>
  Array.from({ length: 10 }, (_, k) => {
    const a = (k * Math.PI) / 5 - Math.PI / 2;
    const rr = k % 2 === 1 ? r * 0.45 : r;
    return `${k === 0 ? 'M' : 'L'}${(x + rr * Math.cos(a)).toFixed(1)} ${(y + rr * Math.sin(a)).toFixed(1)}`;
  }).join('') + 'Z';

const LAUREL_LEAVES = [0, 1, 2] as const;

function Laurel() {
  return (
    <g data-game-laurel="">
      <path d="M60 132 q-18 -12 -14 -40 M140 132 q18 -12 14 -40" fill="none" stroke="var(--ios-success-deep)" strokeWidth="3.5" strokeLinecap="round" />
      {LAUREL_LEAVES.map((k) => (
        <g key={k}>
          <ellipse cx={50 - k} cy={120 - k * 12} rx="5" ry="2.6" transform={`rotate(-50 ${50 - k} ${120 - k * 12})`} fill="var(--ios-success-deep)" />
          <ellipse cx={150 + k} cy={120 - k * 12} rx="5" ry="2.6" transform={`rotate(50 ${150 + k} ${120 - k * 12})`} fill="var(--ios-success-deep)" />
        </g>
      ))}
    </g>
  );
}

function Pieces({ kind }: { readonly kind: 'stars' | 'dots' }) {
  return (
    <g data-game-piece={kind}>
      {kind === 'stars' ? (
        <path d={`${starPath(32, 18, 5)} ${starPath(68, 18, 5)}`} fill={tokenVar('glint')} />
      ) : (
        [38, 50, 62].map((x) => <circle key={x} cx={x} cy="18" r="3" fill={tokenVar('glint')} />)
      )}
    </g>
  );
}

type Props = {
  readonly rank: GloryRankOrMythic;
  /** La division (3 = III … 1 = I) ; `null` ou absente : aucun chevron. */
  readonly division?: GloryDivision | null;
  /** Largeur dessinée ; la hauteur suit (200 × 184). */
  readonly size: number;
  /** Le nom du rang, localisé par l'hôte, écrit en capitales sur le ruban. */
  readonly label?: string;
};

export function RankBlason({ rank, division = null, size, label }: Props) {
  const uid = safeUid(useId());
  const design = blasonDesign(rank);
  const paints: readonly GamePaint[] = [design.material, 'gold', ...(rank === 'mythe' ? (['prism'] as const) : [])];
  const crownPaint: GamePaint = rank === 'mythe' ? 'prism' : 'gold';
  const ink = inkToken(design.material);
  const chevronCount = design.chevrons && division !== null ? division : 0;
  return (
    <svg
      viewBox="0 0 200 184"
      width={size}
      height={Math.round((size * 184) / 200)}
      aria-hidden="true"
      focusable="false"
      data-game-rank={rank}
    >
      <defs>
        <PaintDefs uid={uid} paints={[...new Set(paints)]} />
        <BirdCutDefs uid={uid} />
      </defs>
      {design.laurel ? <Laurel /> : null}
      {design.tenants !== null ? (
        <>
          <PlacedBird uid={uid} bird={design.tenants.mee} x={0} y={62} scale={0.42} />
          <PlacedBird uid={uid} bird={design.tenants.meo} x={200} y={62} scale={0.42} flip />
        </>
      ) : null}
      {design.crest === 'star' ? <path d={starPath(100, 13, 11)} fill={paintUrl(uid, 'platinum')} stroke={tokenVar('edge')} strokeOpacity="0.35" /> : null}
      {design.crest === 'crown' ? <path d={CROWN} fill={paintUrl(uid, crownPaint)} stroke={tokenVar('edge')} strokeOpacity="0.35" /> : null}
      <g transform="translate(50 26)">
        <g data-game-shield="">
          <path d={ECU} fill={paintUrl(uid, design.material)} stroke={tokenVar('edge')} strokeOpacity="0.35" strokeWidth="2" />
          {design.inner ? <path d={INNER} fill="none" stroke={tokenVar('glint')} strokeOpacity="0.5" strokeWidth="2" /> : null}
          {design.band ? <path d={BAND} fill={tokenVar('edge')} fillOpacity="0.16" /> : null}
          {design.pieces !== 'none' ? <Pieces kind={design.pieces} /> : null}
          <SignatureGlyph cx={50} cy={55} size={60} color={ink} mode="engraved" strokeWidth={96} />
        </g>
      </g>
      {design.ribbon ? (
        <g data-game-ribbon="">
          <path d="M52 140 h96 l-7 8 7 8 h-96 l7 -8z" fill="var(--ios-indigo-600)" />
          {label !== undefined ? (
            <text x="100" y="151.5" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8.5" letterSpacing="1.4" fill="var(--ios-on-brand)">
              {label.toLocaleUpperCase()}
            </text>
          ) : null}
        </g>
      ) : null}
      {Array.from({ length: chevronCount }, (_, k) => (
        <path key={k} data-game-chevron="" d={`M90 ${162 + k * 6} l10 5 10 -5`} fill="none" stroke="var(--ios-indigo-600)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

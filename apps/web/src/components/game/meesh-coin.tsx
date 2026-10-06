import { useId, type CSSProperties } from 'react';

import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';

import { inkToken, paintUrl, safeUid, tokenVar, type GamePaint } from '@/lib/game/materials';

import { BirdEngraveDefs, PaintDefs, PlacedBird } from './paint-defs';
import { SignatureGlyph } from './signature';

/**
 * LA MEESH (#9380, conception IV.2) — la pièce du jeu.
 *
 *   · AVERS  : la Signature FRAPPÉE au centre, « MEESHY · UNE MEESH » en
 *     couronne, tranche cannelée (un cercle en pointillé) ;
 *   · REVERS : Mee et Meo face à face (Meo retourné), le numéro de frappe et
 *     l'année.
 *
 * Trois éditions, que la loi partagée décide (`meeshEdition`) : argent, or
 * (chaque centième), prisme (chaque millième). Le fond de la pièce reste argent.
 *
 * DÉCORATIF : `aria-hidden`. L'hôte dit « Meesh n° 13, argent » en texte.
 * `data-game-sheen` est le trait de reflet : le moteur WebGL2 le remplace (il
 * pose `data-game-gl="on"` sur son hôte), le repli CSS le balaie trois fois.
 */

export type MeeshCoinSide = 'obverse' | 'reverse';

type CoinProps = {
  readonly side: MeeshCoinSide;
  readonly size: number;
  readonly edition?: MeeshEdition;
  /** Le numéro de frappe (revers). */
  readonly number?: number;
  readonly year?: number;
  /** Le libellé du numéro, localisé par l'hôte (« N° 13 »). Absent : `N° ${number}`. */
  readonly numberLabel?: string;
  /** L'inscription en couronne ; répétée deux fois sur le pourtour. */
  readonly inscription?: string;
};

const METAL: Readonly<Record<MeeshEdition, GamePaint>> = { silver: 'coin-silver', gold: 'coin-gold', prism: 'prism' };

const RING = 'M60 60 m-43 0 a43 43 0 1 1 86 0 a43 43 0 1 1 -86 0';

function Rim({ uid, edition }: { readonly uid: string; readonly edition: MeeshEdition }) {
  return (
    <>
      <circle cx="60" cy="60" r="57" fill={paintUrl(uid, METAL[edition])} />
      <circle cx="60" cy="60" r="53" fill="none" stroke={tokenVar('rim')} strokeWidth="1.4" strokeDasharray="1.4 2" />
    </>
  );
}

function Sheen({ uid, clip }: { readonly uid: string; readonly clip: string }) {
  return (
    <g clipPath={`url(#${clip})`}>
      <g transform="rotate(20 60 60)">
        <rect data-game-sheen="" x="20" y="-10" width="24" height="140" fill={`url(#${uid}-sheen)`} opacity="0.7" />
      </g>
    </g>
  );
}

export function MeeshCoin({ side, size, edition = 'silver', number, year, numberLabel, inscription = 'MEESHY · UNE MEESH' }: CoinProps) {
  const uid = safeUid(useId());
  const ink = inkToken('coin-silver');
  const ring = `${uid}-ring`;
  const clip = `${uid}-clip`;
  const label = numberLabel ?? (number === undefined ? undefined : `N° ${number}`);
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      data-game-coin=""
      data-game-face={side}
      data-game-edition={edition}
    >
      <defs>
        <PaintDefs uid={uid} paints={[METAL[edition], 'coin-silver-in']} sheen />
        <path id={ring} d={RING} />
        <clipPath id={clip}>
          <circle cx="60" cy="60" r="56" />
        </clipPath>
        {side === 'reverse' ? <BirdEngraveDefs uid={uid} /> : null}
      </defs>
      <Rim uid={uid} edition={edition} />
      {side === 'obverse' ? (
        <>
          <circle cx="60" cy="60" r="35" fill={paintUrl(uid, 'coin-silver-in')} stroke={tokenVar('glint')} strokeWidth="1.6" />
          <text fontFamily="var(--font-mono)" fontSize="8.4" letterSpacing="2" fill={ink}>
            <textPath href={`#${ring}`}>{`${inscription} · ${inscription} ·`}</textPath>
          </text>
          <SignatureGlyph cx={60} cy={60} size={66} color={ink} mode="struck" strokeWidth={100} />
        </>
      ) : (
        <>
          <circle cx="60" cy="60" r="45" fill={paintUrl(uid, 'coin-silver-in')} stroke={tokenVar('glint')} strokeWidth="1.4" />
          <PlacedBird uid={uid} bird="meeJoy" x={13} y={30} scale={0.34} relief="engraved" />
          <PlacedBird uid={uid} bird="meoOpen" x={107} y={30} scale={0.34} flip relief="engraved" />
          {label !== undefined ? (
            <text x="60" y="96" textAnchor="middle" fontFamily="var(--font-native)" fontWeight="800" fontSize="13" fill={ink}>
              {label}
            </text>
          ) : null}
          {year !== undefined ? (
            <text x="60" y="27" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" letterSpacing="2" fill={ink}>
              {String(year)}
            </text>
          ) : null}
        </>
      )}
      <Sheen uid={uid} clip={clip} />
    </svg>
  );
}

type FlipProps = Omit<CoinProps, 'side'> & { readonly face: MeeshCoinSide };

const STACK: CSSProperties = { position: 'absolute', inset: 0 };

/**
 * LES DEUX FACES SUPERPOSÉES, pour la frappe : « la pièce se retourne et montre
 * son numéro ». La chorégraphie (`lib/game/choreography.ts`) fait basculer
 * `[data-game-face]` en `scaleX` + `opacity` — un retournement en deux
 * dimensions, sans propriété de mise en page. `face` est la face MONTRÉE au
 * repos : l'hôte la change au début du geste, le moteur joue la transition.
 */
export function MeeshCoinFlip({ face, size, ...rest }: FlipProps) {
  const hidden = (side: MeeshCoinSide): CSSProperties => ({ ...STACK, opacity: side === face ? 1 : 0 });
  return (
    <span data-game-coin-flip="" style={{ position: 'relative', display: 'inline-block', width: size, height: size }}>
      <span style={hidden('obverse')} data-game-face-wrap="obverse">
        <MeeshCoin {...rest} size={size} side="obverse" />
      </span>
      <span style={hidden('reverse')} data-game-face-wrap="reverse">
        <MeeshCoin {...rest} size={size} side="reverse" />
      </span>
    </span>
  );
}

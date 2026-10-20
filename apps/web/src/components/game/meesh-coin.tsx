import { useId, type CSSProperties } from 'react';

import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';

import { COIN, coinEdition, type CoinDecor, type CoinSide } from '@/lib/game/coin-geometry';
import { inkToken, paintUrl, safeUid, tokenVar, type GamePaint } from '@/lib/game/materials';

import { Beads, Cabochons, Flute, Guilloche, Inscription, Laurels, RoyalCrown, Sparkles, Veins } from './meesh-coin-decor';
import { BirdEngraveDefs, PaintDefs, PlacedBird } from './paint-defs';
import { SignatureGlyph } from './signature';

/**
 * LA MEESH (#9380, épopée § 6, #11176) — la pièce du jeu.
 *
 *   · AVERS, pour toutes les éditions : la Signature FRAPPÉE au centre, la
 *     couronne UNIVERSELLE « MEESHY · 1 MEESH » (jamais traduite), la tranche
 *     cannelée ;
 *   · REVERS : l'oiseau ou les oiseaux de l'édition — Mee (argent), Meo (or),
 *     Mee et Meo face à face (prisme) —, GRAVÉS dans le métal et colorés
 *     (#9540), l'année et « Nº » : le o en exposant SOULIGNÉ, le nombre en petit.
 *
 * Trois éditions, que la loi partagée décide (`meeshEdition`) : argent veiné
 * d'or, SOBRE ; or PUR, centre compris, RAFFINÉ ; or mêlé de diamant, ROYAL.
 * Toute la géométrie — oiseaux, décors, couronne, numéro — se lit dans
 * `packages/shared/design/meesh-coin.json`, que iOS rejoue.
 *
 * DÉCORATIF : `aria-hidden`. L'hôte dit « Meesh n° 13, argent » en texte.
 * `data-game-sheen` est le trait de reflet : le moteur WebGL2 le remplace (il
 * pose `data-game-gl="on"` sur son hôte), le repli CSS le balaie trois fois.
 */

export type MeeshCoinSide = CoinSide;

type CoinProps = {
  readonly side: MeeshCoinSide;
  readonly size: number;
  readonly edition?: MeeshEdition;
  /** Le numéro de frappe (revers), écrit « Nº » + le nombre, dans toutes les langues. */
  readonly number?: number;
  readonly year?: number;
};

const C = COIN.center;
const BEADS = COIN.decor.beads;

function Sheen({ uid, clip }: { readonly uid: string; readonly clip: string }) {
  return (
    <g clipPath={`url(#${clip})`}>
      <g transform="rotate(20 60 60)">
        <rect data-game-sheen="" x="20" y="-10" width="24" height="140" fill={`url(#${uid}-sheen)`} opacity="0.7" />
      </g>
    </g>
  );
}

/** « Nº » : le N, le o monté et souligné, puis le nombre en petit, redescendu sur la ligne de base. */
function NumberMark({ number, ink }: { readonly number: number; readonly ink: string }) {
  const n = COIN.number;
  return (
    <text data-game-number={number} x={C} y={n.y} textAnchor="middle" fontFamily="var(--font-native)" fontWeight="800" fontSize={n.signSize} fill={ink}>
      {n.sign}
      <tspan data-game-number-ordinal="" fontSize={n.ordinalSize} dy={-n.ordinalRise} textDecoration="underline">
        {n.ordinal}
      </tspan>
      <tspan data-game-number-value="" fontSize={n.valueSize} dx={n.valueGap} dy={n.ordinalRise}>
        {String(number)}
      </tspan>
    </text>
  );
}

const paintsOf = (metal: GamePaint, field: GamePaint, decor: readonly CoinDecor[]): readonly GamePaint[] => [
  metal,
  field,
  ...(decor.includes('cabochons') ? (['diamond'] as const) : []),
  ...(decor.includes('crown') ? (['gold'] as const) : []),
];

export function MeeshCoin({ side, size, edition = 'silver', number, year }: CoinProps) {
  const uid = safeUid(useId());
  const spec = coinEdition(edition);
  const decor = spec.decor[side];
  const has = (name: CoinDecor): boolean => decor.includes(name);
  const ink = inkToken(spec.field);
  const field = COIN.field[side];
  const clip = `${uid}-clip`;
  const fieldClip = `${uid}-field`;
  const royal = edition === 'prism';
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
        <PaintDefs uid={uid} paints={paintsOf(spec.metal, spec.field, decor)} sheen iris={has('iris')} />
        <clipPath id={clip}>
          <circle cx={C} cy={C} r={COIN.body.radius - 1} />
        </clipPath>
        <clipPath id={fieldClip}>
          <circle cx={C} cy={C} r={field.radius} />
        </clipPath>
        {side === 'reverse' ? <BirdEngraveDefs uid={uid} /> : null}
      </defs>
      <circle cx={C} cy={C} r={COIN.body.radius} fill={paintUrl(uid, spec.metal)} />
      <Flute uid={uid} kind={spec.flute} ink={ink} />
      {has('beads') ? <Beads rings={royal ? BEADS.prism : BEADS.gold} fill={royal ? tokenVar('glint') : ink} opacity={royal ? 0.9 : 0.55} /> : null}
      {has('cabochons') ? <Cabochons uid={uid} ink={ink} /> : null}
      <circle cx={C} cy={C} r={field.radius} fill={paintUrl(uid, spec.field)} stroke={tokenVar('glint')} strokeWidth={field.stroke} />
      {has('veins') ? (
        <g clipPath={`url(#${clip})`}>
          <Veins />
        </g>
      ) : null}
      {has('rosette') ? <Guilloche kind="rosette" clip={fieldClip} fieldRadius={field.radius} ink={ink} /> : null}
      {has('sunburst') ? <Guilloche kind="sunburst" clip={fieldClip} fieldRadius={field.radius} ink={ink} /> : null}
      {side === 'obverse' ? (
        <>
          <Inscription separator={spec.separator} ink={ink} />
          <SignatureGlyph cx={C} cy={C} size={COIN.signature.size} color={ink} mode="struck" strokeWidth={COIN.signature.strokeWidth} />
        </>
      ) : (
        <>
          {spec.birds.map((b) => (
            <PlacedBird key={b.bird} uid={uid} bird={b.bird} x={b.x} y={b.y} scale={b.scale} flip={b.flip} relief="engraved" />
          ))}
          {has('crown') ? <RoyalCrown uid={uid} ink={ink} /> : null}
          {has('laurels') ? <Laurels ink={ink} /> : null}
          {number !== undefined ? <NumberMark number={number} ink={ink} /> : null}
          {year !== undefined ? (
            <text x={C} y={COIN.year.y} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={COIN.year.fontSize} letterSpacing={COIN.year.letterSpacing} fill={ink}>
              {String(year)}
            </text>
          ) : null}
        </>
      )}
      {has('sparkles') ? <Sparkles /> : null}
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

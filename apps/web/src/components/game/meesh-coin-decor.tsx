import { useMemo } from 'react';

import {
  COIN,
  beadPoints,
  cabochonShapes,
  inscriptionLayout,
  laurelLeafPath,
  rosetteCircles,
  sparklePath,
  starPath,
  sunburstRays,
  type BeadRing,
  type CoinFlute,
  type CoinSeparator,
} from '@/lib/game/coin-geometry';
import { paintUrl, tokenVar } from '@/lib/game/materials';

/**
 * LES DÉCORS DE LA MEESH (épopée § 6, #11176) — argent SOBRE, or RAFFINÉ,
 * prisme ROYAL. Chaque décor est un groupe `data-game-decor="<nom>"` et ne
 * dessine que ce que la géométrie partagée (`packages/shared/design/meesh-coin.json`)
 * lui donne : aucune coordonnée ne s'écrit ici. Les traits fins (grènetis,
 * guilloché) s'estompent d'eux-mêmes en petite taille : à 44 pt, restent la
 * matière et la silhouette.
 */

const CX = COIN.center;
const D = COIN.decor;

type Ink = { readonly ink: string };

export function Veins() {
  return (
    <g data-game-decor="veins" fill="none" stroke="var(--game-coin-vein)" strokeWidth={D.veins.width} strokeLinecap="round" opacity={D.veins.opacity}>
      {D.veins.paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
  );
}

/** Le grènetis : une couronne de perles (l'or), deux de part et d'autre de la tranche (le prisme). */
export function Beads({ rings, fill, opacity }: { readonly rings: readonly BeadRing[]; readonly fill: string; readonly opacity: number }) {
  const beads = useMemo(() => rings.flatMap((ring) => beadPoints(ring).map((p) => ({ ...p, r: ring.dot }))), [rings]);
  return (
    <g data-game-decor="beads" fill={fill} opacity={opacity}>
      {beads.map((b) => (
        <circle key={`${b.x} ${b.y}`} data-game-bead="" cx={b.x} cy={b.y} r={b.r} />
      ))}
    </g>
  );
}

/** Huit diamants taillés, sertis sur la tranche du prisme : l'octogone, sa table, un éclat. */
export function Cabochons({ uid, ink }: { readonly uid: string } & Ink) {
  return (
    <g data-game-decor="cabochons">
      {cabochonShapes().map((c) => (
        <g key={`${c.x} ${c.y}`} data-game-cabochon="">
          <path d={c.outer} fill={paintUrl(uid, 'diamond')} stroke={ink} strokeWidth="0.4" strokeLinejoin="round" />
          <path d={c.table} fill={tokenVar('glint')} opacity="0.8" />
        </g>
      ))}
    </g>
  );
}

/** Le guilloché, découpé au champ : une rosace (l'or) ou un soleil (le prisme). */
export function Guilloche({ kind, clip, fieldRadius, ink }: { readonly kind: 'rosette' | 'sunburst'; readonly clip: string; readonly fieldRadius: number } & Ink) {
  if (kind === 'rosette') {
    return (
      <g data-game-decor="rosette" clipPath={`url(#${clip})`} fill="none" stroke={ink} strokeWidth={D.rosette.width} opacity={D.rosette.opacity}>
        {rosetteCircles().map((c) => (
          <circle key={`${c.cx} ${c.cy}`} cx={c.cx} cy={c.cy} r={c.r} />
        ))}
      </g>
    );
  }
  return (
    <g data-game-decor="sunburst" clipPath={`url(#${clip})`} stroke={ink} strokeWidth={D.sunburst.width} strokeLinecap="round" opacity={D.sunburst.opacity}>
      {sunburstRays(fieldRadius).map((r) => (
        <line key={`${r.x2} ${r.y2}`} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
      ))}
    </g>
  );
}

const MONO = 'var(--font-mono)';

/** La couronne de l'avers, UNIVERSELLE : « MEESHY · 1 MEESH », lettre par lettre ; l'or remplace ses points par des étoiles. */
export function Inscription({ separator, ink }: { readonly separator: CoinSeparator } & Ink) {
  const layout = inscriptionLayout();
  const drawn = (glyph: (typeof layout)[number]): boolean => !(glyph.separator && separator === 'star');
  const stars = layout.filter((glyph) => !drawn(glyph));
  return (
    <>
      <g data-game-inscription="" fontFamily={MONO} fontSize={COIN.inscription.fontSize} fontWeight="600" textAnchor="middle" dominantBaseline="central" fill={ink}>
        {layout.filter(drawn).map((g) => (
          <text key={g.index} data-game-ring-glyph={g.glyph} data-game-ring-index={g.index} transform={`translate(${g.x} ${g.y}) rotate(${g.rotate})`}>
            {g.glyph}
          </text>
        ))}
      </g>
      {stars.length > 0 ? (
        <g data-game-decor="stars" fill={ink}>
          {stars.map((g) => (
            <path key={g.index} data-game-ring-glyph={g.glyph} data-game-ring-index={g.index} data-game-ring-star="" d={starPath(g)} />
          ))}
        </g>
      ) : null}
    </>
  );
}

function Laurel({ side, ink }: { readonly side: 'left' | 'right' } & Ink) {
  const mirror = side === 'right' ? `translate(${D.laurels.mirrorX * 2} 0) scale(-1 1)` : undefined;
  return (
    <g data-game-laurel={side} transform={mirror}>
      <path d={D.laurels.stem} fill="none" stroke={ink} strokeWidth={D.laurels.stemWidth} strokeLinecap="round" />
      {D.laurels.leaves.map((leaf) => (
        <path key={`${leaf.x} ${leaf.y}`} d={laurelLeafPath(leaf)} fill={ink} />
      ))}
    </g>
  );
}

/** Deux rameaux de laurier encadrent le numéro de l'or. */
export function Laurels({ ink }: Ink) {
  return (
    <g data-game-decor="laurels" opacity="0.85">
      <Laurel side="left" ink={ink} />
      <Laurel side="right" ink={ink} />
    </g>
  );
}

/** La couronne royale qui coiffe Mee et Meo au revers du prisme : or, joyaux de diamant. */
export function RoyalCrown({ uid, ink }: { readonly uid: string } & Ink) {
  const crown = D.crown;
  return (
    <g data-game-decor="crown" stroke={ink} strokeWidth={crown.width} strokeLinejoin="round">
      <path d={crown.body} fill={paintUrl(uid, 'gold')} />
      <path d={crown.band} fill={paintUrl(uid, 'gold')} />
      {crown.jewels.map((j) => (
        <circle key={`${j.x} ${j.y}`} cx={j.x} cy={j.y} r={j.r} fill={paintUrl(uid, 'diamond')} strokeWidth={crown.width * 0.6} />
      ))}
    </g>
  );
}

/** Les éclats de diamant du prisme : ils scintillent (`game.css`, sous `prefers-reduced-motion: no-preference`). */
export function Sparkles() {
  return (
    <g data-game-decor="sparkles">
      {D.sparkles.points.map((p) => (
        <path key={`${p.x} ${p.y}`} data-game-sparkle="" d={sparklePath(p)} fill={`var(--game-sparkle-${p.tint})`} style={{ animationDelay: `${p.delay}s` }} />
      ))}
    </g>
  );
}

/** La tranche cannelée : pointillé gris (argent), à l'encre de l'or (or), IRISÉE au prisme (le spectre à contre-sens). */
export function Flute({ uid, kind, ink }: { readonly uid: string; readonly kind: CoinFlute } & Ink) {
  const { radius, width, dash } = COIN.body.flute;
  const props = { cx: CX, cy: CX, r: radius, fill: 'none', strokeDasharray: dash.join(' ') };
  if (kind === 'iris') return <circle data-game-decor="iris" {...props} stroke={`url(#${uid}-iris)`} strokeWidth={width * 1.6} />;
  return <circle {...props} stroke={kind === 'ink' ? ink : tokenVar('rim')} strokeWidth={width} opacity={kind === 'ink' ? 0.7 : 1} />;
}

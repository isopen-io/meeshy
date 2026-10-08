import { useId } from 'react';

import type { GloryDivision5, GloryRankOrMythic, MythicSeatRef } from '@meeshy/shared/utils/game/glory';
import {
  BLASON_COMPACT_BELOW,
  BLASON_COMPACT_FRAME,
  BLASON_COMPACT_MYTHIC_FRAME,
  BLASON_FRAME,
  BLASON_FULL_FRAME,
  BLASON_LEVEL_ENGRAVING,
  divisionNotches,
  mythicHalo,
  type BlasonViewport,
  type CrestPiece,
  type CrestTone,
} from '@meeshy/shared/utils/game/rank-crest';

import { blasonDesign } from '@/lib/game/ranks';
import { inkToken, paintUrl, safeUid, tokenVar, type GameMaterial, type GamePaint } from '@/lib/game/materials';

import { BirdCutDefs, PaintDefs, PlacedBird } from './paint-defs';
import { SignatureGlyph } from './signature';

/**
 * LE BLASON D'UN RANG (#9380, conception IV.3 ; décorations #9636). Un écu par
 * rang ; la matière monte avec lui (`lib/game/ranks.ts`). À partir
 * d'Ambassadeur, Mee et Meo tiennent l'écu ; à Légende ils sont couronnés ; à
 * Mythe, auréolés.
 *
 * Toute la GÉOMÉTRIE ajoutée par #9636 est la table partagée par le web et iOS
 * (`@meeshy/shared/utils/game/rank-crest`) : la décoration propre à chaque rang,
 * à la Signature (posée DERRIÈRE l'écu) ; le niveau gravé dans la pointe ; la
 * division en cinq encoches (V = 1 … I = 5) ; et, pour le Mythe, la Signature
 * unique de son émission posée en halo prismatique, son numéro gravé sous l'écu.
 * Sous 60 px, le blason se recadre sur l'écu et sa décoration : tenants, ruban et
 * chiffres gravés se taisent, illisibles à cette taille.
 *
 * La Signature est GRAVÉE au cœur de l'écu. Le ruban porte le nom du rang :
 * l'hôte passe `label` déjà localisé (aucun texte n'est écrit ici).
 *
 * DÉCORATIF (`aria-hidden`) : le rang, sa division et le niveau sont dits par
 * l'hôte. `data-game-shield` est la cible du geste « l'écu monte » ; les
 * `data-game-dash` de la Signature, celle de « la Signature se grave trait par
 * trait » ; les `data-game-bird`, celle de « les tenants se posent » ;
 * `data-game-crest`, celle de l'entrée sobre de la décoration (`styles/game.css`).
 */

const ECU = 'M14 10 h72 v38 c0 24 -16 37 -36 45 c-20 -8 -36 -21 -36 -45 z';
const INNER = 'M21 16 h58 v32 c0 19 -12 30 -29 37 c-17 -7 -29 -18 -29 -37 z';
const BAND = 'M14 10 h72 v15 h-72z';
const ACCENT = 'var(--ios-indigo-600)';

const t = (value: number): string => String(Math.round(value * 100) / 100);

/** Un trait se peint d'une couleur PLEINE : un dégradé en boîte englobante ne peint pas un trait horizontal. */
const strokeColor = (tone: CrestTone, material: GameMaterial): string => {
  if (tone === 'gold') return 'var(--game-gold-1)';
  if (tone === 'ink') return inkToken(material);
  if (material === 'obsidian') return 'var(--game-obsidian-0)';
  if (material === 'prism') return 'var(--game-prism-2)';
  return `var(--game-${material}-1)`;
};

const fillColor = (tone: CrestTone, material: GameMaterial, uid: string): string => {
  if (tone === 'gold') return paintUrl(uid, 'gold');
  if (tone === 'ink') return inkToken(material);
  return paintUrl(uid, material);
};

const point = (radians: number, r: number, cx: number, cy: number): string => `${t(cx + r * Math.sin(radians))} ${t(cy - r * Math.cos(radians))}`;

const arcPath = (cx: number, cy: number, r: number, from: number, to: number): string => {
  const a = (from * Math.PI) / 180;
  const b = (to * Math.PI) / 180;
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M${point(a, r, cx, cy)} A${t(r)} ${t(r)} 0 ${large} 1 ${point(b, r, cx, cy)}`;
};

const leafPath = (x1: number, y1: number, x2: number, y2: number, bulge: number): string => {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const nx = (-(y2 - y1) / length) * bulge * 2;
  const ny = ((x2 - x1) / length) * bulge * 2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return `M${t(x1)} ${t(y1)} Q${t(mx + nx)} ${t(my + ny)} ${t(x2)} ${t(y2)} Q${t(mx - nx)} ${t(my - ny)} ${t(x1)} ${t(y1)}Z`;
};

function CrestShape({ piece, material, uid, index }: { readonly piece: CrestPiece; readonly material: GameMaterial; readonly uid: string; readonly index: number }) {
  const mark = { 'data-game-crest-piece': index };
  switch (piece.kind) {
    case 'line':
      return <line {...mark} x1={piece.x1} y1={piece.y1} x2={piece.x2} y2={piece.y2} stroke={strokeColor(piece.tone, material)} strokeWidth={piece.width} strokeLinecap="round" />;
    case 'arc':
      return <path {...mark} d={arcPath(piece.cx, piece.cy, piece.r, piece.from, piece.to)} fill="none" stroke={strokeColor(piece.tone, material)} strokeWidth={piece.width} strokeLinecap="round" />;
    case 'curve':
      return (
        <path
          {...mark}
          d={`M${piece.x} ${piece.y}${piece.segments.map((s) => ` C${s.c1x} ${s.c1y} ${s.c2x} ${s.c2y} ${s.x} ${s.y}`).join('')}`}
          fill="none"
          stroke={strokeColor(piece.tone, material)}
          strokeWidth={piece.width}
          strokeLinecap="round"
        />
      );
    case 'leaf':
      return <path {...mark} d={leafPath(piece.x1, piece.y1, piece.x2, piece.y2, piece.bulge)} fill={fillColor(piece.tone, material, uid)} stroke={tokenVar('edge')} strokeOpacity="0.25" strokeWidth="0.6" />;
    case 'dot':
      return <circle {...mark} cx={piece.cx} cy={piece.cy} r={piece.r} fill={fillColor(piece.tone, material, uid)} stroke={tokenVar('edge')} strokeOpacity="0.25" strokeWidth="0.6" />;
  }
}

/** La couleur d'un rayon du halo : la roue du prisme depuis la teinte de l'émission, ou les jetons du prisme sans émission. */
const rayColor = (hue: number | null, k: number, count: number): string =>
  hue === null ? `var(--game-prism-${k % 5})` : `hsl(${Math.round(hue + (360 * k) / count) % 360} 80% 56%)`;

function MythicHalo({ edition, compact, uid }: { readonly edition: number | null; readonly compact: boolean; readonly uid: string }) {
  const halo = mythicHalo(edition);
  return (
    <g data-game-mythic-halo={halo.edition === null ? '' : String(halo.edition)}>
      {halo.rays.map((ray, k) => (
        <line key={k} data-game-mythic-ray="" x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} stroke={rayColor(halo.hue, k, halo.rays.length)} strokeWidth={halo.rayWidth} strokeLinecap="round" />
      ))}
      {halo.beads.map((bead, k) => (
        <circle key={k} data-game-mythic-bead="" cx={bead.cx} cy={bead.cy} r={bead.r} fill={rayColor(halo.hue, k * 3, halo.rays.length)} />
      ))}
      {halo.gem !== null ? (
        <polygon
          data-game-mythic-gem=""
          points={halo.gem.map((p) => `${p.x},${p.y}`).join(' ')}
          fill={paintUrl(uid, 'gold')}
          stroke={tokenVar('edge')}
          strokeOpacity="0.4"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      ) : null}
      {halo.numeral !== null && !compact ? (
        <text
          data-game-mythic-numeral=""
          x={halo.numeral.x}
          y={halo.numeral.y}
          textAnchor="middle"
          fontFamily="var(--font-native)"
          fontWeight="800"
          fontSize={halo.numeral.size}
          fill="var(--ios-ink)"
        >
          {halo.numeral.text}
        </text>
      ) : null}
    </g>
  );
}

function LevelEngraving({ level, material }: { readonly level: number; readonly material: GameMaterial }) {
  const { x, y, size } = BLASON_LEVEL_ENGRAVING;
  const common = { x, textAnchor: 'middle', fontFamily: 'var(--font-native)', fontWeight: '800', fontSize: size } as const;
  return (
    <g data-game-level-engraving="">
      <text {...common} y={y + 0.8} dx="0.6" fill={tokenVar('glint')} fillOpacity="0.35">
        {level}
      </text>
      <text {...common} y={y} fill={inkToken(material)} fillOpacity="0.85">
        {level}
      </text>
    </g>
  );
}

const viewBoxOf = (frame: BlasonViewport): string => `${frame.x} ${frame.y} ${frame.width} ${frame.height}`;

type Props = {
  readonly rank: GloryRankOrMythic;
  /** La division, V (5) à I (1) — une division héritée (III, II, I) se lit pareil ; `null` ou absente : aucune encoche. */
  readonly division?: GloryDivision5 | null;
  /** Le niveau du joueur, gravé dans la pointe de l'écu ; absent : rien n'est gravé. */
  readonly level?: number | null;
  /** La place du Mythe servie : son émission dessine la Signature unique. */
  readonly mythic?: MythicSeatRef | null;
  /** Largeur dessinée ; la hauteur suit (200 × 184). */
  readonly size: number;
  /** Le nom du rang, localisé par l'hôte, écrit en capitales sur le ruban. */
  readonly label?: string;
};

export function RankBlason({ rank, division = null, level = null, mythic = null, size, label }: Props) {
  const uid = safeUid(useId());
  const design = blasonDesign(rank);
  const compact = size < BLASON_COMPACT_BELOW;
  const isMythe = rank === 'mythe';
  const frame = compact ? (isMythe ? BLASON_COMPACT_MYTHIC_FRAME : BLASON_COMPACT_FRAME) : BLASON_FULL_FRAME;
  const paints: readonly GamePaint[] = [design.material, 'gold', ...(isMythe ? (['prism'] as const) : [])];
  const ink = inkToken(design.material);
  const tenants = compact ? null : design.tenants;
  const notches = design.notches ? divisionNotches(division) : [];
  return (
    <svg
      viewBox={viewBoxOf(frame)}
      width={size}
      height={Math.round((size * BLASON_FRAME.height) / BLASON_FRAME.width)}
      aria-hidden="true"
      focusable="false"
      data-game-rank={rank}
    >
      <defs>
        <PaintDefs uid={uid} paints={[...new Set(paints)]} />
        {tenants !== null ? <BirdCutDefs uid={uid} /> : null}
      </defs>
      {isMythe ? <MythicHalo edition={mythic?.edition ?? null} compact={compact} uid={uid} /> : null}
      {design.crest.length > 0 ? (
        <g data-game-crest={rank}>
          {design.crest.map((piece, index) => (
            <CrestShape key={index} piece={piece} material={design.material} uid={uid} index={index} />
          ))}
        </g>
      ) : null}
      {tenants !== null ? (
        <>
          <PlacedBird uid={uid} bird={tenants.mee} x={0} y={62} scale={0.42} />
          <PlacedBird uid={uid} bird={tenants.meo} x={200} y={62} scale={0.42} flip />
        </>
      ) : null}
      <g transform="translate(50 26)">
        <g data-game-shield="">
          <path d={ECU} fill={paintUrl(uid, design.material)} stroke={tokenVar('edge')} strokeOpacity="0.35" strokeWidth="2" />
          {design.inner ? <path d={INNER} fill="none" stroke={tokenVar('glint')} strokeOpacity="0.5" strokeWidth="2" /> : null}
          {design.band ? <path d={BAND} fill={tokenVar('edge')} fillOpacity="0.16" /> : null}
          <SignatureGlyph cx={50} cy={55} size={60} color={ink} mode="engraved" strokeWidth={96} />
        </g>
      </g>
      {level !== null && !compact ? <LevelEngraving level={level} material={design.material} /> : null}
      {design.ribbon && !compact ? (
        <g data-game-ribbon="">
          <path d="M52 140 h96 l-7 8 7 8 h-96 l7 -8z" fill={ACCENT} />
          {label !== undefined ? (
            <text x="100" y="151.5" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8.5" letterSpacing="1.4" fill="var(--ios-on-brand)">
              {label.toLocaleUpperCase()}
            </text>
          ) : null}
        </g>
      ) : null}
      {notches.map((notch) => (
        <line
          key={notch.x}
          data-game-notch={notch.on ? 'on' : 'off'}
          x1={notch.x}
          y1={notch.y1}
          x2={notch.x}
          y2={notch.y2}
          stroke={notch.on ? ACCENT : tokenVar('track')}
          strokeWidth={notch.width}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

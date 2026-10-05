import { useId } from 'react';

import { LEVEL_TIER_KEYS, type LevelTierKey } from '@meeshy/shared/utils/game/levels';

import { paintUrl, safeUid, tokenVar } from '@/lib/game/materials';

import { tierRoman } from '@/lib/game/tier-emblem';

import { PaintDefs } from './paint-defs';
import { TierEmblemGlyph, tierColor } from './tier-emblem';

/**
 * L'ANNEAU DE NIVEAU (#9380, #9481) — la jauge de progression du niveau, à la
 * couleur de son PALIER (`LevelTierKey` de la loi partagée ; Galaxie est un
 * spectre). Dans le disque central : l'EMBLÈME du palier imprimé en filigrane
 * transparent (dix emblèmes bâtis sur la Signature, `lib/game/tier-emblem.ts`),
 * le niveau en chiffres arabes au premier plan, et le PALIER en chiffres
 * romains (I à X) dans un cartouche au contour détouré, sous le niveau.
 *
 *   · `progress` (0..1) : la part du niveau suivant déjà gagnée — `progress`
 *     de `levelProgress`. Tout ce qui n'est pas un nombre fini donne un anneau
 *     vide, jamais `NaN` ;
 *   · `record` : le niveau RECORD. S'il dépasse `level` (après une frappe), un
 *     losange le marque : l'anneau a baissé, l'histoire non ;
 *   · `showTier` : un point par rang du palier autour de l'anneau (Étincelle 1,
 *     Galaxie 10), pour l'affichage des paliers.
 *
 * DÉCORATIF (`aria-hidden`) tant que l'hôte ne passe pas `label` : l'hôte dit
 * alors « Niveau 34, Éclat, record 36 ». Avec `label` (« Niveau 34, palier
 * Éclat, quatrième palier »), l'anneau est une image nommée.
 * `data-game-ring-sweep` (le groupe qui enveloppe l'arc, sans transform propre) est la cible de « l'anneau se remplit / se vide » ; `data-game-level-text`, celle de « le chiffre roule ».
 */

const RADIUS = 24;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const STROKE = 5;
const DISC_RADIUS = 21;
const WATERMARK = 0.18;
const NUMERAL_SIZE = 6.4;

type Props = {
  readonly level: number;
  readonly tier: LevelTierKey;
  readonly progress: number;
  readonly size: number;
  readonly record?: number;
  readonly showTier?: boolean;
  /** Le libellé lu par un lecteur d'écran ; absent : l'anneau est décoratif. */
  readonly label?: string;
};

const fraction = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

export function LevelRing({ level, tier, progress, size, record, showTier = false, label }: Props) {
  const uid = safeUid(useId());
  const arc = (CIRCUMFERENCE * fraction(progress)).toFixed(1);
  const stroke = tierColor(uid, tier);
  const numeral = tierRoman(tier);
  const cartoucheWidth = 6 + numeral.length * 4.4;
  const digits = String(level).length;
  const tierDots = LEVEL_TIER_KEYS.indexOf(tier) + 1;
  const viewBox = showTier ? '-8 -8 72 72' : '0 0 56 56';
  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      {...(label === undefined ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': label })}
      focusable="false"
      data-game-level={level}
      data-game-tier={tier}
    >
      <defs>
        <PaintDefs uid={uid} paints={['prism', 'platinum']} />
      </defs>
      <circle cx="28" cy="28" r={RADIUS} fill="none" stroke={tokenVar('track')} strokeWidth={STROKE} />
      <g data-game-ring-sweep="">
        <circle
          data-game-ring-arc=""
          cx="28"
          cy="28"
          r={RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${CIRCUMFERENCE.toFixed(1)}`}
          transform="rotate(-90 28 28)"
        />
      </g>
      {showTier
        ? Array.from({ length: tierDots }, (_, k) => {
            const angle = (k / tierDots) * Math.PI * 2 - Math.PI / 2;
            return <circle key={k} data-game-tier-dot="" cx={(28 + 31 * Math.cos(angle)).toFixed(1)} cy={(28 + 31 * Math.sin(angle)).toFixed(1)} r="2.6" fill={stroke} />;
          })
        : null}
      <circle data-game-disc="" cx="28" cy="28" r={DISC_RADIUS} fill="var(--ios-surface-card)" />
      <TierEmblemGlyph uid={uid} tier={tier} cx={28} cy={28} size={34} opacity={WATERMARK} />
      <text
        data-game-level-text=""
        x="28"
        y="31.5"
        textAnchor="middle"
        fontFamily="var(--font-native)"
        fontWeight="800"
        fontSize={digits >= 3 ? 11 : 14}
        fill="var(--ios-ink)"
      >
        {level}
      </text>
      <rect
        data-game-tier-cartouche=""
        fill={stroke}
        x={(28 - cartoucheWidth / 2).toFixed(1)}
        y="36"
        width={cartoucheWidth.toFixed(1)}
        height="9.4"
        rx="4.7"
      />
      <text
        data-game-tier-numeral=""
        x="28"
        y="43"
        textAnchor="middle"
        fontFamily="var(--font-native)"
        fontWeight="800"
        fontSize={NUMERAL_SIZE}
        letterSpacing="0.3"
        fill="var(--game-glint)"
        stroke="var(--game-edge)"
        strokeWidth="1.1"
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        {numeral}
      </text>
      {record !== undefined && record > level ? (
        <path data-game-record={record} d="M47 40 l6 6 -6 6 -6 -6 z" fill={paintUrl(uid, 'platinum')} stroke={tokenVar('edge')} strokeOpacity="0.3" />
      ) : null}
    </svg>
  );
}

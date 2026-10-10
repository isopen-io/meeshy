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
 *     vide, jamais `NaN` ; `null` : pas de jauge (le niveau d'un AUTRE, dont
 *     la progression n'est jamais servie) — anneau plein, statique ;
 *   · `record` : le niveau RECORD. S'il dépasse `level` (après une frappe), un
 *     losange le marque : l'anneau a baissé, l'histoire non ;
 *   · `showTier` : un point par rang du palier autour de l'anneau (Étincelle 1,
 *     Galaxie 10), pour l'affichage des paliers ;
 *   · `prestige` : les ÉTOILES de Prestige (0 à 5), des étoiles dorées posées
 *     sur l'arc sous l'anneau (#9389) — elles se gagnent au niveau 100 et ne
 *     redescendent jamais. `data-game-prestige-star` est la cible de « les
 *     étoiles s'allument » du passage.
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
  /** La part du niveau suivant, ou `null` : pas de jauge à montrer (le niveau d'un autre) — l'anneau est alors plein et statique. */
  readonly progress: number | null;
  readonly size: number;
  readonly record?: number;
  readonly showTier?: boolean;
  /** Les étoiles de Prestige posées (0 à 5) ; au-delà de 0 l'anneau gagne la marge qui les porte. */
  readonly prestige?: number;
  /** Le libellé lu par un lecteur d'écran ; absent : l'anneau est décoratif. */
  readonly label?: string;
};

const starPath = (x: number, y: number, r: number): string =>
  Array.from({ length: 10 }, (_, k) => {
    const a = (k * Math.PI) / 5 - Math.PI / 2;
    const rr = k % 2 === 1 ? r * 0.45 : r;
    return `${k === 0 ? 'M' : 'L'}${(x + rr * Math.cos(a)).toFixed(1)} ${(y + rr * Math.sin(a)).toFixed(1)}`;
  }).join('') + 'Z';

/** Le chiffre du niveau tient dans le disque, de 1 à 4 chiffres et au-delà (#9688 : les niveaux s'ouvrent au-delà de 100). */
const levelFontSize = (digits: number): number => (digits >= 5 ? 7.5 : digits === 4 ? 9 : digits === 3 ? 11 : 14);

const fraction = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

export function LevelRing({ level, tier, progress, size, record, showTier = false, prestige = 0, label }: Props) {
  const uid = safeUid(useId());
  const arc = (CIRCUMFERENCE * (progress === null ? 1 : fraction(progress))).toFixed(1);
  const stroke = tierColor(uid, tier);
  const numeral = tierRoman(tier);
  const cartoucheWidth = 6 + numeral.length * 4.4;
  const digits = String(level).length;
  const tierDots = LEVEL_TIER_KEYS.indexOf(tier) + 1;
  const stars = Math.min(5, Math.max(0, Math.trunc(Number.isFinite(prestige) ? prestige : 0)));
  const viewBox = showTier || stars > 0 ? '-8 -8 72 72' : '0 0 56 56';
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
          {...(progress === null ? { 'data-game-ring-static': '' } : {})}
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
      {Array.from({ length: stars }, (_, k) => {
        const angle = ((90 + (k - (stars - 1) / 2) * 24) * Math.PI) / 180;
        return (
          <path
            key={k}
            data-game-prestige-star=""
            d={starPath(28 + 33 * Math.cos(angle), 28 + 33 * Math.sin(angle), 4)}
            fill="var(--game-gold-1)"
            stroke={tokenVar('edge')}
            strokeOpacity="0.35"
            strokeWidth="0.6"
          />
        );
      })}
      <circle data-game-disc="" cx="28" cy="28" r={DISC_RADIUS} fill="var(--ios-surface-card)" />
      <TierEmblemGlyph uid={uid} tier={tier} cx={28} cy={28} size={34} opacity={WATERMARK} />
      <text
        data-game-level-text=""
        x="28"
        y="31.5"
        textAnchor="middle"
        fontFamily="var(--font-native)"
        fontWeight="800"
        fontSize={levelFontSize(digits)}
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

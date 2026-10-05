import { useId } from 'react';

import { LEVEL_TIER_KEYS, type LevelTierKey } from '@meeshy/shared/utils/game/levels';

import { paintUrl, safeUid, tokenVar } from '@/lib/game/materials';

import { PaintDefs } from './paint-defs';
import { SignatureGlyph } from './signature';

/**
 * L'ANNEAU DE NIVEAU (#9380) — la jauge de progression du niveau, à la couleur
 * de son PALIER (`LevelTierKey` de la loi partagée ; Galaxie est un spectre),
 * la Signature en aplat au-dessus du chiffre.
 *
 *   · `progress` (0..1) : la part du niveau suivant déjà gagnée — `progress`
 *     de `levelProgress`. Tout ce qui n'est pas un nombre fini donne un anneau
 *     vide, jamais `NaN` ;
 *   · `record` : le niveau RECORD. S'il dépasse `level` (après une frappe), un
 *     losange le marque : l'anneau a baissé, l'histoire non ;
 *   · `showTier` : un point par rang du palier autour de l'anneau (Étincelle 1,
 *     Galaxie 10), pour l'affichage des paliers.
 *
 * DÉCORATIF (`aria-hidden`) : l'hôte dit « Niveau 34, Éclat, record 36 ».
 * `data-game-ring-arc` est la cible de « l'anneau se remplit / se vide ».
 */

const RADIUS = 24;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const STROKE = 5;

type Props = {
  readonly level: number;
  readonly tier: LevelTierKey;
  readonly progress: number;
  readonly size: number;
  readonly record?: number;
  readonly showTier?: boolean;
};

const fraction = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

export function LevelRing({ level, tier, progress, size, record, showTier = false }: Props) {
  const uid = safeUid(useId());
  const arc = (CIRCUMFERENCE * fraction(progress)).toFixed(1);
  const stroke = tier === 'galaxie' ? paintUrl(uid, 'prism') : `var(--game-tier-${tier})`;
  const tierDots = LEVEL_TIER_KEYS.indexOf(tier) + 1;
  const viewBox = showTier ? '-8 -8 72 72' : '0 0 56 56';
  return (
    <svg viewBox={viewBox} width={size} height={size} aria-hidden="true" focusable="false" data-game-level={level} data-game-tier={tier}>
      <defs>
        <PaintDefs uid={uid} paints={['prism', 'platinum']} />
      </defs>
      <circle cx="28" cy="28" r={RADIUS} fill="none" stroke={tokenVar('track')} strokeWidth={STROKE} />
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
      {showTier
        ? Array.from({ length: tierDots }, (_, k) => {
            const angle = (k / tierDots) * Math.PI * 2 - Math.PI / 2;
            return <circle key={k} data-game-tier-dot="" cx={(28 + 31 * Math.cos(angle)).toFixed(1)} cy={(28 + 31 * Math.sin(angle)).toFixed(1)} r="2.6" fill={stroke} />;
          })
        : null}
      <SignatureGlyph cx={28} cy={17} size={13} color="var(--ios-ink-2)" mode="flat" strokeWidth={120} />
      <text x="28" y="36" textAnchor="middle" fontFamily="var(--font-native)" fontWeight="800" fontSize="14" fill="var(--ios-ink)">
        {level}
      </text>
      {record !== undefined && record > level ? (
        <path data-game-record={record} d="M47 40 l6 6 -6 6 -6 -6 z" fill={paintUrl(uid, 'platinum')} stroke={tokenVar('edge')} strokeOpacity="0.3" />
      ) : null}
    </svg>
  );
}

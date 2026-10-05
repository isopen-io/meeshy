import { useId } from 'react';

import { inkToken, paintUrl, safeUid } from '@/lib/game/materials';

import { PaintDefs } from './paint-defs';
import { SignatureGlyph } from './signature';

/**
 * LE COFFRE DU JOUR (#9380, conception IV.4) — fermé, ouvert, serrure à la
 * Signature gravée sur une plaque d'or.
 *
 * Les DEUX couvercles sont toujours dessinés : celui du coffre fermé (rond) et
 * celui du coffre ouvert (relevé, avec ses trois étincelles d'or). `state`
 * fixe lequel se voit au repos ; la chorégraphie du coffre
 * (`lib/game/choreography.ts`, 1,4 s) fond de l'un à l'autre en n'animant que
 * `transform` et `opacity` — `data-game-lid-closed`, `data-game-lid-open`,
 * `data-game-spark-group` et chaque `data-game-spark` sont ses cibles. Les
 * récompenses qui « montent une à une » sont celles de l'hôte
 * (`data-game-reward`), posées au-dessus du coffre.
 *
 * DÉCORATIF (`aria-hidden`) : l'hôte dit « Coffre du jour, prêt à ouvrir ».
 */

export type ChestState = 'closed' | 'open';

const SPARKS = ['M30 18l-4-8', 'M45 14V4', 'M60 18l4-8'] as const;

export function Chest({ state, size }: { readonly state: ChestState; readonly size: number }) {
  const uid = safeUid(useId());
  const open = state === 'open';
  return (
    <svg
      viewBox="0 0 90 72"
      width={size}
      height={Math.round((size * 72) / 90)}
      aria-hidden="true"
      focusable="false"
      data-game-chest={state}
    >
      <defs>
        <PaintDefs uid={uid} paints={['indigo', 'gold']} />
      </defs>
      <g data-game-spark-group="" opacity={open ? 1 : 0}>
        {SPARKS.map((d, i) => (
          <path key={d} data-game-spark={i} d={d} fill="none" stroke="var(--ios-warning)" strokeWidth="2" strokeLinecap="round" />
        ))}
      </g>
      <g data-game-lid-open="" opacity={open ? 1 : 0}>
        <path d="M20 30l-6-20 62 0-6 20" fill="var(--ios-purple-600)" opacity="0.85" />
      </g>
      <rect x="10" y="30" width="70" height="36" rx="6" fill={paintUrl(uid, 'indigo')} />
      <g data-game-lid-closed="" opacity={open ? 0 : 1}>
        <path d="M10 34a35 22 0 0 1 70 0z" fill="var(--ios-purple-600)" />
      </g>
      <rect x="10" y="30" width="70" height="6" fill={paintUrl(uid, 'gold')} />
      <g data-game-lock="">
        <rect x="35" y="36" width="20" height="16" rx="3" fill={paintUrl(uid, 'gold')} />
        <SignatureGlyph cx={45} cy={44} size={15} color={inkToken('gold')} mode="engraved" strokeWidth={120} />
      </g>
    </svg>
  );
}

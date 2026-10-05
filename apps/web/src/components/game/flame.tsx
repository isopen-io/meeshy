import { useId } from 'react';

import type { FlameFormKey } from '@meeshy/shared/utils/game/flame';

import { paintUrl, safeUid, tokenVar } from '@/lib/game/materials';

import { PaintDefs } from './paint-defs';
import { SignatureGlyph } from './signature';
import { useOnScreen } from './use-on-screen';

/**
 * LA FLAMME (#9380) — cinq formes, que la loi partagée choisit selon la série
 * (`flameForm`) : braise (1 j), flamme (7 j), brasier (30 j), astre (100 j),
 * soleil (365 j). La pointe monte avec la forme ; l'astre et le soleil
 * portent un anneau d'or en pointillé, le soleil plus large. Dès la flamme de
 * 7 jours le cœur porte la Signature, en aplat clair.
 *
 * Elle vacille tant qu'elle est visible : `data-game-flicker` est la cible du
 * repli CSS (`transform` seul, sous `no-preference`). Sortie de la fenêtre,
 * elle se met en pause (`data-game-offscreen`, `use-on-screen.ts`, #9381) : une
 * animation infinie ne brûle pas de batterie pour une flamme qu'on ne voit pas.
 * `out` : la flamme ÉTEINTE — de cendre, immobile.
 *
 * DÉCORATIF (`aria-hidden`) : l'hôte dit « Flamme, 12 jours ».
 */

/** La part de hauteur de chaque forme (échelle du dessin, 1 = pleine). */
const SCALE: Readonly<Record<FlameFormKey, number>> = { braise: 0.45, flamme: 0.7, brasier: 0.95, astre: 1, soleil: 1 };
const HALO: Readonly<Partial<Record<FlameFormKey, number>>> = { astre: 25, soleil: 31 };

type Props = {
  readonly form: FlameFormKey;
  readonly size: number;
  readonly out?: boolean;
};

export function Flame({ form, size, out = false }: Props) {
  const uid = safeUid(useId());
  const s = SCALE[form];
  const halo = HALO[form];
  const { observe, visible } = useOnScreen();
  const body = `M36 ${(66 - 56 * s).toFixed(1)} c 12 16 22 26 18 42 a18 18 0 0 1 -36 0 c -2 -12 8 -18 10 -28 c 4 6 6 10 8 12 c 2 -8 2 -16 0 -26z`;
  return (
    <svg
      ref={observe}
      viewBox="0 0 72 72"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      data-game-flame={form}
      {...(visible ? {} : { 'data-game-offscreen': '' })}
    >
      <defs>
        <PaintDefs uid={uid} paints={['flame']} />
      </defs>
      {halo !== undefined ? <circle data-game-halo="" cx="36" cy="40" r={halo} fill="none" stroke="var(--ios-warning)" strokeWidth="1.5" strokeDasharray="3 4" /> : null}
      <g {...(out ? {} : { 'data-game-flicker': '' })}>
        <path data-game-flame-body="" d={body} fill={out ? tokenVar('ash') : paintUrl(uid, 'flame')} />
        {s >= 0.7 ? <SignatureGlyph cx={36} cy={54} size={18} color={tokenVar('glint')} mode="flat" strokeWidth={120} /> : null}
      </g>
    </svg>
  );
}

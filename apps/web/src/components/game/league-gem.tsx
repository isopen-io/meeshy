import { useId } from 'react';

import type { LeagueKey } from '@meeshy/shared/utils/game/league';

import { paintUrl, safeUid, tokenVar } from '@/lib/game/materials';

import { PaintDefs } from './paint-defs';
import { SignatureGlyph } from './signature';

/**
 * LA GEMME D'UNE LIGUE (#9384, conception II.7) — un losange taillé, un reflet
 * à hauteur d'épaule, la Signature GRAVÉE au centre (creux, teinte plus sombre
 * que la matière). Du Quartz au Prisme : la couleur de chaque gemme est un
 * JETON `--game-league-<ligue>` (`styles/game.css`) ; le Prisme prend le
 * dégradé irisé de la matière prisme.
 *
 * DÉCORATIF (`aria-hidden`) : l'hôte dit le nom de la ligue.
 */
type Props = {
  readonly league: LeagueKey;
  /** Côté dessiné ; la gemme est carrée. */
  readonly size: number;
};

export function LeagueGem({ league, size }: Props) {
  const uid = safeUid(useId());
  const fill = league === 'prisme' ? paintUrl(uid, 'prism') : `var(--game-league-${league})`;
  return (
    <svg viewBox="0 0 72 72" width={size} height={size} aria-hidden="true" focusable="false" data-game-league-gem={league}>
      {league === 'prisme' ? (
        <defs>
          <PaintDefs uid={uid} paints={['prism']} />
        </defs>
      ) : null}
      <path d="M36 6l26 20-26 42-26-42z" fill={fill} stroke={tokenVar('edge')} strokeOpacity="0.3" />
      <path d="M10 26h52" stroke={tokenVar('glint')} strokeOpacity="0.6" strokeWidth="1.4" fill="none" />
      <SignatureGlyph cx={36} cy={38} size={26} color={tokenVar('edge')} mode="engraved" strokeWidth={110} />
    </svg>
  );
}

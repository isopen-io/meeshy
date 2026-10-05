import type { ReactNode } from 'react';

import { Trophy } from './game/trophy';
import { GAME_INK, GAME_INK_2 } from './game-surface';

import type { TrophyView } from '@/lib/view/game-copy-v2';

/**
 * L'ÉTAGÈRE DE TROPHÉES (#9387) — une grille de coupes, chacune avec son titre
 * et sa légende. Écrite UNE fois pour la vitrine du propriétaire (avec ses
 * gestes de rangement, `controls`) et pour celle d'un visiteur (lecture seule,
 * le mois seulement) : deux étagères divergeraient exactement comme le profil et
 * la progression ont divergé.
 *
 * La coupe est DÉCORATIVE (`aria-hidden`) : le titre, lu, dit ce qu'elle est.
 */
export type ShelfEntry = {
  readonly key: string;
  readonly view: TrophyView;
  /** « Obtenu le 25 octobre 2026 » (propriétaire) ou « Obtenu en octobre 2026 » (visiteur). */
  readonly caption: string;
  readonly controls?: ReactNode;
};

export function GameTrophyShelf({ entries, size = 84 }: { readonly entries: readonly ShelfEntry[]; readonly size?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3" data-game-trophy-shelf="">
      {entries.map((entry) => (
        <li key={entry.key} data-game-trophy={entry.key} className="flex min-w-0 flex-col items-center gap-1 text-center">
          <Trophy kind={entry.view.kind} size={size} label={entry.view.plate} {...(entry.view.material === undefined ? {} : { material: entry.view.material })} />
          <p className="text-caption font-semibold" style={{ color: GAME_INK }}>
            {entry.view.title}
          </p>
          <p className="text-check" style={{ color: GAME_INK_2 }}>
            {entry.caption}
          </p>
          {entry.controls ?? null}
        </li>
      ))}
    </ul>
  );
}

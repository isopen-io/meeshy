import { MeeshCoin, RankBlason } from '@/components/game';
import { useRollingNumber } from '@/components/game/use-rolling-number';
import { GAME_INK } from '@/components/game-surface';
import { GameTouch, PRESS } from '@/components/game-touch';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { useGamePrefs } from '@/lib/game/preferences';
import { formatCount, gameText, meeshCount, shownRank } from '@/lib/view/game-copy';
import { rankDetail } from '@/lib/view/game-detail';
import { shownConcepts, shownProgress } from '@/lib/view/progression-concepts';
import { Link } from '@/routes/route-table';

import '@/styles/game.css';

/**
 * LE GROUPE DE L'EN-TÊTE DE LA PREMIÈRE PAGE (#9563, amendements n° 2 et 4) — à
 * droite du titre, le blason du rang et le nombre de Meeshes avec sa pièce.
 *
 * UNE surface, pas deux bulles : le porteur l'a tranché en voyant les deux
 * (#6466, #6470 — « les deux éléments associés en un seul, pas de séparation
 * visuelle »). Le blason rebondit et ouvre la modale du rang ; le compteur ouvre
 * la FICHE des Meeshes — le seul site de la frappe (amendement n° 4 : « pas de
 * double chemin vers un même geste »). La feuille de frappe qu'il ouvrait
 * redoublait la fiche ; elle est partie.
 *
 * RIEN si la passerelle ne sert pas la donnée : ni blason sans le jeu, ni
 * compteur sans solde, ni surface vide. Il ne vit que sur la première page : la
 * fiche des Meeshes a son héros.
 */
const SURFACE = { borderRadius: 12, minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-warn) 14%, transparent)' } as const;

export function ProgressionHeaderGroup({ progress }: { readonly progress: EngagementWithGame }) {
  const prefs = useGamePrefs();
  const hidden = progress.game !== undefined && prefs.hidden;
  const view = shownProgress(progress, hidden);
  const shown = shownConcepts(progress, hidden);
  const glory = shown.includes('glory') ? view.game?.glory : undefined;
  const meesh = shown.includes('meesh') ? view.meesh : undefined;
  const balance = useRollingNumber(meesh?.balance ?? 0);
  if (glory === undefined && meesh === undefined) return null;

  return (
    <div data-progression-header-group="" role="group" aria-label={gameText('game.detail.header_group')} className="flex shrink-0 items-center" style={SURFACE}>
      {glory === undefined ? null : (
        <GameTouch detail={rankDetail(glory, view.game?.level.level ?? null)} named marker={{ 'data-header-item': 'rank' }} className="grid place-items-center ps-2 pe-1" style={{ minHeight: 44, minWidth: 44 }}>
          <RankBlason {...shownRank(glory)} size={34} />
        </GameTouch>
      )}
      {meesh === undefined ? null : (
        <Link
          to="progressionConcept"
          params={{ concept: 'meesh' }}
          data-header-item="meesh"
          aria-label={`${gameText('game.concept.meesh.name')} — ${meeshCount(meesh.balance)}`}
          className={`${PRESS} flex items-center gap-1.5 ps-1.5 pe-2.5`}
          style={{ minHeight: 44, minWidth: 44, color: GAME_INK }}
        >
          <span className="text-body font-bold tabular-nums">{formatCount(Math.round(balance))}</span>
          <span aria-hidden="true">
            <MeeshCoin side="obverse" size={22} edition="silver" />
          </span>
        </Link>
      )}
    </div>
  );
}

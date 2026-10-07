import { useState } from 'react';

import { MeeshCoin, RankBlason } from '@/components/game';
import { useRollingNumber } from '@/components/game/use-rolling-number';
import { GAME_INK } from '@/components/game-surface';
import { GameTouch, PRESS } from '@/components/game-touch';
import { Sheet } from '@/components/sheet';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { useGamePrefs } from '@/lib/game/preferences';
import { formatCount, gameText, meeshCount } from '@/lib/view/game-copy';
import { rankDetail } from '@/lib/view/game-detail';
import { shownConcepts, shownProgress } from '@/lib/view/progression-concepts';
import type { GameActions } from '@/routes/progression-game-actions';
import { MeeshDetail } from '@/routes/progression-heroes';

import '@/styles/game.css';

/**
 * LE GROUPE DE L'EN-TÊTE DE LA PREMIÈRE PAGE (#9563, amendement n° 2) — à droite
 * du titre, le blason du rang et le nombre de Meeshes avec sa pièce.
 *
 * UNE surface, pas deux bulles : le porteur l'a tranché en voyant les deux
 * (#6466, #6470 — « les deux éléments associés en un seul, pas de séparation
 * visuelle »). Chacun rebondit et ouvre SES précisions : le blason, la modale du
 * rang ; le compteur, la feuille des Meeshes d'avant la refonte (solde, frappes,
 * et la frappe par Mee et Meo quand les points le permettent — le même `mint`
 * que la fiche, donc la même clé d'idempotence).
 *
 * RIEN si la passerelle ne sert pas la donnée : ni blason sans le jeu, ni
 * compteur sans solde, ni surface vide. Il ne vit que sur la première page : la
 * fiche des Meeshes a son héros.
 */
const SURFACE = { borderRadius: 12, minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-warn) 14%, transparent)' } as const;

export function ProgressionHeaderGroup({ progress, actions }: { readonly progress: EngagementWithGame; readonly actions: GameActions }) {
  const [open, setOpen] = useState<HTMLElement | null>(null);
  const prefs = useGamePrefs();
  const hidden = progress.game !== undefined && prefs.hidden;
  const view = shownProgress(progress, hidden);
  const shown = shownConcepts(progress, hidden);
  const glory = shown.includes('glory') ? view.game?.glory : undefined;
  const meesh = shown.includes('meesh') ? view.meesh : undefined;
  const balance = useRollingNumber(meesh?.balance ?? 0);
  if (glory === undefined && meesh === undefined) return null;

  const mint = view.game?.mint;
  const strike = mint === undefined ? undefined : { strikeKey: actions.strikeKey, next: { number: mint.number, edition: mint.edition }, confirmed: actions.celebration };
  return (
    <div data-progression-header-group="" role="group" aria-label={gameText('game.detail.header_group')} className="flex shrink-0 items-center" style={SURFACE}>
      {glory === undefined ? null : (
        <GameTouch detail={rankDetail(glory)} named marker={{ 'data-header-item': 'rank' }} className="grid place-items-center ps-2 pe-1" style={{ minHeight: 44, minWidth: 44 }}>
          <RankBlason rank={glory.rank} division={glory.division} size={34} />
        </GameTouch>
      )}
      {meesh === undefined ? null : (
        <button
          type="button"
          data-header-item="meesh"
          aria-haspopup="dialog"
          aria-expanded={open !== null}
          aria-label={gameText('game.detail.open', { name: meeshCount(meesh.balance) })}
          onClick={(event) => setOpen(event.currentTarget)}
          className={`${PRESS} flex items-center gap-1.5 ps-1.5 pe-2.5`}
          style={{ minHeight: 44, minWidth: 44, color: GAME_INK }}
        >
          <span className="text-body font-bold tabular-nums">{formatCount(Math.round(balance))}</span>
          <span aria-hidden="true">
            <MeeshCoin side="obverse" size={22} edition="silver" />
          </span>
        </button>
      )}
      {meesh === undefined || open === null ? null : (
        <Sheet
          title={gameText('game.detail.meesh_sheet')}
          presentation="bottom"
          bodyAs="div"
          restoreFocusTo={open}
          dialogData={{ 'data-meesh-sheet': '' }}
          onClose={() => setOpen(null)}
        >
          <div className="px-5 pb-5 pt-1">
            <MeeshDetail meesh={meesh} onMint={actions.mint} isMinting={actions.pending.mint} mintError={actions.errors.mint} strike={strike} />
          </div>
        </Sheet>
      )}
    </div>
  );
}

import type { UserShowcaseResponse } from '@meeshy/shared/types/game';

import { currentInterfaceLanguage } from '@/lib/interface-language';
import { gameText } from '@/lib/view/game-copy';
import { awardedMonthLabel, trophyView } from '@/lib/view/game-copy-v2';

import { GameTrophyShelf, type ShelfEntry } from './game-trophy-shelf';
import { Trophy } from './game/trophy';
import { GAME_INK, GameCard } from './game-surface';

/**
 * LE JEU D'UN AUTRE (#9481, #9387) — ce que SA visibilité autorise, rien sinon.
 * Le serveur décide (`visible`) ; quand il ferme la vitrine à ce lecteur, l'écran
 * ne dit PAS qu'elle existe : il ne dessine rien (une carte « vitrine fermée »
 * apprendrait qu'il y en a une). Un visiteur ne voit que le MOIS d'obtention d'un
 * trophée, jamais le jour (conformité D-3).
 *
 * Les clés de trophées d'une version plus récente ne se montrent pas : on ne nomme
 * pas ce qu'on ne comprend pas. Le rang, le niveau et le trésor d'un autre ne sont
 * pas servis par le contrat : ils n'ont rien à faire ici.
 */
const entriesOf = (showcase: UserShowcaseResponse): ShelfEntry[] => {
  const language = currentInterfaceLanguage();
  const months = new Map(showcase.items.map((item) => [item.key, item.awardedMonth]));
  const ordered = [...new Set([...showcase.order, ...showcase.items.map((item) => item.key)])].filter((key) => months.has(key));
  return ordered.flatMap((key) => {
    const view = trophyView(key, language);
    const month = months.get(key);
    return view === null || month === undefined
      ? []
      : [{ key, view, caption: gameText('game.showcase.awarded_month', { month: awardedMonthLabel(month, language) }) }];
  });
};

export function GameProfileVisitor({ showcase, name }: { readonly showcase: UserShowcaseResponse | undefined; readonly name: string }) {
  if (showcase === undefined || !showcase.visible) return null;
  const entries = entriesOf(showcase);
  if (entries.length === 0) return null;
  return (
    <GameCard id="game-profile-visitor" labelledBy="game-profile-visitor-title">
      <h2 id="game-profile-visitor-title" className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.profile.visitor_title', { name })}
      </h2>
      <GameTrophyShelf entries={entries} size={72} />
    </GameCard>
  );
}

/**
 * LA BANDE DE LA CARTE DE CONTACT (#9481) — trois coupes au plus, en lecture seule,
 * sous le nom d'un compte Meeshy dans la fiche complète d'une carte de visite.
 * Même règle que la vitrine : fermée, elle ne se dessine pas.
 */
export function ContactGameStrip({ showcase }: { readonly showcase: UserShowcaseResponse | undefined }) {
  if (showcase === undefined || !showcase.visible) return null;
  const entries = entriesOf(showcase).slice(0, 3);
  if (entries.length === 0) return null;
  return (
    <ul className="flex items-end gap-2" data-game-contact-strip="" aria-label={gameText('game.profile.showcase')}>
      {entries.map((entry) => (
        <li key={entry.key} className="flex flex-col items-center">
          <Trophy kind={entry.view.kind} size={32} {...(entry.view.material === undefined ? {} : { material: entry.view.material })} />
          <span className="sr-only">{entry.view.title}</span>
        </li>
      ))}
    </ul>
  );
}

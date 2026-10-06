import type { UserGameProfileResponse, UserShowcaseResponse } from '@meeshy/shared/types/game';

import { formatGameNumber } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { gameText } from '@/lib/view/game-copy';
import { awardedMonthLabel, trophyView } from '@/lib/view/game-copy-v2';

import { GameTrophyShelf, type ShelfEntry } from './game-trophy-shelf';
import { Trophy } from './game/trophy';
import { GameStanding, GameStandingMini, visibleStanding } from './game-standing';
import { GAME_INK, GAME_INK_2, GameCard } from './game-surface';

/**
 * LE JEU D'UN AUTRE (#9481, #9387) — ce que SA visibilité autorise, rien sinon.
 * Le serveur décide (`visible`) ; quand il ferme la vitrine à ce lecteur, l'écran
 * ne dit PAS qu'elle existe : il ne dessine rien (une carte « vitrine fermée »
 * apprendrait qu'il y en a une). Un visiteur ne voit que le MOIS d'obtention d'un
 * trophée, jamais le jour (conformité D-3) : une coupe de ligue lui arrive avec
 * une clé au MOIS (`visitorTrophyKey`), et deux coupes identiques du même mois
 * sur UNE ligne comptée (`count`).
 *
 * Les clés de trophées d'une version plus récente ne se montrent pas : on ne nomme
 * pas ce qu'on ne comprend pas. Le niveau, le rang, le trésor et la Flamme d'un autre
 * viennent de `GET /users/:userId/game` (`game-standing.tsx`) : ce que son réglage
 * « rang » et son réglage « trésor » laissent voir, jamais un compte exact.
 */
const entriesOf = (showcase: UserShowcaseResponse): ShelfEntry[] => {
  const language = currentInterfaceLanguage();
  const items = new Map(showcase.items.map((item) => [item.key, item]));
  const ordered = [...new Set([...showcase.order, ...showcase.items.map((item) => item.key)])].filter((key) => items.has(key));
  return ordered.flatMap((key) => {
    const view = trophyView(key, language);
    const item = items.get(key);
    if (view === null || item === undefined) return [];
    const month = awardedMonthLabel(item.awardedMonth, language);
    const caption =
      item.count === undefined || item.count < 2
        ? gameText('game.showcase.awarded_month', { month })
        : gameText('game.showcase.awarded_month_count', { month, count: formatGameNumber(language, item.count) });
    return [{ key, view, caption }];
  });
};

export function GameProfileVisitor({
  showcase,
  game,
  name,
}: {
  readonly showcase: UserShowcaseResponse | undefined;
  /** Le niveau, le rang, le trésor et la Flamme que ses réglages laissent voir (#9481) ; absent : la vitrine seule. */
  readonly game?: UserGameProfileResponse | undefined;
  readonly name: string;
}) {
  const standing = visibleStanding(game);
  const entries = showcase === undefined || !showcase.visible ? [] : entriesOf(showcase);
  if (standing === null && entries.length === 0) return null;
  return (
    <GameCard id="game-profile-visitor" labelledBy="game-profile-visitor-title">
      <h2 id="game-profile-visitor-title" className="text-body font-bold" style={{ color: GAME_INK }}>
        {standing === null ? gameText('game.profile.visitor_title', { name }) : gameText('game.standing.title', { name })}
      </h2>
      {standing === null ? null : <GameStanding game={standing} />}
      {entries.length === 0 ? null : (
        <div className="flex flex-col gap-1.5" data-game-visitor-showcase="">
          {standing === null ? null : (
            <h3 className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
              {gameText('game.profile.showcase')}
            </h3>
          )}
          <GameTrophyShelf entries={entries} size={72} />
        </div>
      )}
    </GameCard>
  );
}

/**
 * LA BANDE DE LA CARTE DE CONTACT (#9481) — le niveau, le rang, le trésor et la Flamme en pictogrammes,
 * puis trois coupes au plus, en lecture seule, sous le nom d'un compte Meeshy dans la fiche complète
 * d'une carte de visite. Même règle que la vitrine : fermée, elle ne se dessine pas.
 */
export function ContactGameStrip({ showcase, game }: { readonly showcase: UserShowcaseResponse | undefined; readonly game?: UserGameProfileResponse | undefined }) {
  const standing = visibleStanding(game);
  const entries = showcase === undefined || !showcase.visible ? [] : entriesOf(showcase).slice(0, 3);
  if (standing === null && entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {standing === null ? null : <GameStandingMini game={standing} />}
      {entries.length === 0 ? null : (
        <ul className="flex items-end gap-2" data-game-contact-strip="" aria-label={gameText('game.profile.showcase')}>
          {entries.map((entry) => (
            <li key={entry.key} className="flex flex-col items-center">
              <Trophy kind={entry.view.kind} size={32} {...(entry.view.material === undefined ? {} : { material: entry.view.material })} />
              <span className="sr-only">{entry.view.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

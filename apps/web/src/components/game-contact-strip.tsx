import type { UserGameProfileResponse, UserShowcaseResponse } from '@meeshy/shared/types/game';

import { currentInterfaceLanguage } from '@/lib/interface-language';
import { gameText } from '@/lib/view/game-copy';
import { trophyView } from '@/lib/view/game-copy-v2';

import { Trophy } from './game/trophy';
import { GameStandingMini, visibleStanding } from './game-standing';

/**
 * LA BANDE DE LA CARTE DE CONTACT (#9481) — le niveau, le rang et le trésor en pictogrammes,
 * puis trois coupes au plus, en lecture seule, sous le nom d'un compte Meeshy dans la fiche complète
 * d'une carte de visite. Ce que SA visibilité autorise, rien sinon : le serveur décide (`visible`) ;
 * quand il ferme la vitrine à ce lecteur, la bande ne dit PAS qu'elle existe, elle ne se dessine pas.
 *
 * Les clés de trophées d'une version plus récente ne se montrent pas : on ne nomme pas ce qu'on ne
 * comprend pas. L'ordre du membre est respecté, un trophée absent de l'ordre arrive à la suite.
 */
const STRIP_SIZE = 3;

const trophiesOf = (showcase: UserShowcaseResponse) => {
  const language = currentInterfaceLanguage();
  const items = new Set(showcase.items.map((item) => item.key));
  const ordered = [...new Set([...showcase.order, ...showcase.items.map((item) => item.key)])].filter((key) => items.has(key));
  return ordered.flatMap((key) => {
    const view = trophyView(key, language);
    return view === null ? [] : [{ key, view }];
  });
};

export function ContactGameStrip({ showcase, game }: { readonly showcase: UserShowcaseResponse | undefined; readonly game?: UserGameProfileResponse | undefined }) {
  const standing = visibleStanding(game);
  const entries = showcase === undefined || !showcase.visible ? [] : trophiesOf(showcase).slice(0, STRIP_SIZE);
  if (standing === null && entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {standing === null ? null : <GameStandingMini game={standing} />}
      {entries.length === 0 ? null : (
        <ul className="flex items-end gap-2" data-game-contact-strip="" aria-label={gameText('game.profile.showcase')}>
          {entries.map((entry) => (
            <li key={entry.key} data-game-trophy={entry.key} className="flex flex-col items-center">
              <Trophy kind={entry.view.kind} size={32} {...(entry.view.material === undefined ? {} : { material: entry.view.material })} />
              <span className="sr-only">{entry.view.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

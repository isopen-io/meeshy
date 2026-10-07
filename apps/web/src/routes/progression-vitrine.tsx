import { SHOWCASE_DEFAULT_VISIBILITY } from '@meeshy/shared/utils/game/trophies';

import { GameShowcase } from '@/components/game-showcase';
import { GAME_BRAND, GAME_CARD, GAME_INK_2 } from '@/components/game-surface';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { gameText } from '@/lib/view/game-copy';
import { useGameV2Actions, type GameV2Actions } from '@/routes/game-v2-actions';
import { ProgressionPage } from '@/routes/progression-page';

/**
 * LA PAGE « VITRINE » (#9387) — les trophées du compte, leur ordre, et qui les
 * voit. Cache-first (le bloc `game` du hub), ranger et régler la visibilité sont
 * OPTIMISTES avec retour arrière. Le niveau affiché est celui du bloc servi :
 * « amis » par défaut (`SHOWCASE_DEFAULT_VISIBILITY`) quand le serveur ne sert pas
 * encore les réglages, jamais un niveau inventé plus ouvert.
 */
export function VitrineBody({ progress, actions, online }: { readonly progress: EngagementWithGame; readonly actions: GameV2Actions; readonly online: boolean }) {
  const game = progress.game;
  if (game === undefined || game.trophies === undefined) {
    return (
      <p className="rounded-card px-4 py-4 text-caption" style={{ backgroundColor: GAME_CARD, color: GAME_INK_2 }}>
        {gameText('game.unavailable')}
      </p>
    );
  }
  return (
    <GameShowcase
      trophies={game.trophies}
      visibility={game.visibility?.showcase ?? SHOWCASE_DEFAULT_VISIBILITY}
      online={online}
      savingOrder={actions.saveOrder.pending}
      savingVisibility={actions.visibility.pending}
      errors={{ order: actions.saveOrder.error, visibility: actions.visibility.error }}
      onOrder={actions.saveOrder.run}
      onVisibility={(level) => actions.visibility.run({ showcase: level })}
    />
  );
}

function VitrineScreenBody({ progress }: { readonly progress: EngagementWithGame }) {
  const online = useOnline();
  const actions = useGameV2Actions();
  return <VitrineBody progress={progress} actions={actions} online={online} />;
}

export default function ProgressionVitrineScreen() {
  suspendForGameCatalog(currentInterfaceLanguage());
  return (
    <ProgressionPage
      concept="showcase"
      titre={gameText('game.showcase.title')}
      teinte={GAME_BRAND}
      compte={(p) => {
        const trophies = (p as EngagementWithGame).game?.trophies;
        return trophies === undefined ? null : String(trophies.items.length);
      }}
    >
      {(progress) => <VitrineScreenBody progress={progress} />}
    </ProgressionPage>
  );
}

import { ATLAS_DEFAULT_VISIBILITY } from '@meeshy/shared/utils/game/trophies';

import { GameAtlas } from '@/components/game-atlas';
import { GAME_BRAND, GAME_CARD, GAME_INK_2 } from '@/components/game-surface';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { gameText } from '@/lib/view/game-copy';
import { useGameV2Actions, type GameV2Actions } from '@/routes/game-v2-actions';
import { ProgressionPage } from '@/routes/progression-page';

/**
 * LA PAGE « ATLAS DES LANGUES » (#9388) — le passeport aux tampons. PRIVÉ PAR
 * DÉFAUT : quand le serveur ne sert pas encore les réglages, l'écran suppose
 * « moi seul » (`ATLAS_DEFAULT_VISIBILITY`), jamais un niveau plus ouvert — une
 * langue peut révéler une origine ou une conviction (conformité E-1, E-2).
 */
export function AtlasBody({ progress, actions, online }: { readonly progress: EngagementWithGame; readonly actions: GameV2Actions; readonly online: boolean }) {
  const game = progress.game;
  if (game === undefined || game.atlas === undefined) {
    return (
      <p className="rounded-card px-4 py-4 text-caption" style={{ backgroundColor: GAME_CARD, color: GAME_INK_2 }}>
        {gameText('game.unavailable')}
      </p>
    );
  }
  return (
    <GameAtlas
      atlas={game.atlas}
      visibility={game.visibility?.atlas ?? ATLAS_DEFAULT_VISIBILITY}
      online={online}
      savingVisibility={actions.visibility.pending}
      error={actions.visibility.error}
      onVisibility={(level) => actions.visibility.run({ atlas: level })}
    />
  );
}

function AtlasScreenBody({ progress }: { readonly progress: EngagementWithGame }) {
  const online = useOnline();
  const actions = useGameV2Actions();
  return <AtlasBody progress={progress} actions={actions} online={online} />;
}

export default function ProgressionAtlasScreen() {
  suspendForGameCatalog(currentInterfaceLanguage());
  return (
    <ProgressionPage
      titre={gameText('game.atlas.title')}
      teinte={GAME_BRAND}
      compte={(p) => {
        const atlas = (p as EngagementWithGame).game?.atlas;
        return atlas === undefined ? null : `${atlas.stamped} / ${atlas.total}`;
      }}
    >
      {(progress) => <AtlasScreenBody progress={progress} />}
    </ProgressionPage>
  );
}

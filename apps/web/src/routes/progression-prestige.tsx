import { GamePrestige } from '@/components/game-prestige';
import { GAME_BRAND, GAME_CARD, GAME_INK_2 } from '@/components/game-surface';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { gameText } from '@/lib/view/game-copy';
import { useGameV2Actions, type GameV2Actions } from '@/routes/game-v2-actions';
import { ProgressionPage } from '@/routes/progression-page';

/**
 * LA PAGE « PRESTIGE » (#9389) — la proposition au niveau 100, l'explication par
 * Mee et Meo, la confirmation, le passage. Le geste est optimiste : le niveau
 * repart à 1 tout de suite (la loi est celle de la passerelle), la relecture
 * rend la vérité ; un refus restaure l'écran d'avant.
 */
export function PrestigeBody({ progress, actions, online }: { readonly progress: EngagementWithGame; readonly actions: GameV2Actions; readonly online: boolean }) {
  const game = progress.game;
  if (game === undefined || game.prestige === undefined) {
    return (
      <p className="rounded-card px-4 py-4 text-caption" style={{ backgroundColor: GAME_CARD, color: GAME_INK_2 }}>
        {gameText('game.unavailable')}
      </p>
    );
  }
  return (
    <GamePrestige
      level={game.level}
      prestige={game.prestige}
      online={online}
      pending={actions.prestige.pending}
      error={actions.prestige.error}
      onPass={() => actions.prestige.run()}
    />
  );
}

function PrestigeScreenBody({ progress }: { readonly progress: EngagementWithGame }) {
  const online = useOnline();
  const actions = useGameV2Actions();
  return <PrestigeBody progress={progress} actions={actions} online={online} />;
}

export default function ProgressionPrestigeScreen() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'progression');
  return (
    <ProgressionPage
      titre={gameText('game.prestige.title')}
      teinte={GAME_BRAND}
      compte={(p) => {
        const prestige = (p as EngagementWithGame).game?.prestige;
        return prestige === undefined ? null : `${prestige.stars} / ${prestige.max}`;
      }}
    >
      {(progress) => <PrestigeScreenBody progress={progress} />}
    </ProgressionPage>
  );
}

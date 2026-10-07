import { GameSeason } from '@/components/game-season';
import { GAME_BRAND, GAME_CARD, GAME_INK_2 } from '@/components/game-surface';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { gameText } from '@/lib/view/game-copy';
import { useGameV2Actions, type GameV2Actions } from '@/routes/game-v2-actions';
import { ProgressionPage } from '@/routes/progression-page';

/**
 * LA PAGE « SAISON » (#9386) — le parcours de huit semaines et ses quarante
 * étapes. Cache-first : le bloc `game` vient du cache de la progression (la
 * même clé que le hub), réclamer une étape est OPTIMISTE (l'étape se marque
 * tout de suite, la relecture rend le score et la Gloire). Devant un ancien
 * serveur (aucune clé `season` — `null` est une saison absente, pas un ancien
 * serveur), la page dit que cette partie n'est pas disponible.
 */
export function SaisonBody({ progress, actions, online }: { readonly progress: EngagementWithGame; readonly actions: GameV2Actions; readonly online: boolean }) {
  const game = progress.game;
  if (game === undefined || game.season === undefined) {
    return (
      <p className="rounded-card px-4 py-4 text-caption" style={{ backgroundColor: GAME_CARD, color: GAME_INK_2 }}>
        {gameText('game.unavailable')}
      </p>
    );
  }
  return (
    <GameSeason
      season={game.season}
      held={game.treasury.held}
      online={online}
      claimingStep={actions.claimStep.vars ?? null}
      buyingSeal={actions.buySeal.pending}
      errors={{ claim: actions.claimStep.error, seal: actions.buySeal.error }}
      onClaim={actions.claimStep.run}
      onBuySeal={() => actions.buySeal.run()}
    />
  );
}

function SaisonScreenBody({ progress }: { readonly progress: EngagementWithGame }) {
  const online = useOnline();
  const actions = useGameV2Actions();
  return <SaisonBody progress={progress} actions={actions} online={online} />;
}

export default function ProgressionSaisonScreen() {
  suspendForGameCatalog(currentInterfaceLanguage());
  return (
    <ProgressionPage
      concept="season"
      titre={gameText('game.season.title')}
      teinte={GAME_BRAND}
      compte={(p) => {
        const season = (p as EngagementWithGame).game?.season;
        return season === undefined || season === null ? null : `${season.steps} / ${season.stepsTotal}`;
      }}
    >
      {(progress) => <SaisonScreenBody progress={progress} />}
    </ProgressionPage>
  );
}

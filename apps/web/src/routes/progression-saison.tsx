import { useQuery } from '@tanstack/react-query';

import { parseSeasonNumberParam } from '@meeshy/shared/utils/game/game-links';
import type { GameSeasonArchive } from '@meeshy/shared/types/game-archive';

import { GameSeasonArchiveView, needsSeasonArchive, seasonShown, type ArchiveRead } from '@/components/game-archive';
import { GameSeason } from '@/components/game-season';
import { GAME_BRAND, GAME_CARD, GAME_INK_2 } from '@/components/game-surface';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { loadSeasonArchive, seasonArchiveQueryKey } from '@/lib/api/game-archive';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useOptionalRoute } from '@/lib/router';
import { gameText } from '@/lib/view/game-copy';
import { useGameV2Actions, type GameV2Actions } from '@/routes/game-v2-actions';
import { ProgressionPage } from '@/routes/progression-page';
import { ProgressionSkeleton } from '@/routes/progression-parts';

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
      upcoming={game.seasonUpcoming ?? null}
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

/**
 * LA SAISON QU'UN LIEN NOMME (#10018) — passée : mon palmarès ; future : son
 * thème et sa date d'ouverture ; en cours (ou sans lien) : la page d'avant,
 * inchangée. La lecture (`GET /me/game/seasons/:number`) est cache-first : la
 * dernière copie persistée sert hors ligne, et la saison à venir que le bloc
 * `game` porte déjà se peint sans attendre le réseau.
 */
export function SaisonFocusBody(props: {
  readonly progress: EngagementWithGame;
  readonly focus: number | null;
  readonly read: ArchiveRead<GameSeasonArchive>;
  readonly onRetry: () => void;
  readonly actions: GameV2Actions;
  readonly online: boolean;
}) {
  const shown = seasonShown(props.focus, props.progress.game, props.read);
  if (shown.kind !== 'current') return <GameSeasonArchiveView shown={shown} onRetry={props.onRetry} skeleton={<ProgressionSkeleton />} />;
  return <SaisonBody progress={props.progress} actions={props.actions} online={props.online} />;
}

function SaisonScreenBody({ progress }: { readonly progress: EngagementWithGame }) {
  const online = useOnline();
  const actions = useGameV2Actions();
  const asked = useOptionalRoute()?.params['saison'];
  const focus = asked === undefined ? null : parseSeasonNumberParam(asked);
  const archive = useQuery({
    queryKey: seasonArchiveQueryKey(focus ?? 0),
    enabled: focus !== null && needsSeasonArchive(focus, progress.game),
    queryFn: async ({ signal }): Promise<GameSeasonArchive> => unwrap(await loadSeasonArchive({ ...apiDeps, signal, number: focus ?? 0 })),
  });
  const read: ArchiveRead<GameSeasonArchive> = { data: archive.data, error: archive.data === undefined && archive.isError && !archive.isFetching ? (archive.error?.message ?? '') : null };
  return <SaisonFocusBody progress={progress} focus={focus} read={read} onRetry={() => void archive.refetch()} actions={actions} online={online} />;
}

export default function ProgressionSaisonScreen() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'progression');
  return (
    <ProgressionPage
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

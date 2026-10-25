import { useQuery } from '@tanstack/react-query';

import { parseSeasonNumberParam } from '@meeshy/shared/utils/game/game-links';
import type { GameSeasonArchive } from '@meeshy/shared/types/game-archive';

import type { LeagueMoment } from '@meeshy/shared/utils/game/league';
import { DEFAULT_SEASON_SCHEDULE, type SeasonSchedule } from '@meeshy/shared/utils/game/season-schedule';

import { GameSeasonArchiveView, needsSeasonArchive, seasonHeaderCount, seasonShown, type ArchiveRead } from '@/components/game-archive';
import { GameSeason } from '@/components/game-season';
import { GAME_BRAND, GAME_CARD, GAME_INK_2 } from '@/components/game-surface';
import { apiDeps } from '@/lib/api/deps';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { seasonArchiveQuery } from '@/lib/api/game-archive';
import { useSeasonSchedule } from '@/lib/api/game-season-calendar';
import { pausedSeasonOf } from '@/lib/game/paused-season';
import { localMoment } from '@/lib/game/local-moment';
import { useWeekCloseMoment } from '@/lib/game/season-clock';
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
export function SaisonBody({
  progress,
  actions,
  online,
  moment,
  schedule = DEFAULT_SEASON_SCHEDULE,
}: {
  readonly progress: EngagementWithGame;
  readonly actions: GameV2Actions;
  readonly online: boolean;
  readonly moment?: LeagueMoment | undefined;
  /** Le calendrier servi (#10232) : dit la saison mise en pause quand aucune n'est ouverte ni annoncée. */
  readonly schedule?: SeasonSchedule | undefined;
}) {
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
      paused={pausedSeasonOf(schedule)}
      moment={moment}
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
  /** L'instant qui juge l'état de la saison (#10131) — l'horloge locale par défaut. */
  readonly moment?: LeagueMoment | undefined;
  /** Le calendrier servi (#10232) — la pause, la date d'une saison future au cache froid. Absent : le repli. */
  readonly schedule?: SeasonSchedule | undefined;
}) {
  const shown = seasonShown(props.focus, props.progress.game, props.read, props.moment ?? localMoment(), props.schedule);
  if (shown.kind !== 'current') return <GameSeasonArchiveView shown={shown} onRetry={props.onRetry} skeleton={<ProgressionSkeleton />} moment={props.moment} />;
  return <SaisonBody progress={props.progress} actions={props.actions} online={props.online} moment={props.moment} schedule={props.schedule} />;
}

function SaisonScreenBody({ progress, focus, moment }: { readonly progress: EngagementWithGame; readonly focus: number | null; readonly moment?: LeagueMoment | undefined }) {
  const online = useOnline();
  const actions = useGameV2Actions();
  const schedule = useSeasonSchedule();
  const archive = useQuery(seasonArchiveQuery({ number: focus ?? 0, enabled: focus !== null && needsSeasonArchive(focus, progress.game), deps: apiDeps }));
  const read: ArchiveRead<GameSeasonArchive> = { data: archive.data, error: archive.data === undefined && archive.isError && !archive.isFetching ? (archive.error?.message ?? '') : null };
  return <SaisonFocusBody progress={progress} focus={focus} read={read} onRetry={() => void archive.refetch()} actions={actions} online={online} moment={moment} schedule={schedule} />;
}

/**
 * LA PAGE SAISON D'UN LIEN (#10132) — l'en-tête montre la saison du LIEN : « Saison n · terminée », « · à venir » ou
 * « · en cours » (#10131), comme iOS ; le compteur d'étapes de la saison en cours seulement quand c'est elle. Il lit
 * la même copie que le corps (même clé, aucune lecture de plus : l'observateur de l'en-tête ne lit jamais lui-même).
 */
export function ProgressionSaisonPage({ focus, moment }: { readonly focus: number | null; readonly moment?: LeagueMoment | undefined }) {
  const archive = useQuery({ ...seasonArchiveQuery({ number: focus ?? 0, enabled: false, deps: apiDeps }) });
  const schedule = useSeasonSchedule();
  return (
    <ProgressionPage
      titre={gameText('game.season.title')}
      teinte={GAME_BRAND}
      compte={(p) => {
        const game = p.game;
        const shown = seasonShown(focus, game, { data: archive.data, error: null }, moment ?? localMoment(), schedule);
        return seasonHeaderCount(shown, game?.season);
      }}
    >
      {(progress) => <SaisonScreenBody progress={progress} focus={focus} moment={moment} />}
    </ProgressionPage>
  );
}

export default function ProgressionSaisonScreen() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'progression');
  const asked = useOptionalRoute()?.params['saison'];
  // Restée ouverte, la page se repeint au dimanche 20 h (#10225) : l'instant se renouvelle à chaque fermeture.
  const moment = useWeekCloseMoment();
  return <ProgressionSaisonPage focus={asked === undefined ? null : parseSeasonNumberParam(asked)} moment={moment} />;
}

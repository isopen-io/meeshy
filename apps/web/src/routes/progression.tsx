import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { GameBird } from '@/components/game';
import { GameHiddenCard } from '@/components/game-hidden-card';
import { GameDetailHost } from '@/components/game-detail-sheet';
import { GAME_CARD, GAME_INK, GAME_INK_2, GAME_WARM } from '@/components/game-surface';
import { PRESS } from '@/components/game-touch';
import { MascotCoach } from '@/components/mascot';
import { ConceptCard, DashboardEmblem, ProgressionRow, RowEmblem } from '@/components/progression-concept';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress, type EngagementWithGame } from '@/lib/api/engagement';
import { useGamePrefs } from '@/lib/game/preferences';
import { progressionSection } from '@/lib/game/progression-section';
import { useGameSettings } from '@/lib/game/use-game-settings';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { PROGRESSION_SECTION_PARAM } from '@/lib/notifications/target';
import { useOptionalRoute } from '@/lib/router';
import { gameText } from '@/lib/view/game-copy';
import { conceptView, shownConcepts, shownProgress } from '@/lib/view/progression-concepts';
import { useMinute } from '@/lib/view/use-minute';
import { useGameActions } from '@/routes/progression-game-actions';
import { ProgressionHeaderGroup } from '@/routes/progression-header-group';
import { GameLead } from '@/routes/progression-lead';
import { ProgressionError, ProgressionSkeleton } from '@/routes/progression-parts';
import { OfflineNotice, ProgressionShell } from '@/routes/progression-shell';
import { Link, href, navigate } from '@/routes/route-table';

import type { EngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { mascotEvent as detectMascotEvent, mascotMoment, type MascotEvent } from '@meeshy/shared/utils/mascot';

export { ProgressionError, ProgressionSkeleton };
export { ElansHero, LastAchievementHero, LevelHero, MeeshDetail } from '@/routes/progression-heroes';

/**
 * « PROGRESSION » — UNE CARTE PAR CONCEPT (#9563, retour porteur du 2026-10-07).
 *
 * L'écran empilait tout : la carte du guide, le héros, les jauges, les missions,
 * le coffre, la ligue, la frappe, la Flamme, les portes. On n'y lisait plus rien
 * d'un coup d'œil. Il devient un SOMMAIRE : une carte par concept (tête, données
 * importantes, à quoi ça sert, comment ça marche), qui ouvre sa fiche
 * (`progression-concept.tsx`) — c'est là que vivent toutes ses données et ses
 * gestes. Le tableau de bord (`progression-tableau.tsx`) regroupe tout, en
 * lecture seule.
 *
 * Ce fichier ne décide ni de l'ordre ni de ce qui existe : il PARCOURT
 * `progressionConcepts` (`packages/shared`), que la fiche, le tableau de bord et
 * l'app iOS parcourent aussi. Ce qu'une carte dit vient de `conceptView`
 * (`lib/view/progression-concepts.ts`), écrit une fois pour les trois écrans.
 *
 * AUCUN GESTE DANS LA PAGE : ni frappe, ni coffre, ni gel. Une première page qui
 * agit redevient l'écran qu'on vient de quitter. L'en-tête, lui, garde ce que le
 * porteur y avait posé (#5839, #6480) : le blason du rang et le compteur de
 * Meeshes (`progression-header-group.tsx`), sur la coquille partagée dont
 * l'en-tête se réduit quand la page défile dessous (`progression-shell.tsx`).
 */

const ROW_GAP = 'flex flex-col gap-2';

/**
 * LE CORPS de la première page, pur : il rend ce que la progression servie
 * contient, sans requête. `guide` est la ligne de Mee que l'hôte fournit quand
 * le jeu est servi ; devant un ancien serveur, la mascotte d'avant ouvre l'écran.
 */
export function ProgressionBody({
  progress,
  guide,
  mascotEvent = null,
  now,
  entering = false,
}: {
  /** Première ouverture de la visite : les cartes entrent en scène, l'une après l'autre. */
  readonly entering?: boolean;
  readonly progress: EngagementWithGame;
  readonly guide?: ReactNode;
  /** Ce qui vient de se passer (#8907) — la mascotte le célèbre avant de revenir à l'état. */
  readonly mascotEvent?: MascotEvent | null;
  /** L'horloge des durées (fermeture de la ligue) ; absente : la minute courante. */
  readonly now?: Date;
}) {
  const minute = useMinute();
  const clock = now ?? new Date(minute * 60_000);
  const prefs = useGamePrefs();
  const playing = progress.game !== undefined;
  const hidden = playing && prefs.hidden;
  const view = shownProgress(progress, hidden);

  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      {hidden ? <GameHiddenCard /> : playing ? (guide ?? null) : <MascotCoach moment={mascotMoment(progress, mascotEvent)} />}
      {hidden ? null : (
        <ProgressionRow target={{ to: 'progressionTableau' }} marker="tableau" emblem={<DashboardEmblem />} name={gameText('game.dashboard.title')} />
      )}
      <ul data-progression-concepts="" className={ROW_GAP}>
        {shownConcepts(progress, hidden).map((concept, index) => (
          <li key={concept} {...(entering ? { 'data-game-enter': '', style: { '--game-enter-index': Math.min(index, 8) } as CSSProperties } : {})}>
            <ConceptCard concept={conceptView(concept, view, clock)} view={view} />
          </li>
        ))}
      </ul>
      {playing && !hidden ? (
        <nav aria-label={gameText('game.doors.label')} className={ROW_GAP}>
          <ProgressionRow target={{ to: 'progressionCarnet' }} marker="carnet" emblem={<RowEmblem tint={GAME_WARM} />} name={gameText('game.door.notebook')} />
          <ProgressionRow target={{ to: 'progressionRegles' }} marker="regles" emblem={<RowEmblem />} name={gameText('game.door.rules')} />
          <ProgressionRow target={{ to: 'progressionReglages' }} marker="reglages" emblem={<RowEmblem tint={GAME_INK_2} />} name={gameText('game.door.settings')} />
        </nav>
      ) : null}
    </div>
  );
}

const MEE_LINE = `${PRESS} flex w-full items-center gap-3 rounded-card px-4 py-2 text-start`;

/**
 * LA LIGNE DE MEE — le guide du moment, en UNE ligne courte. La carte complète
 * (explication, bouton, photo) ne s'ouvre que si on la touche : la première page
 * reste un sommaire. Sans rien à dire, Mee propose le carnet des règles.
 */
export function MeeLine({ line, open, onToggle, panelId }: { readonly line: string | null; readonly open: boolean; readonly onToggle: () => void; readonly panelId: string }) {
  const style = { minHeight: 44, backgroundColor: GAME_CARD } as const;
  const body = (
    <>
      <span aria-hidden="true" className="shrink-0">
        <GameBird bird="meeGuide" size={36} />
      </span>
      <span className="min-w-0 flex-1 truncate text-caption font-semibold" style={{ color: GAME_INK }}>
        {line ?? gameText('game.hero.mee_idle')}
      </span>
    </>
  );
  return line === null ? (
    <Link to="progressionRegles" data-progression-guide="idle" className={MEE_LINE} style={style}>
      {body}
    </Link>
  ) : (
    <button type="button" data-progression-guide="card" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className={MEE_LINE} style={style}>
      {body}
    </button>
  );
}

/** Mee sur la première page : sa ligne, et la carte du guide dépliée à la demande. */
function ProgressionGuide({ view }: { readonly view: EngagementWithGame }) {
  const [line, setLine] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <MeeLine line={line} open={open && line !== null} onToggle={() => setOpen((shown) => !shown)} panelId={panelId} />
      <div id={panelId} className="flex flex-col gap-4 empty:hidden">
        <GameLead view={view} onGuideLine={setLine} collapsed={!open || line === null} />
      </div>
    </>
  );
}

/**
 * `?section=missions` (#9539) : le toucher de l'annonce d'une mission
 * personnelle ouvre désormais la FICHE des missions. L'entrée de l'historique est
 * REMPLACÉE : « retour » depuis la fiche ramène à la première page, pas à
 * l'adresse qui renverrait aussitôt vers la fiche.
 */
function useSectionRedirect(): void {
  const concept = progressionSection(useOptionalRoute()?.search.get(PROGRESSION_SECTION_PARAM) ?? null);
  useEffect(() => {
    if (concept !== undefined) navigate(href('progressionConcept', { concept }), true);
  }, [concept]);
}

/**
 * L'ENTRÉE EN SCÈNE, UNE SEULE FOIS — les cartes de la première page montent
 * l'une après l'autre à la première ouverture de la visite, jamais au retour
 * depuis une fiche : un sommaire qu'on rejoue à chaque retour arrière fait
 * attendre celui qui sait déjà où il va.
 */
let hubHasEntered = false;

function useFirstEntrance(): boolean {
  const first = useRef(!hubHasEntered);
  useEffect(() => {
    hubHasEntered = true;
  }, []);
  return first.current;
}

export default function ProgressionScreen() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'progression');
  const online = useOnline();
  useGameSettings(true);
  useSectionRedirect();
  const entering = useFirstEntrance();

  /**
   * LA MASCOTTE CÉLÈBRE CE QUI CHANGE (#8907) — jamais l'état de la première
   * lecture. Elle n'ouvre l'écran que devant un ancien serveur : avec le jeu,
   * c'est la ligne de Mee qui parle.
   */
  const [mascotEvent, setMascotEvent] = useState<MascotEvent | null>(null);
  const seenProgressRef = useRef<EngagementProgress | null>(null);

  /**
   * LA FRAPPE DE L'EN-TÊTE (#5839, #9563) — le compteur de Meeshes rouvre la
   * feuille d'avant la refonte, avec sa frappe. L'identifiant d'idempotence est
   * généré UNE fois par intention de frappe (`progression-game-actions.ts`) :
   * un retry n'est jamais une seconde frappe.
   */
  const actions = useGameActions({
    onMinted: (result) => {
      if (result.status === 'minted' && result.balance !== undefined) setMascotEvent({ kind: 'meesh-minted', balance: result.balance });
    },
  });

  const query = useQuery({
    queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY,
    queryFn: async ({ signal }) => unwrap(await loadEngagementProgress({ ...apiDeps, signal })),
  });

  useEffect(() => {
    if (query.data === undefined) return;
    const event = detectMascotEvent(seenProgressRef.current, query.data);
    seenProgressRef.current = query.data;
    if (event !== null) setMascotEvent(event);
  }, [query.data]);

  return (
    <ProgressionShell
      title={gameText('game.progression.title')}
      back={{ to: 'list', label: 'Retour' }}
      trailing={query.data === undefined ? null : <ProgressionHeaderGroup progress={query.data} actions={actions} />}
      notice={online ? null : <OfflineNotice>Hors ligne — progression telle qu’à la dernière ouverture</OfflineNotice>}
    >
      {query.data !== undefined ? (
        <>
          <ProgressionBody progress={query.data} mascotEvent={mascotEvent} guide={<ProgressionGuide view={query.data} />} entering={entering} />
          <GameDetailHost progress={query.data} />
        </>
      ) : query.isError ? (
        <ProgressionError message={query.error.message} online={online} onRetry={() => void query.refetch()} />
      ) : (
        <ProgressionSkeleton />
      )}
    </ProgressionShell>
  );
}

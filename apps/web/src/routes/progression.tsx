import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { GameBird } from '@/components/game';
import { GameHiddenCard } from '@/components/game-hidden-card';
import { GAME_BRAND, GAME_CARD, GAME_INK, GAME_INK_2, GAME_WARM } from '@/components/game-surface';
import { Glyph } from '@/components/glyph';
import { GlassBack } from '@/components/glass-surface';
import { MascotCoach } from '@/components/mascot';
import { ConceptCard, ProgressionRow, RowEmblem } from '@/components/progression-concept';
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
import { GameLead } from '@/routes/progression-lead';
import { ProgressionError, ProgressionSkeleton } from '@/routes/progression-parts';
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
 * AUCUN GESTE ICI : ni frappe, ni coffre, ni gel. Une première page qui agit
 * redevient l'écran qu'on vient de quitter.
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
}: {
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
      <ProgressionRow
        target={{ to: 'progressionTableau' }}
        marker="tableau"
        emblem={<RowEmblem />}
        name={gameText('game.dashboard.title')}
      />
      <ul data-progression-concepts="" className={ROW_GAP}>
        {shownConcepts(progress, hidden).map((concept) => (
          <li key={concept}>
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

const MEE_LINE = 'flex w-full items-center gap-3 rounded-card px-4 py-2 text-start';

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

export default function ProgressionScreen() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'progression');
  const online = useOnline();
  useGameSettings(true);
  useSectionRedirect();

  /**
   * LA MASCOTTE CÉLÈBRE CE QUI CHANGE (#8907) — jamais l'état de la première
   * lecture. Elle n'ouvre l'écran que devant un ancien serveur : avec le jeu,
   * c'est la ligne de Mee qui parle.
   */
  const [mascotEvent, setMascotEvent] = useState<MascotEvent | null>(null);
  const seenProgressRef = useRef<EngagementProgress | null>(null);

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
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header className="glass z-10 shrink-0">
        <div className="flex items-center gap-2 px-4 py-2">
          <Link to="list" className="grid size-11 shrink-0 place-items-center" style={{ color: GAME_BRAND }} aria-label="Retour">
            <GlassBack>
              <Glyph name="caretLeft" size={22} className="rtl:-scale-x-100" />
            </GlassBack>
          </Link>
          <h1 className="flex-1 truncate text-title font-bold" style={{ color: GAME_INK }}>
            {gameText('game.progression.title')}
          </h1>
        </div>
        {online ? null : (
          <p
            role="status"
            className="flex items-center justify-center gap-1.5 px-4 py-1 text-check font-semibold"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-warn) 22%, transparent)', color: GAME_INK }}
          >
            <Glyph name="warningCircle" size={11} />
            Hors ligne — progression telle qu’à la dernière ouverture
          </p>
        )}
      </header>

      <main id="contenu" className="flex-1 overflow-y-auto pb-safe">
        {query.data !== undefined ? (
          <ProgressionBody progress={query.data} mascotEvent={mascotEvent} guide={<ProgressionGuide view={query.data} />} />
        ) : query.isError ? (
          <ProgressionError message={query.error.message} online={online} onRetry={() => void query.refetch()} />
        ) : (
          <ProgressionSkeleton />
        )}
      </main>
    </div>
  );
}

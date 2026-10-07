import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import { GameFlamePanel } from '@/components/game-flame-panel';
import { GameHero } from '@/components/game-hero';
import { GameHiddenCard } from '@/components/game-hidden-card';
import { GameLeagueSummary } from '@/components/game-league-summary';
import { GameMintPreview } from '@/components/game-mint-preview';
import { GameMissions } from '@/components/game-missions';
import { GAME_BRAND, GAME_CARD, GAME_INK, GAME_INK_2 } from '@/components/game-surface';
import { GameTouch } from '@/components/game-touch';
import { ConceptEmblem, ConceptFacts, ConceptGauge, ProgressionRow, RowEmblem } from '@/components/progression-concept';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { useGamePrefs } from '@/lib/game/preferences';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { FICHE_SECTION_PARAM, ficheSection } from '@/lib/game/progression-nav';
import { useOptionalRoute, useParams } from '@/lib/router';
import { gameText } from '@/lib/view/game-copy';
import { detailOfRef } from '@/lib/view/game-detail';
import { conceptView, ficheView, isProgressionConcept, shownConcepts, shownProgress, type ConceptView } from '@/lib/view/progression-concepts';
import { useMinute } from '@/lib/view/use-minute';
import { useGameActions, type GameActions } from '@/routes/progression-game-actions';
import { ElansHero, LastAchievementHero, LevelHero, MeeshDetail } from '@/routes/progression-heroes';
import { ProgressionPage } from '@/routes/progression-page';

/**
 * LA FICHE D'UN CONCEPT (#9563) — le niveau 2 de « Progression ». UN gabarit
 * pour les quinze concepts, dans cet ordre :
 *
 *   1. le héros        — l'emblème en grand, la valeur, la jauge vers la suite ;
 *                         OU la pièce de jeu du concept, qui le REMPLACE (Niveau,
 *                         Ligue, Élans, Meeshes — amendement n° 4, règle 3) ;
 *   2. « C'est quoi ? » — à quoi ça sert, comment ça marche : la MÊME phrase que
 *                         sur la carte de la première page, jamais une seconde ;
 *   3. « Où j'en suis » — les données que le héros ne montre pas déjà
 *                         (`ficheView`) ; absente quand il n'en reste aucune ;
 *   4. « Comment en gagner » — deux gestes simples ;
 *   5. les gestes — ouvrir le coffre, changer une mission, protéger la Flamme :
 *                         ils vivent ICI, plus sur la première page (la frappe
 *                         est dans la pièce des Meeshes, son seul site) ;
 *   6. « Aller plus loin » — la sous-page du concept, et elle seule (carte de
 *                         navigation, `lib/game/progression-nav.ts`).
 *
 * Les pièces du jeu et les héros d'avant ne sont pas réécrits : ils sont RANGÉS
 * dans la fiche de leur concept. Les gestes gardent leur retour instantané, leur
 * restauration sur échec et leur clé d'idempotence (`useGameActions`).
 */

export type FicheHost = {
  readonly actions: GameActions;
  readonly online: boolean;
};

function FicheSection({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }) {
  const titleId = `fiche-${id}`;
  return (
    <section data-fiche-section={id} aria-labelledby={titleId} className="flex flex-col gap-2 rounded-card px-4 py-4" style={{ backgroundColor: GAME_CARD }}>
      <h2 id={titleId} className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * LE HÉROS GÉNÉRIQUE : l'emblème en grand, la valeur, la jauge. L'emblème se
 * touche : il ouvre les précisions de SON élément. Les pastilles sont celles de
 * la carte ; ici, leurs données sont dans « Où j'en suis » — une fois.
 */
function Hero({ concept, view }: { readonly concept: ConceptView; readonly view: EngagementWithGame }) {
  const primary = detailOfRef(concept.primary, concept.key, concept.name, concept.value, view);
  return (
    <section
      data-fiche-section="hero"
      data-fiche-hero="generic"
      aria-label={concept.name}
      className="flex flex-col items-center gap-3 rounded-card px-4 py-5 text-center"
      style={{ backgroundColor: GAME_CARD }}
    >
      <GameTouch detail={primary} named className="grid place-items-center rounded-card" style={{ minHeight: 88, minWidth: 88 }}>
        <span aria-hidden="true" className="grid place-items-center">
          <ConceptEmblem concept={concept.key} view={view} size={88} />
        </span>
      </GameTouch>
      <p className="text-large-title font-bold" style={{ color: GAME_INK }}>
        {concept.value}
      </p>
      {concept.gauge === null ? null : <ConceptGauge gaugeKey={`fiche:${concept.key}`} progress={concept.gauge} label={`${concept.name} — ${concept.value}`} />}
    </section>
  );
}

function Explained({ label, text }: { readonly label: string; readonly text: string }) {
  return (
    <p className="text-body" style={{ color: GAME_INK }}>
      <span className="block text-caption font-semibold" style={{ color: GAME_INK_2 }}>
        {label}
      </span>
      {text}
    </p>
  );
}

/**
 * LA PIÈCE DE JEU QUI TIENT LIEU DE HÉROS (règle 3) — `null` quand le concept
 * garde le héros générique. `ficheView` dit la même chose côté données : les deux
 * lisent la même condition, et le témoin les confronte.
 */
function pieceOf(concept: ProgressionConcept, view: EngagementWithGame, host: FicheHost, now: Date): ReactNode {
  const game = view.game;
  const { actions, online } = host;
  switch (concept) {
    case 'level':
      return game === undefined ? <LevelHero progress={view} mintCost={view.meesh?.mintCost ?? null} /> : <GameHero game={game} guideLine={null} elan={view.elan} />;
    case 'meesh':
      if (game !== undefined) {
        return (
          <GameMintPreview
            mint={game.mint}
            badgesLost={view.mintBadgeLoss}
            online={online}
            minting={actions.pending.mint}
            error={actions.errors.mint}
            celebration={actions.celebration}
            strikeKey={actions.strikeKey}
            onMint={actions.mint}
          />
        );
      }
      return view.meesh === undefined ? null : (
        <section aria-label={gameText('game.concept.meesh.name')} className="rounded-card px-4 py-4" style={{ backgroundColor: GAME_CARD }}>
          <MeeshDetail meesh={view.meesh} onMint={actions.mint} isMinting={actions.pending.mint} mintError={actions.errors.mint} />
        </section>
      );
    case 'league':
      return game?.league?.access === 'open' && game.league.current !== null ? <GameLeagueSummary league={game.league} now={now} /> : null;
    case 'elans':
      return <ElansHero progress={view} />;
    default:
      return null;
  }
}

/** Les gestes du concept, sous ses données : les pièces existantes, rangées. `null` quand le concept n'en a pas. */
function gesturesOf(concept: ProgressionConcept, view: EngagementWithGame, host: FicheHost): ReactNode {
  const game = view.game;
  const { actions, online } = host;
  switch (concept) {
    case 'missions':
      return game === undefined ? null : (
        <GameMissions
          missions={game.missions}
          chest={game.chest}
          held={game.treasury.held}
          level={game.level.level}
          prismHour={game.boosts.prismHour}
          online={online}
          pendingRerollId={actions.pending.rerollId}
          chestOpening={actions.pending.chest}
          onReroll={actions.reroll}
          onClaim={actions.claimChest}
          errors={{ reroll: actions.errors.reroll, chest: actions.errors.chest }}
        />
      );
    case 'flame':
      return game === undefined ? null : (
        <GameFlamePanel
          flame={game.flame}
          held={game.treasury.held}
          online={online}
          buyingFreeze={actions.pending.freeze}
          relighting={actions.pending.relight}
          onBuyFreeze={actions.buyFreeze}
          onRelight={actions.relight}
          errors={{ freeze: actions.errors.freeze, relight: actions.errors.relight }}
        />
      );
    case 'succes':
      return <LastAchievementHero progress={view} />;
    default:
      return null;
  }
}

/**
 * LA SECTION QU'UNE ENTRÉE VISE (`?section=gestures`, carte de navigation) — la
 * notification de la mission du jour ouvre la fiche des missions défilée
 * jusqu'à la liste et au coffre. La demande est CONSOMMÉE : l'adresse la perd
 * aussitôt (sans nouvelle entrée), pour qu'un retour sur cette fiche retrouve
 * la position laissée plutôt que de redéfiler.
 */
function useFicheFocus(article: RefObject<HTMLElement | null>): void {
  const asked = ficheSection(useOptionalRoute()?.search.get(FICHE_SECTION_PARAM) ?? null);
  useLayoutEffect(() => {
    if (asked === undefined) return;
    article.current?.querySelector(`[data-fiche-section="${asked}"]`)?.scrollIntoView({ block: 'start' });
    const url = new URL(window.location.href);
    url.searchParams.delete(FICHE_SECTION_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [asked, article]);
}

export function ConceptFiche({
  concept,
  progress,
  host,
  now,
}: {
  readonly concept: ProgressionConcept;
  readonly progress: EngagementWithGame;
  readonly host: FicheHost;
  /** L'horloge des durées ; absente : la minute courante. */
  readonly now?: Date;
}) {
  const minute = useMinute();
  const clock = now ?? new Date(minute * 60_000);
  const prefs = useGamePrefs();
  const hidden = progress.game !== undefined && prefs.hidden;
  const view = shownProgress(progress, hidden);
  const article = useRef<HTMLElement>(null);
  useFicheFocus(article);

  if (!shownConcepts(progress, hidden).includes(concept)) {
    return (
      <>
        {hidden ? <GameHiddenCard /> : null}
        <p data-fiche-unknown="" className="rounded-card px-4 py-4 text-caption" style={{ backgroundColor: GAME_CARD, color: GAME_INK_2 }}>
          {gameText('game.fiche.unknown')}
        </p>
      </>
    );
  }

  const shown = conceptView(concept, view, clock);
  const where = ficheView(concept, view, clock);
  const piece = pieceOf(concept, view, host, clock);
  const gestures = gesturesOf(concept, view, host);
  return (
    <article ref={article} data-concept-fiche={concept} className="flex flex-col gap-4">
      {piece === null ? (
        <Hero concept={shown} view={view} />
      ) : (
        <div data-fiche-section="hero" data-fiche-hero="piece" className="flex flex-col">
          {piece}
        </div>
      )}
      <FicheSection id="what" title={gameText('game.fiche.what')}>
        <Explained label={gameText('game.concept.why_label')} text={shown.why} />
        <Explained label={gameText('game.concept.how_label')} text={shown.how} />
      </FicheSection>
      {where.facts.length === 0 ? null : (
        <FicheSection id="where" title={gameText('game.fiche.where')}>
          <ConceptFacts facts={where.facts} open={(fact) => detailOfRef(fact.ref, concept, fact.label, fact.value, view)} />
        </FicheSection>
      )}
      <FicheSection id="earn" title={gameText('game.fiche.earn')}>
        <ul className="flex list-disc flex-col gap-1 ps-5 text-body" style={{ color: GAME_INK }}>
          {shown.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </FicheSection>
      {gestures === null ? null : (
        <div data-fiche-section="gestures" className="flex scroll-mt-20 flex-col gap-4">
          {gestures}
        </div>
      )}
      {shown.more.length === 0 ? null : (
        <nav data-fiche-section="more" aria-labelledby="fiche-more" className="flex flex-col gap-2">
          <h2 id="fiche-more" className="px-1 text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
            {gameText('game.fiche.more')}
          </h2>
          {shown.more.map((page) => (
            <ProgressionRow key={page.to} target={{ to: page.to }} marker={page.to} emblem={<RowEmblem />} name={page.label} />
          ))}
        </nav>
      )}
    </article>
  );
}

function FicheScreenBody({ concept, progress }: { readonly concept: ProgressionConcept; readonly progress: EngagementWithGame }) {
  const online = useOnline();
  const actions = useGameActions();
  return <ConceptFiche concept={concept} progress={progress} host={{ actions, online }} />;
}

export default function ProgressionConceptScreen() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'progression');
  const { concept: asked } = useParams<'/me/progression/concept/$concept'>();
  const concept = isProgressionConcept(asked) ? asked : null;
  return (
    <ProgressionPage
      titre={concept === null ? gameText('game.progression.title') : gameText(`game.concept.${concept}.name`)}
      teinte={GAME_BRAND}
      compte={() => null}
      {...(concept === null ? {} : { fiche: concept })}
    >
      {(progress) =>
        concept === null ? (
          <p data-fiche-unknown="" className="rounded-card px-4 py-4 text-caption" style={{ backgroundColor: GAME_CARD, color: GAME_INK_2 }}>
            {gameText('game.fiche.unknown')}
          </p>
        ) : (
          <FicheScreenBody concept={concept} progress={progress} />
        )
      }
    </ProgressionPage>
  );
}

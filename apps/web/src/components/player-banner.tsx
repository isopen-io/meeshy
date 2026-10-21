import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress } from '@/lib/api/engagement';
import { attachmentSrc } from '@/lib/api/media-url';
import { myProfileQueryOptions } from '@/lib/api/profile';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import type { EffectEnv } from '@/lib/game/gl/effect-runner';
import { SHEEN_PASS_MS, SHEEN_SWEEP_START_MS } from '@/lib/game/gl/timeline';
import { prefersReducedMotion } from '@/lib/game/haptics';
import { useGamePrefs } from '@/lib/game/preferences';
import { useGameSettings } from '@/lib/game/use-game-settings';
import { tierTint } from '@/lib/game/tier-emblem';
import { loadGameScreenCatalog, suspendForGameCatalog, translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { formatCount, rankLabel, standingLabel } from '@/lib/view/game-copy';
import {
  bannerShortCount,
  isLargeText,
  leaguePlace,
  playerBannerLabel,
  playerBannerModel,
  playerBannerPieceLabels,
  type PlayerBannerLevel,
  type PlayerBannerModel,
  type PlayerBannerRank,
} from '@/lib/view/player-banner';
import { playerBannerVisitStore, reportPlayerBannerShown } from '@/lib/view/player-banner-visit';
import { Link } from '@/routes/route-table';
import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import { Flame } from './game/flame';
import { GameEffectLayer } from './game/game-effect-layer';
import { LeagueGem } from './game/league-gem';
import { LevelRing } from './game/level-ring';
import { MeeshCoin } from './game/meesh-coin';
import { RankBlason } from './game/rank-blason';
import { Signature } from './game/signature';
import { Trophy } from './game/trophy';
import { useChoreography } from './game/use-choreography';
import { useRollingNumber, type RollEnv } from './game/use-rolling-number';

import '@/styles/player-banner.css';

/**
 * LA BANNIÈRE DU JOUEUR (#9494, conception XIII.1) — le bandeau du haut,
 * quand aucun appel ni aucun audio ne l'occupe (`lib/view/top-band.ts`).
 * Ordre FIXE, de gauche à droite, et SEULEMENT ce qui existe
 * (`playerBannerModel`) : l'anneau de niveau (#9481), la jauge vers le niveau
 * suivant avec les points et ce qu'il manque, puis le milieu (Flamme, Meeshes,
 * mission du jour, ligue) et le rang avec sa jauge de Gloire (#11125).
 *
 * Décor : la Signature en filigrane, teintée par la couleur du palier ; une
 * carte posée au sommet, jamais une bulle.
 *
 * Le MOUVEMENT : un gain de points fait ROULER le chiffre (`useRollingNumber`)
 * et avancer la jauge ; le passage d'un niveau rejoue la chorégraphie de
 * l'anneau (`levelGain`) et passe un reflet WebGL du moteur du jeu, UNE fois
 * (`GameEffectLayer`, balayage immédiat, monté le temps du balayage puis
 * retiré : aucun contexte WebGL ne reste ouvert sur un écran du quotidien).
 * Rien ne bouge à la première peinture (cache d'abord) ni sous
 * `prefers-reduced-motion`. Aux très grandes tailles de texte (au-delà de XXL)
 * la jauge passe sous l'anneau.
 *
 * CHAQUE PIÈCE EST UN LIEN vers sa fiche (porteur, 2026-10-16 ; carte de navigation de #9563 : une entrée extérieure
 * ouvre la fiche du concept, jamais la racine) : l'anneau → le Niveau, la jauge et ses étincelles → les Étincelles (`points`),
 * les Meeshes → la Meesh, le blason → la Gloire, la gemme → la Ligue, la Flamme → la Flamme, et — nouvelles pièces — les
 * trophées → la Vitrine (`showcase`), la mission du jour → les Missions, la saison → la Saison. Chaque lien porte son NOM
 * accessible (`playerBannerPieceLabels`) ; ses enfants sont des dessins et des chiffres cachés (`aria-hidden`). Le conteneur est
 * un groupe nommé d'une phrase complète (`playerBannerLabel`) — jamais un lien, puisque des liens ne s'imbriquent pas.
 * Chaque cible fait au moins 44 px de haut, sauf les pièces du milieu (24 px, voir `compact`) ; le bandeau, 48.
 *
 * LA RANGÉE COMPACTE (#11125, porteur 2026-10-20) : à gauche l'anneau et la jauge des étincelles ; au milieu, en pièces de
 * 24 px sur deux lignes, la Flamme et les Meeshes en haut, la mission du jour et la ligue dessous ; à droite le blason et le
 * nom du rang au-dessus de sa jauge de Gloire, et dessous ce qui manque pour le rang suivant — au rang sans suite (Légende I,
 * Mythe), la Gloire seule. Trophées et saison quittent la rangée ; ils restent dans la disposition grand texte.
 */
const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const CARD = 'var(--color-ios-card)';
const GLORY = 'var(--game-gold-1)';

/**
 * Tout ce que le navigateur apporte au mouvement, injectable pour les témoins :
 * la limitation des animations, la taille du texte, la boucle du chiffre, le
 * moteur WebGL du reflet, la minuterie qui le retire.
 */
export type BannerMotion = {
  readonly reducedMotion: boolean;
  readonly largeText: boolean;
  readonly roll: RollEnv;
  readonly createEnv: (host: HTMLElement, canvas: HTMLCanvasElement) => EffectEnv;
  readonly schedule: (run: () => void, ms: number) => () => void;
};

/** Le reflet dure le seul balayage du moteur (le passage sans son repos), plus une marge pour la dernière image. */
const GLINT_MS = SHEEN_PASS_MS - SHEEN_SWEEP_START_MS + 120;

const defaultSchedule = (run: () => void, ms: number): (() => void) => {
  const id = setTimeout(run, ms);
  return () => clearTimeout(id);
};

const readLargeText = (): boolean => typeof document !== 'undefined' && typeof getComputedStyle === 'function' && isLargeText(Number.parseFloat(getComputedStyle(document.documentElement).fontSize));

/** La taille du texte de la racine : relue au redimensionnement et au retour sur l'application (le réglage se change hors d'elle). */
function useLargeText(): boolean {
  const [large, setLarge] = useState(readLargeText);
  useEffect(() => {
    const update = (): void => setLarge(readLargeText());
    window.addEventListener('resize', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return large;
}

/** Un lien vers la fiche d'un concept, nommé par la pièce qu'il contient : ses enfants sont des dessins cachés. */
function PieceLink({
  concept,
  label,
  style,
  className = '',
  compact = false,
  children,
}: {
  readonly concept: ProgressionConcept;
  readonly label: string | null;
  readonly style?: React.CSSProperties | undefined;
  readonly className?: string;
  /** Pièce du milieu (Flamme, Meeshes, mission, ligue) : une ligne de 24 px, deux par colonne — la bannière tient en 48. */
  readonly compact?: boolean;
  readonly children: React.ReactNode;
}) {
  if (label === null) return null;
  return (
    <Link
      to="progressionConcept"
      params={{ concept }}
      data-player-banner-link={concept}
      aria-label={label}
      className={`pointer-events-auto flex shrink-0 items-center rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
      style={{ minHeight: compact ? 24 : 44, ...style }}
    >
      {children}
    </Link>
  );
}

function Gauge({ model, level, tint, roll, large }: { readonly model: PlayerBannerModel; readonly level: PlayerBannerLevel; readonly tint: string; readonly roll: RollEnv | undefined; readonly large: boolean }) {
  const language = currentInterfaceLanguage();
  const { points } = model;
  const fill = Math.min(1, Math.max(0, Number.isFinite(level.progress) ? level.progress : 0));
  const score = useRollingNumber(points ?? 0, roll);
  const missing = useRollingNumber(level.pointsToNext ?? 0, roll);
  return (
    <span
      aria-hidden="true"
      data-player-banner-gauge={level.nextLevel ?? 'top'}
      className={`flex flex-col justify-center gap-1 leading-tight ${large ? 'w-full basis-full' : 'min-w-16 flex-1'}`}
      style={large ? { order: 2 } : undefined}
    >
      {points === null ? null : (
        <span className="truncate text-check font-bold tabular-nums" style={{ color: INK }}>
          {translateGame(language, 'game.banner.points', { points: formatCount(score, language) })}
        </span>
      )}
      <span className="relative block h-1.5 w-full overflow-hidden rounded-chip" style={{ backgroundColor: `color-mix(in srgb, ${INK} 12%, transparent)` }}>
        <span className="player-banner-fill absolute inset-0 rounded-chip" style={{ transform: `scaleX(${fill.toFixed(3)})`, backgroundColor: tint }} />
      </span>
      {level.pointsToNext === null ? null : (
        <span data-player-banner-missing={level.pointsToNext} className="truncate text-caption tabular-nums" style={{ color: INK_2 }}>
          {translateGame(language, 'game.banner.level_short', { n: bannerShortCount(missing, language), level: formatCount(level.nextLevel ?? level.level + 1, language) })}
        </span>
      )}
    </span>
  );
}

function Piece({ name, value, children }: { readonly name: string; readonly value: string | number; readonly children: React.ReactNode }) {
  return (
    <span aria-hidden="true" {...{ [`data-player-banner-${name}`]: value }} className="flex shrink-0 items-center gap-1 px-1 text-check font-bold tabular-nums" style={{ color: INK }}>
      {children}
    </span>
  );
}

/**
 * Le nom du rang au-dessus de sa jauge de Gloire, et dessous la forme courte « 5 543 vers Passeur II » — ou « Gloire N »,
 * sans suite. Le chiffre est compact dès 10 000 (`bannerShortCount`) ; le nom accessible garde la phrase complète.
 */
function RankGauge({ rank, roll }: { readonly rank: PlayerBannerRank; readonly roll: RollEnv | undefined }) {
  const language = currentInterfaceLanguage();
  const missing = useRollingNumber(rank.gloryMissing ?? 0, roll);
  const total = useRollingNumber(rank.glory, roll);
  const fill = Math.min(1, Math.max(0, Number.isFinite(rank.progress) ? rank.progress : 0));
  const next = rank.next === null || rank.gloryMissing === null ? null : rank.next;
  return (
    <span data-player-banner-rank-gauge="" className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 leading-tight">
      <span data-player-banner-rank-name="" className="truncate text-check font-bold" style={{ color: INK }}>
        {standingLabel(rank, language)}
      </span>
      {next === null ? (
        <span data-player-banner-rank-total="" className="truncate text-caption tabular-nums" style={{ color: INK_2 }}>
          {translateGame(language, 'game.banner.glory_top', { n: bannerShortCount(total, language) })}
        </span>
      ) : (
        <>
          <span className="relative block h-1.5 w-full overflow-hidden rounded-chip" style={{ backgroundColor: `color-mix(in srgb, ${INK} 12%, transparent)` }}>
            <span data-player-banner-rank-fill="" className="player-banner-fill absolute inset-0 rounded-chip" style={{ transform: `scaleX(${fill.toFixed(3)})`, backgroundColor: GLORY }} />
          </span>
          <span data-player-banner-rank-missing="" className="truncate text-caption tabular-nums" style={{ color: INK_2 }}>
            {translateGame(language, 'game.banner.glory_short', { n: bannerShortCount(missing, language), rank: rankLabel(next.rank, next.division, language) })}
          </span>
        </>
      )}
    </span>
  );
}

export function PlayerBanner({ model, motion = {}, backdrop = null }: { readonly model: PlayerBannerModel; readonly motion?: Partial<BannerMotion>; /** La bannière de profil de l'utilisateur, déjà résolue en adresse ; posée en translucide sous les informations (#9536). */ readonly backdrop?: string | null }) {
  const language = currentInterfaceLanguage();
  const tint = tierTint(model.tier);
  const level = model.level;
  const measuredLarge = useLargeText();
  const large = motion.largeText ?? measuredLarge;
  const reduced = (): boolean => motion.reducedMotion ?? prefersReducedMotion();
  const schedule = motion.schedule ?? defaultSchedule;

  const ring = useChoreography<HTMLSpanElement>(motion.reducedMotion === undefined ? {} : { reducedMotion: motion.reducedMotion });
  const previousLevel = useRef(level?.level ?? 1);
  const [glint, setGlint] = useState(0);
  const stopGlint = useRef<() => void>(() => undefined);
  useEffect(() => () => stopGlint.current(), []);
  useEffect(() => {
    const before = previousLevel.current;
    const now = level?.level ?? 1;
    previousLevel.current = now;
    if (now <= before) return;
    ring.play('levelGain');
    if (reduced()) return;
    stopGlint.current();
    setGlint((count) => count + 1);
    stopGlint.current = schedule(() => setGlint(0), GLINT_MS);
  }, [level?.level]);

  const names = playerBannerPieceLabels(model, language);

  return (
    <div className="pointer-events-none flex w-full justify-center">
      <div
        role="group"
        data-player-banner=""
        aria-label={playerBannerLabel(model, language, large ? 'large' : 'compact')}
        {...(large ? { 'data-large-text': '' } : {})}
        className={`player-banner pointer-events-none relative isolate flex w-full items-center gap-2.5 overflow-hidden rounded-card py-1 pe-3 ps-1 shadow-lg${large ? ' flex-wrap' : ''}`}
        style={{
          minHeight: 48,
          maxWidth: 560,
          color: INK,
          background: `linear-gradient(var(--player-banner-sweep, 100deg), color-mix(in srgb, ${tint} 16%, ${CARD}), ${CARD} 70%)`,
          border: `1px solid color-mix(in srgb, ${tint} 28%, transparent)`,
        }}
      >
        {backdrop === null ? null : (
          <>
            <img data-player-banner-backdrop="" src={backdrop} alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute inset-0 -z-10 size-full object-cover" style={{ opacity: 0.55 }} />
            <span
              aria-hidden="true"
              data-player-banner-veil=""
              className="pointer-events-none absolute inset-0 -z-10"
              style={{ background: `linear-gradient(var(--player-banner-sweep, 100deg), color-mix(in srgb, ${CARD} 82%, transparent), color-mix(in srgb, ${CARD} 52%, transparent))` }}
            />
          </>
        )}
        <span aria-hidden="true" data-player-banner-watermark="" className="pointer-events-none absolute -end-4 -top-6 opacity-[0.12]" style={{ color: tint }}>
          <Signature size={120} color="currentColor" />
        </span>
        {level === null ? null : (
          <>
            <PieceLink concept="level" label={names.level}>
              <span ref={ring.ref} aria-hidden="true" data-player-banner-ring={level.level} className="relative shrink-0">
                <LevelRing level={level.level} tier={model.tier} progress={level.progress} size={40} prestige={level.prestige} />
                {glint === 0 ? null : <GameEffectLayer key={glint} effect="sheen" circle passes={1} immediate {...(motion.createEnv === undefined ? {} : { createEnv: motion.createEnv })} />}
              </span>
            </PieceLink>
            <PieceLink concept="points" label={names.sparks} className={large ? 'w-full basis-full' : 'min-w-16 flex-1'} style={large ? { order: 2 } : undefined}>
              <Gauge model={model} level={level} tint={tint} roll={motion.roll} large={large} />
            </PieceLink>
          </>
        )}
        {level !== null || model.points === null ? null : (
          <PieceLink concept="points" label={names.sparks}>
            <Piece name="points" value={model.points}>
              {translateGame(language, 'game.banner.points', { points: formatCount(model.points, language) })}
            </Piece>
          </PieceLink>
        )}
        {model.flame === null && model.meeshes === null && model.missions === null && model.league === null ? null : (
          <span data-player-banner-middle="" className="flex shrink-0 flex-col justify-center">
            {model.flame === null && model.meeshes === null ? null : (
              <span data-player-banner-row="top" className="flex items-center">
                {model.flame === null ? null : (
                  <PieceLink concept="flame" label={names.flame} compact>
                    <Piece name="flame" value={model.flame.days}>
                      <Flame form={model.flame.form} size={20} />
                      {formatCount(model.flame.days, language)}
                    </Piece>
                  </PieceLink>
                )}
                {model.meeshes === null ? null : (
                  <PieceLink concept="meesh" label={names.meesh} compact>
                    <Piece name="meeshes" value={model.meeshes}>
                      <MeeshCoin side="obverse" size={20} />
                      {formatCount(model.meeshes, language)}
                    </Piece>
                  </PieceLink>
                )}
              </span>
            )}
            {model.missions === null && model.league === null ? null : (
              <span data-player-banner-row="bottom" className="flex items-center">
                {model.missions === null ? null : (
                  <PieceLink concept="missions" label={names.missions} compact>
                    <Piece name="missions" value={`${model.missions.done}/${model.missions.total}`}>
                      <span aria-hidden="true">✓</span>
                      {formatCount(model.missions.done, language)}/{formatCount(model.missions.total, language)}
                    </Piece>
                  </PieceLink>
                )}
                {model.league === null ? null : (
                  <PieceLink concept="league" label={names.league} compact>
                    <Piece name="league" value={`${model.league.league}/${model.league.place}`}>
                      <LeagueGem league={model.league.league} size={20} />
                      {leaguePlace(model.league.place, language)}
                    </Piece>
                  </PieceLink>
                )}
              </span>
            )}
          </span>
        )}
        {model.rank === null ? null : (
          <PieceLink concept="glory" label={names.rank} className={large ? 'max-w-full' : 'min-w-16 flex-1'}>
            <span
              aria-hidden="true"
              data-player-banner-rank={`${model.rank.rank}/${model.rank.division ?? 0}/${model.rank.mythic?.edition ?? 0}`}
              className="flex min-w-0 flex-1 items-center gap-1.5"
            >
              <RankBlason rank={model.rank.rank} division={model.rank.division} mythic={model.rank.mythic} size={24} />
              <RankGauge rank={model.rank} roll={motion.roll} />
            </span>
          </PieceLink>
        )}
        {!large || model.trophies === null ? null : (
          <PieceLink concept="showcase" label={names.trophies}>
            <Piece name="trophies" value={model.trophies}>
              <Trophy kind="league" size={22} />
              {formatCount(model.trophies, language)}
            </Piece>
          </PieceLink>
        )}
        {!large || model.season === null ? null : (
          <PieceLink concept="season" label={names.season}>
            <Piece name="season" value={model.season.stars}>
              <Trophy kind="season" size={22} />
              {formatCount(model.season.stars, language)}
            </Piece>
          </PieceLink>
        )}
      </div>
    </div>
  );
}

/** Le catalogue du jeu dans la langue de l'interface — attendu avec le chunk par le bandeau du haut. */
export const loadPlayerBannerCatalog = () => loadGameScreenCatalog(currentInterfaceLanguage(), 'banner');

/**
 * L'HÔTE, monté par le bandeau du haut quand la bannière y a sa place. Cache
 * d'abord : la progression se lit sous la MÊME clé que Progression et le profil
 * (`ENGAGEMENT_PROGRESS_QUERY_KEY`, persistée) — un cache non vide se peint
 * tout de suite, jamais un squelette ; un cache vide ne peint RIEN jusqu'à la
 * réponse. « Jeu masqué » : aucune bannière, aucune requête.
 */
export default function PlayerBannerHost() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'banner');
  const prefs = useGamePrefs();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated') || apiDeps.source === 'fixtures';
  useGameSettings(signedIn);
  const query = useQuery(
    {
      queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY,
      enabled: signedIn && !prefs.hidden,
      queryFn: async ({ signal }) => unwrap(await loadEngagementProgress({ ...apiDeps, signal })),
    },
    appQueryClient,
  );
  const profile = useQuery({ ...myProfileQueryOptions(apiDeps), enabled: signedIn && !prefs.hidden }, appQueryClient);
  const game = query.data?.game;
  const model = game === undefined || prefs.hidden || !signedIn ? null : playerBannerModel(game);
  const visible = model !== null;
  /** Par OUVERTURE, pas par montage : une réouverture qui trouve la bannière encore là relance ses 30 s (#9536). */
  const visit = useStore(playerBannerVisitStore, (state) => state.visit);
  useEffect(() => {
    if (visible) reportPlayerBannerShown();
  }, [visible, visit]);
  if (model === null) return null;
  const banner = profile.data?.banner ?? null;
  return <PlayerBanner model={model} backdrop={banner === null || banner === '' ? null : attachmentSrc(banner)} />;
}

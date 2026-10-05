import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress } from '@/lib/api/engagement';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { useGamePrefs } from '@/lib/game/preferences';
import { tierTint } from '@/lib/game/tier-emblem';
import { loadGameCatalog, suspendForGameCatalog, translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { formatCount } from '@/lib/view/game-copy';
import { leaguePlace, playerBannerLabel, playerBannerModel, type PlayerBannerModel } from '@/lib/view/player-banner';
import { Link } from '@/routes/route-table';

import { Flame } from './game/flame';
import { LeagueGem } from './game/league-gem';
import { LevelRing } from './game/level-ring';
import { MeeshCoin } from './game/meesh-coin';
import { RankBlason } from './game/rank-blason';
import { Signature } from './game/signature';

import '@/styles/player-banner.css';

/**
 * LA BANNIÈRE DU JOUEUR (#9494, conception XIII.1) — le bandeau du haut,
 * quand aucun appel ni aucun audio ne l'occupe (`lib/view/top-band.ts`).
 * Ordre FIXE, de gauche à droite, et SEULEMENT ce qui existe
 * (`playerBannerModel`) : l'anneau de niveau (#9481), la jauge vers le niveau
 * suivant avec les points et ce qu'il manque, les Meeshes gardées, le blason
 * du rang, la gemme de ligue et la place, la Flamme.
 *
 * Décor : la Signature en filigrane, teintée par la couleur du palier ; une
 * carte posée au sommet, jamais une bulle.
 *
 * UN seul élément lu par le lecteur d'écran : le lien vers Progression, nommé
 * d'une phrase complète (`playerBannerLabel`) ; ses enfants sont des dessins
 * et des chiffres cachés (`aria-hidden`), puisque la phrase dit tout. Cible de
 * 56 px de haut.
 */
const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const CARD = 'var(--color-ios-card)';

function Gauge({ model, tint }: { readonly model: PlayerBannerModel; readonly tint: string }) {
  const language = currentInterfaceLanguage();
  const fill = Math.min(1, Math.max(0, Number.isFinite(model.progress) ? model.progress : 0));
  return (
    <span aria-hidden="true" data-player-banner-gauge={model.nextLevel ?? 'top'} className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex min-w-0 items-baseline justify-between gap-2 leading-tight">
        <span className="truncate text-check font-bold tabular-nums" style={{ color: INK }}>
          {translateGame(language, 'game.banner.points', { points: formatCount(model.score, language) })}
        </span>
        {model.pointsToNext === null ? null : (
          <span data-player-banner-missing={model.pointsToNext} className="truncate text-caption tabular-nums" style={{ color: INK_2 }}>
            {translateGame(language, 'game.banner.missing', { points: formatCount(model.pointsToNext, language) })}
          </span>
        )}
      </span>
      <span className="relative block h-1.5 w-full overflow-hidden rounded-chip" style={{ backgroundColor: `color-mix(in srgb, ${INK} 12%, transparent)` }}>
        <span className="player-banner-fill absolute inset-0 rounded-chip" style={{ transform: `scaleX(${fill.toFixed(3)})`, backgroundColor: tint }} />
      </span>
    </span>
  );
}

function Piece({ name, value, children }: { readonly name: string; readonly value: string | number; readonly children: React.ReactNode }) {
  return (
    <span aria-hidden="true" {...{ [`data-player-banner-${name}`]: value }} className="flex shrink-0 items-center gap-1 text-check font-bold tabular-nums" style={{ color: INK }}>
      {children}
    </span>
  );
}

export function PlayerBanner({ model }: { readonly model: PlayerBannerModel }) {
  const language = currentInterfaceLanguage();
  const tint = tierTint(model.tier);
  return (
    <div className="pointer-events-none flex w-full justify-center">
      <Link
        to="progression"
        data-player-banner=""
        aria-label={playerBannerLabel(model, language)}
        className="player-banner pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-card py-1 pe-3 ps-1 shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          minHeight: 56,
          maxWidth: 560,
          color: INK,
          background: `linear-gradient(100deg, color-mix(in srgb, ${tint} 16%, ${CARD}), ${CARD} 70%)`,
          border: `1px solid color-mix(in srgb, ${tint} 28%, transparent)`,
        }}
      >
        <span aria-hidden="true" data-player-banner-watermark="" className="pointer-events-none absolute -end-4 -top-6 opacity-[0.12]" style={{ color: tint }}>
          <Signature size={120} color="currentColor" />
        </span>
        <span aria-hidden="true" data-player-banner-ring={model.level} className="relative shrink-0">
          <LevelRing level={model.level} tier={model.tier} progress={model.progress} size={48} prestige={model.prestige} />
        </span>
        <Gauge model={model} tint={tint} />
        {model.meeshes === null ? null : (
          <Piece name="meeshes" value={model.meeshes}>
            <MeeshCoin side="obverse" size={22} />
            {formatCount(model.meeshes, language)}
          </Piece>
        )}
        {model.rank === null ? null : (
          <Piece name="rank" value={`${model.rank.rank}/${model.rank.division ?? 0}`}>
            <RankBlason rank={model.rank.rank} division={model.rank.division} size={30} />
          </Piece>
        )}
        {model.league === null ? null : (
          <Piece name="league" value={`${model.league.league}/${model.league.place}`}>
            <LeagueGem league={model.league.league} size={22} />
            {leaguePlace(model.league.place, language)}
          </Piece>
        )}
        {model.flame === null ? null : (
          <Piece name="flame" value={model.flame.days}>
            <Flame form={model.flame.form} size={22} />
            {formatCount(model.flame.days, language)}
          </Piece>
        )}
      </Link>
    </div>
  );
}

/** Le catalogue du jeu dans la langue de l'interface — attendu avec le chunk par le bandeau du haut. */
export const loadPlayerBannerCatalog = () => loadGameCatalog(currentInterfaceLanguage());

/**
 * L'HÔTE, monté par le bandeau du haut quand la bannière y a sa place. Cache
 * d'abord : la progression se lit sous la MÊME clé que Progression et le profil
 * (`ENGAGEMENT_PROGRESS_QUERY_KEY`, persistée) — un cache non vide se peint
 * tout de suite, jamais un squelette ; un cache vide ne peint RIEN jusqu'à la
 * réponse. « Jeu masqué » : aucune bannière, aucune requête.
 */
export default function PlayerBannerHost() {
  suspendForGameCatalog(currentInterfaceLanguage());
  const prefs = useGamePrefs();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated') || apiDeps.source === 'fixtures';
  const query = useQuery(
    {
      queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY,
      enabled: signedIn && !prefs.hidden,
      queryFn: async ({ signal }) => unwrap(await loadEngagementProgress({ ...apiDeps, signal })),
    },
    appQueryClient,
  );
  const game = query.data?.game;
  if (prefs.hidden || !signedIn || game === undefined) return null;
  return <PlayerBanner model={playerBannerModel(game)} />;
}

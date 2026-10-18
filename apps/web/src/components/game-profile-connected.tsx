import { useQuery } from '@tanstack/react-query';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress } from '@/lib/api/engagement';
import { loadUserGame, loadUserShowcase, userGameQueryKey, userShowcaseQueryKey } from '@/lib/api/game-v2-queries';
import { appQueryClient } from '@/lib/api/query-client';
import { useGamePrefs } from '@/lib/game/preferences';
import { useGameSettings } from '@/lib/game/use-game-settings';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { levelMaxReading, shownLevelOf, shownStanding, sparksReading } from '@/lib/game/ladder';
import { shownRank } from '@/lib/view/game-copy';

import { GameProfileBanner, type BannerStanding } from './game-profile-banner';
import { ContactGameStrip } from './game-contact-strip';

/**
 * LE JEU DES PROFILS, BRANCHÉ (#9481) — le morceau CHARGÉ À LA DEMANDE : les
 * écrans qui l'accueillent (profil, fiche d'un membre, carte de contact) ne
 * chargent que le catalogue d'interface ; ce module tire le catalogue du jeu
 * (`suspendForGameCatalog`, rattrapé par la limite Suspense de `game-profile-slots`)
 * et le cache de la progression, sans jamais retarder la première peinture de
 * l'écran qui l'héberge.
 *
 * Cache-first : la progression se lit sous la MÊME clé que le hub, la vitrine
 * et le jeu d'un autre sous une clé par membre. Rien n'est dessiné tant qu'il n'y a pas de
 * donnée — jamais un spinner : le profil est déjà là.
 */
function useShowcase(userId: string, enabled: boolean) {
  return useQuery(
    {
      queryKey: userShowcaseQueryKey(userId),
      enabled,
      retry: false,
      queryFn: async ({ signal }) => unwrap(await loadUserShowcase({ ...apiDeps, userId, signal })),
    },
    appQueryClient,
  );
}

/**
 * Le jeu d'un autre (#9481) : niveau, rang, trésor, Flamme, selon SES réglages. Une clé par membre ; un
 * refus est une valeur (`visible: false`), jamais une erreur — et une vraie erreur (réseau, ancien
 * serveur sans la route) ne dessine rien : le profil reste celui d'avant.
 */
function useUserGame(userId: string, enabled: boolean, refetchOnMount: boolean | 'always' = true) {
  return useQuery(
    {
      queryKey: userGameQueryKey(userId),
      enabled,
      retry: false,
      refetchOnMount,
      queryFn: async ({ signal }) => unwrap(await loadUserGame({ ...apiDeps, userId, signal })),
    },
    appQueryClient,
  );
}

export function ContactGameStripConnected({ userId, enabled }: { readonly userId: string; readonly enabled: boolean }) {
  suspendForGameCatalog(currentInterfaceLanguage(), 'profile');
  const showcase = useShowcase(userId, enabled);
  const game = useUserGame(userId, enabled);
  return <ContactGameStrip showcase={showcase.data} game={game.data} />;
}

/**
 * LE JEU SUR LA BANNIÈRE (#10092, #10231) — le niveau et ses points, le rang. Cache
 * d'abord (mêmes clés que le hub et que le jeu d'un autre), puis relu À CHAQUE
 * ouverture de la fiche : le niveau bouge sous ses propres gestes.
 *
 * Sur SA fiche : sa progression, ses points et ce qu'il lui reste — les
 * nombres de la barre du joueur —, quels que soient ses réglages (ils disent
 * ce que les AUTRES voient), sauf « Jeu masqué ». Sur celle d'un autre : ce que
 * `GET /users/:userId/game` sert — jamais sa progression, ses points aux amis
 * seulement ; le serveur applique SON réglage « rang » ;
 * fermé, rien ne se dessine (jamais un « fermé » qui apprendrait qu'un jeu existe).
 */
export function GameBannerOwnConnected({ enabled }: { readonly enabled: boolean }) {
  suspendForGameCatalog(currentInterfaceLanguage(), 'profile');
  const prefs = useGamePrefs();
  useGameSettings(enabled);
  const query = useQuery(
    {
      queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY,
      enabled: enabled && !prefs.hidden,
      refetchOnMount: 'always',
      queryFn: async ({ signal }) => unwrap(await loadEngagementProgress({ ...apiDeps, signal })),
    },
    appQueryClient,
  );
  const game = query.data?.game;
  if (prefs.hidden || game === undefined) return null;
  const level = shownLevelOf(game.level);
  const atTop = level.nextThreshold === null;
  // La POCHE d'étincelles (pas la base du niveau) en grand ; la Gloire totale dessous ; le niveau max à vie sous le niveau.
  const sparks = sparksReading(game.level);
  const standing: BannerStanding = {
    level: level.level,
    tier: level.tier,
    prestige: level.prestige,
    progress: atTop ? 1 : level.progress,
    points: sparks.pocket > 0 ? sparks.pocket : null,
    glory: game.glory.glory > 0 ? game.glory.glory : null,
    levelMax: levelMaxReading(game.level),
    pointsToNext: atTop ? null : level.pointsToNext,
    ...shownRank(game.glory),
  };
  return <GameProfileBanner standing={standing} />;
}

export function GameBannerVisitorConnected({ userId, enabled }: { readonly userId: string; readonly enabled: boolean }) {
  suspendForGameCatalog(currentInterfaceLanguage(), 'profile');
  const game = useUserGame(userId, enabled, 'always');
  const served = game.data?.visible === true ? shownStanding(game.data.standing) : null;
  if (served === null) return null;
  const servedPocket = served.sparks ?? served.points;
  const standing: BannerStanding = {
    level: served.level,
    tier: served.tier,
    prestige: served.prestige,
    progress: null,
    // Servis aux amis seulement (la Gloire comme les points) ; le niveau max suit le réglage du RANG, comme le niveau.
    points: servedPocket === undefined || servedPocket === 0 ? null : servedPocket,
    glory: served.glory === undefined || served.glory === 0 ? null : served.glory,
    levelMax: served.ladder?.levelMaxLifetime ?? served.levelMaxLifetime ?? null,
    pointsToNext: null,
    ...shownRank(served),
  };
  return <GameProfileBanner standing={standing} />;
}

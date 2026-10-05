import { useQuery } from '@tanstack/react-query';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress } from '@/lib/api/engagement';
import { loadUserShowcase, userShowcaseQueryKey } from '@/lib/api/game-v2-queries';
import { appQueryClient } from '@/lib/api/query-client';
import { useGamePrefs } from '@/lib/game/preferences';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { ContactGameStrip, GameProfileVisitor } from './game-profile-visitor';
import { GameProfileOwn } from './game-profile-own';

/**
 * LE JEU DES PROFILS, BRANCHÉ (#9481) — le morceau CHARGÉ À LA DEMANDE : les
 * écrans qui l'accueillent (profil, fiche d'un membre, carte de contact) ne
 * chargent que le catalogue d'interface ; ce module tire le catalogue du jeu
 * (`suspendForGameCatalog`, rattrapé par la limite Suspense de `game-profile-slots`)
 * et le cache de la progression, sans jamais retarder la première peinture de
 * l'écran qui l'héberge.
 *
 * Cache-first : la progression se lit sous la MÊME clé que le hub, la vitrine
 * d'un autre sous une clé par membre. Rien n'est dessiné tant qu'il n'y a pas de
 * donnée — jamais un spinner : le profil est déjà là.
 */
export function GameProfileOwnConnected({ enabled }: { readonly enabled: boolean }) {
  suspendForGameCatalog(currentInterfaceLanguage());
  const prefs = useGamePrefs();
  const query = useQuery(
    {
      queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY,
      enabled: enabled && !prefs.hidden,
      queryFn: async ({ signal }) => unwrap(await loadEngagementProgress({ ...apiDeps, signal })),
    },
    appQueryClient,
  );
  if (prefs.hidden || query.data === undefined) return null;
  return <GameProfileOwn progress={query.data} />;
}

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

export function GameProfileVisitorConnected({ userId, name, enabled }: { readonly userId: string; readonly name: string; readonly enabled: boolean }) {
  suspendForGameCatalog(currentInterfaceLanguage());
  const showcase = useShowcase(userId, enabled);
  return <GameProfileVisitor showcase={showcase.data} name={name} />;
}

export function ContactGameStripConnected({ userId, enabled }: { readonly userId: string; readonly enabled: boolean }) {
  suspendForGameCatalog(currentInterfaceLanguage());
  const showcase = useShowcase(userId, enabled);
  return <ContactGameStrip showcase={showcase.data} />;
}

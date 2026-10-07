import { useQuery } from '@tanstack/react-query';

import { GameDetailHost } from '@/components/game-detail-sheet';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress } from '@/lib/api/engagement';
import { useGameSettings } from '@/lib/game/use-game-settings';
import { useOnline } from '@/lib/net/online';
import { ProgressionError, ProgressionSkeleton } from '@/routes/progression-parts';
import { OfflineNotice, ProgressionShell } from '@/routes/progression-shell';

import type { EngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';


/**
 * LE CADRE D'UNE PAGE DÉDIÉE — Badges, Défis, Succès (#5843), puis toutes les
 * pages de données de Progression. Son en-tête, son défilement et son RETOUR
 * sont ceux de la coquille partagée (`progression-shell.tsx`, #9563), qui lit le
 * parent de la page dans la carte de navigation ; il monte aussi l'hôte de la
 * modale de précisions.
 *
 * Les trois partagent tout sauf leur contenu : le retour en verre à gauche, le
 * titre, et le COMPTE en haut à droite (« 21 / 85 ») que le porteur a demandé.
 * Écrit une fois, sinon les trois dériveraient exactement comme le hub et
 * l'iOS natif ont dérivé.
 *
 * **Cache-first, sans condition.** La progression est déjà dans le cache de
 * TanStack Query sous la MÊME clé que le hub : ouvrir une page dédiée ne
 * refait aucune requête et ne montre aucun squelette. Un écran qui attend le
 * réseau alors que le cache a des données est un BUG, pas une dette
 * (§ Instant App Principles).
 */
export function ProgressionPage({
  titre,
  teinte,
  compte,
  fiche,
  children,
}: {
  /** La fiche que cette page EST (#9563) : la modale de précisions n'y propose pas « Voir la fiche » de ce concept. */
  fiche?: ProgressionConcept;
  titre: string;
  teinte: string;
  /** Ce qui s'affiche en haut à droite — `null` quand la page n'a rien à compter. */
  compte: (progress: EngagementProgress) => string | null;
  children: (progress: EngagementProgress) => React.ReactNode;
}) {
  const online = useOnline();
  useGameSettings(true);
  const query = useQuery({
    queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY,
    queryFn: async ({ signal }) =>
      unwrap(await loadEngagementProgress({ ...apiDeps, signal })),
  });

  const total = query.data === undefined ? null : compte(query.data);

  return (
    <ProgressionShell
      title={titre}
      trailing={
        total === null ? null : (
          <span className="shrink-0 text-body font-bold" style={{ color: teinte }}>
            {total}
          </span>
        )
      }
      notice={online ? null : <OfflineNotice>Hors ligne — tel qu’à la dernière ouverture</OfflineNotice>}
    >
      {query.data !== undefined ? (
        <>
          <div className="flex flex-col gap-5 px-4 py-3">{children(query.data)}</div>
          <GameDetailHost progress={query.data} fiche={fiche} />
        </>
      ) : query.isError ? (
        <ProgressionError message={query.error.message} online={online} onRetry={() => void query.refetch()} />
      ) : (
        <ProgressionSkeleton />
      )}
    </ProgressionShell>
  );
}

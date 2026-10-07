import { useQuery } from '@tanstack/react-query';

import { GameDetailHost } from '@/components/game-detail-sheet';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress } from '@/lib/api/engagement';
import { useGameSettings } from '@/lib/game/use-game-settings';
import { useOnline } from '@/lib/net/online';
import { ProgressionError, ProgressionSkeleton } from '@/routes/progression-parts';
import { OfflineNotice, ProgressionShell, type ShellBack } from '@/routes/progression-shell';

import type { EngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';


/**
 * LE CADRE D'UNE PAGE DÉDIÉE — Badges, Défis, Succès (#5843), puis toutes les
 * pages de données de Progression. Son en-tête et son défilement sont ceux de la
 * coquille partagée (`progression-shell.tsx`, #9563) ; il monte aussi l'hôte de
 * la modale de précisions.
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
  concept,
  fiche,
  children,
}: {
  /** La fiche que cette page EST (#9563) : la modale de précisions n'y propose pas « Voir la fiche » de ce concept. */
  fiche?: ProgressionConcept;
  /**
   * Le concept dont cette page est la SOUS-PAGE (#9563) : « retour » ramène alors
   * à sa fiche — le sous-menu d'où l'on vient — et non à la première page.
   * Absent : la page est une fiche ou le tableau de bord, « retour » ramène à
   * Progression.
   */
  concept?: ProgressionConcept;
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
  const back: ShellBack =
    concept === undefined ? { to: 'progression', label: 'Retour à la progression' } : { to: 'progressionConcept', concept, label: 'Retour à la progression' };

  return (
    <ProgressionShell
      title={titre}
      back={back}
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

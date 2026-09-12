import { useQuery } from '@tanstack/react-query';

import { Glyph } from '@/components/glyph';
import { GlassBack } from '@/components/glass-surface';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress } from '@/lib/api/engagement';
import { useOnline } from '@/lib/net/online';
import { Link } from '@/routes/route-table';
import { BRAND, INK, INK_2, ProgressionError, ProgressionSkeleton } from '@/routes/progression-parts';

import type { EngagementProgress } from '@meeshy/shared/utils/engagement-progress';

/**
 * LE CADRE D'UNE PAGE DÉDIÉE — Badges, Défis, Succès (#5843).
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
  children,
}: {
  titre: string;
  teinte: string;
  /** Ce qui s'affiche en haut à droite — `null` quand la page n'a rien à compter. */
  compte: (progress: EngagementProgress) => string | null;
  children: (progress: EngagementProgress) => React.ReactNode;
}) {
  const online = useOnline();
  const query = useQuery({
    queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY,
    queryFn: async ({ signal }) =>
      unwrap(await loadEngagementProgress({ ...apiDeps, signal })),
  });

  const total = query.data === undefined ? null : compte(query.data);

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header
        className="z-10 shrink-0 backdrop-blur-xl"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-surface) 80%, transparent)' }}
      >
        <div className="flex items-center gap-2 px-4 py-2">
          <Link
            to="progression"
            className="grid size-11 shrink-0 place-items-center"
            style={{ color: BRAND }}
            aria-label="Retour à la progression"
          >
            <GlassBack label="Retour à la progression">
              <Glyph name="caretLeft" size={22} />
            </GlassBack>
          </Link>
          <h1 className="flex-1 truncate text-title font-bold" style={{ color: INK }}>
            {titre}
          </h1>
          {total === null ? null : (
            <span className="shrink-0 text-body font-bold" style={{ color: teinte }}>
              {total}
            </span>
          )}
        </div>
        {online ? null : (
          <p
            role="status"
            className="flex items-center justify-center gap-1.5 px-4 py-1 text-check font-semibold"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-warn) 22%, transparent)', color: INK_2 }}
          >
            <Glyph name="warningCircle" size={11} />
            Hors ligne — tel qu’à la dernière ouverture
          </p>
        )}
      </header>

      <main id="contenu" className="flex-1 overflow-y-auto pb-safe">
        {query.data !== undefined ? (
          <div className="flex flex-col gap-5 px-4 py-3">{children(query.data)}</div>
        ) : query.isError ? (
          <ProgressionError message={query.error.message} online={online} onRetry={() => void query.refetch()} />
        ) : (
          <ProgressionSkeleton />
        )}
      </main>
    </div>
  );
}

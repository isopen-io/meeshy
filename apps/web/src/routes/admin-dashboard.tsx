import { useQuery } from '@tanstack/react-query';

import { ADMIN_DASHBOARD_QUERY_KEY, loadAdminDashboard } from '@/lib/api/admin-dashboard';
import type { AdminDeps } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { AdminCounter, AdminSkeleton } from '@/routes/admin-parts';

/**
 * **LE PANNEAU DU TABLEAU DE BORD** (#8876) — monté par le hub (`admin.tsx`).
 *
 * La fondation y range les six compteurs d'hier ; le lot « tableau de bord »
 * le remplacera par la vue de dieu (spécification § 4) EN GARDANT ce nom et
 * cette signature : `deps` est injectable pour les témoins, sans quoi le
 * panneau ne se montrerait qu'à travers un transport réel.
 *
 * La requête ne part que monté sous le hub — lui-même ne rend le panneau
 * qu'après la garde — donc jamais pour un visiteur que la garde a refusé.
 */
export function AdminDashboardPanel({ language, deps = apiDeps }: { readonly language: InterfaceLanguage; readonly deps?: AdminDeps }) {
  const tableau = useQuery({
    queryKey: ADMIN_DASHBOARD_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminDashboard({ ...deps, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return (
    <section aria-labelledby="admin-counters" className="grid gap-3">
      <h2 id="admin-counters" className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translateAdmin(language, 'admin.counters.title')}
      </h2>
      {tableau.data === undefined ? (
        tableau.isPending ? (
          <AdminSkeleton rows={3} />
        ) : (
          <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translateAdmin(language, 'admin.counters.unavailable')}
          </p>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <AdminCounter label={translateAdmin(language, 'admin.counters.users')} value={formatCount(tableau.data.totalUsers, language)} />
          <AdminCounter label={translateAdmin(language, 'admin.counters.activeUsers')} value={formatCount(tableau.data.activeUsers, language)} />
          <AdminCounter label={translateAdmin(language, 'admin.counters.messages')} value={formatCount(tableau.data.totalMessages, language)} />
          <AdminCounter label={translateAdmin(language, 'admin.counters.communities')} value={formatCount(tableau.data.totalCommunities, language)} />
          <AdminCounter label={translateAdmin(language, 'admin.counters.reports')} value={formatCount(tableau.data.totalReports, language)} />
          <AdminCounter label={translateAdmin(language, 'admin.counters.newUsers')} value={formatCount(tableau.data.newUsers24h, language)} />
        </div>
      )}
    </section>
  );
}

import { useQuery } from '@tanstack/react-query';

import { ADMIN_DASHBOARD_QUERY_KEY, adminIdentityQueryOptions, loadAdminDashboard } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { adminSectionTarget, visibleAdminSections } from '@/lib/admin/sections';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import {
  AdminCounter,
  AdminDenied,
  AdminScreenFrame,
  AdminSkeleton,
  LEGACY_ADMIN_ORIGIN,
} from '@/routes/admin-parts';
import { Link } from '@/routes/route-table';

/**
 * **L'ESPACE D'ADMINISTRATION** (#6432) — directive porteur 2026-09-14 :
 * « c'est ici qu'on livre un accès à la page d'administration à la v2 ».
 *
 * ## Fail-closed, et sans oracle
 *
 * La décision d'entrer ne vient PAS de la session — `SessionUser` ne projette
 * pas `role` — mais du serveur : `GET /me/permissions`. Tant que la réponse
 * n'est pas là, `visibleAdminSections(null)` rend une liste vide ; une réponse
 * refusée mène au même endroit que « pas le droit », sans dire lequel des deux
 * (`AdminDenied`).
 *
 * Un écran d'ATTENTE est rendu pendant la requête, jamais le refus : montrer
 * « accès refusé » puis le contenu ferait clignoter une accusation à chaque
 * ouverture.
 *
 * ## Ce que la v2 SERT, et ce qu'elle emprunte
 *
 * Deux sections sont natives — ce tableau de bord et la liste des comptes. Les
 * neuf autres ouvrent le legacy, et leur tuile le DIT (`↗`). C'est le seul
 * état honnête : un hub qui n'afficherait que ses deux vues ferait croire que
 * l'administration a rétréci, et neuf tuiles menant à un écran d'attente
 * seraient neuf contrôles qui mentent (loi 4).
 */

const nombre = (valeur: number, langue: string): string => new Intl.NumberFormat(langue).format(valeur);

export default function AdminScreen() {
  const language = currentInterfaceLanguage();

  // La lecture PARTAGÉE avec la rangée des Réglages et le barreau du menu
  // flottant (#6458) : même clé, même fraîcheur, un refus lu comme l'absence
  // du droit.
  const identite = useQuery(adminIdentityQueryOptions(apiDeps));

  const permissions = identite.data?.permissions ?? null;
  const sections = visibleAdminSections(permissions);
  const autorise = sections.length > 0;

  const tableau = useQuery({
    queryKey: ADMIN_DASHBOARD_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminDashboard({ ...apiDeps, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    // La requête ne PART pas tant que le droit n'est pas établi : la lancer en
    // parallèle ferait frapper `/admin/dashboard` par tout visiteur qui tape
    // l'adresse, et remplirait les journaux d'audit de refus.
    enabled: autorise,
    staleTime: 60 * 1000,
    retry: false,
  });

  const titre = translate(language, 'admin.title');

  if (identite.isPending) {
    return (
      <AdminScreenFrame language={language} title={titre} back="list">
        <AdminSkeleton rows={4} />
      </AdminScreenFrame>
    );
  }

  if (!autorise) {
    return (
      <AdminScreenFrame language={language} title={titre} back="list">
        <AdminDenied language={language} />
      </AdminScreenFrame>
    );
  }

  return (
    <AdminScreenFrame language={language} title={titre} back="list">
      <p className="pb-3 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'admin.role', { role: identite.data?.role ?? '' })}
      </p>

      <section aria-labelledby="admin-counters" className="grid gap-3">
        <h2 id="admin-counters" className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {translate(language, 'admin.counters.title')}
        </h2>
        {tableau.isPending ? (
          <AdminSkeleton rows={3} />
        ) : tableau.data === undefined ? (
          <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translate(language, 'admin.counters.unavailable')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <AdminCounter label={translate(language, 'admin.counters.users')} value={nombre(tableau.data.totalUsers, language)} />
            <AdminCounter label={translate(language, 'admin.counters.activeUsers')} value={nombre(tableau.data.activeUsers, language)} />
            <AdminCounter label={translate(language, 'admin.counters.messages')} value={nombre(tableau.data.totalMessages, language)} />
            <AdminCounter label={translate(language, 'admin.counters.communities')} value={nombre(tableau.data.totalCommunities, language)} />
            <AdminCounter label={translate(language, 'admin.counters.reports')} value={nombre(tableau.data.totalReports, language)} />
            <AdminCounter label={translate(language, 'admin.counters.newUsers')} value={nombre(tableau.data.newUsers24h, language)} />
          </div>
        )}
      </section>

      <section aria-labelledby="admin-sections" className="grid gap-3 pt-6">
        <h2 id="admin-sections" className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {translate(language, 'admin.sections.title')}
        </h2>
        <ul className="grid gap-2">
          {sections
            .filter((section) => section.id !== 'dashboard')
            .map((section) => {
              const cible = adminSectionTarget(section, LEGACY_ADMIN_ORIGIN);
              const libelle = translate(language, section.labelKey);
              const contenu = (
                <>
                  <span aria-hidden="true" className="text-body">
                    {section.glyph}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body font-medium">{libelle}</span>
                  {cible.external ? (
                    <span className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
                      {translate(language, 'admin.sections.legacy')} ↗
                    </span>
                  ) : null}
                </>
              );
              const classe =
                'flex items-center gap-3 rounded-card px-4 focus-visible:outline-2 focus-visible:outline-offset-2';
              const style = {
                minHeight: 56,
                backgroundColor: 'var(--color-ios-surface)',
                border: '1px solid var(--color-edge)',
                color: 'var(--color-ios-ink)',
                outlineColor: 'var(--color-ios-brand)',
              };

              return (
                <li key={section.id}>
                  {cible.external ? (
                    // `rel="noreferrer"` : le legacy est une AUTRE application,
                    // et `window.opener` lui donnerait prise sur cet onglet.
                    <a href={cible.href} target="_blank" rel="noreferrer" data-admin-section={section.id} className={classe} style={style}>
                      {contenu}
                    </a>
                  ) : (
                    <Link to="adminUsers" data-admin-section={section.id} className={classe} style={style}>
                      {contenu}
                    </Link>
                  )}
                </li>
              );
            })}
        </ul>
      </section>
    </AdminScreenFrame>
  );
}

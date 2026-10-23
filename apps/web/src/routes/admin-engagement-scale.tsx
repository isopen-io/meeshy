import { lazy, Suspense } from 'react';

import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminOfflineNotice, AdminSkeleton } from '@/components/admin/states';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { AdminEngagementScalePanel } from '@/routes/admin-engagement-scale-parts';
import { adminListRoute } from '@/lib/admin/admin-routes';
import { href } from '@/routes/route-table';

/* Le calendrier des saisons (#10232) : un bloc, chargé à la demande, jamais une route neuve (budget du module d'entrée). */
const GameSeasonsBlock = lazy(() => import('@/routes/admin-game-seasons-lazy'));
const PacksRegistryBlock = lazy(() => import('@/routes/admin-packs-registry-block'));

/**
 * **LE BARÈME DE POINTS** (#8906, rangé dans « Plateforme » par #8876, servi en quatre langues — D-162) —
 * `/adm/engagement-scale` et `/admin/engagement-scale`.
 *
 * Il passe par le MÊME cadre que tous les écrans de section : `AdminSectionScreen` (la garde — identité en
 * vol, section non ouverte ⇒ le refus unique qui ne dit pas pourquoi), `AdminPageHeader` (titre, aide, fil
 * « Plateforme › Barème de points »), des blocs `AdminFicheSection`, des tableaux qui se plient en cartes.
 * La garde est LUE ICI (on entre aussi par un lien profond) et le seuil est celui de la passerelle — ADMIN
 * ou BIGBOSS (`adminRankOnly` de la section). Le retour reste dans l'espace où l'on est (`/adm` ne saute
 * pas vers `/admin`).
 *
 * Sous le panneau, le CALENDRIER DES SAISONS du Jeu (#10232) : un bloc affiché à qui porte `canManageGame`.
 */
export default function AdminEngagementScaleScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);

  return (
    <AdminSectionScreen section="engagementScale" language={language} title={translateAdmin(language, 'admin.scale.title')}>
      {(reach) => (
        <div className="grid gap-4" data-admin-screen="engagement-scale">
          <AdminPageHeader
            language={language}
            title={translateAdmin(language, 'admin.scale.title')}
            subtitle={translateAdmin(language, 'admin.scale.subtitle')}
            crumbs={[{ label: translateAdmin(language, 'admin.group.scales') }, { label: translateAdmin(language, 'admin.scale.title') }]}
          />
          <AdminOfflineNotice language={language} />
          <AdminEngagementScalePanel language={language} deps={apiDeps} />
          {reach.can('canManageGame') ? (
            <Suspense fallback={<AdminSkeleton rows={4} />}>
              <GameSeasonsBlock language={language} />
            </Suspense>
          ) : null}
          {reach.can('canManageGame') ? (
            <Suspense fallback={<AdminSkeleton rows={4} />}>
              <PacksRegistryBlock
                language={language}
                auditHref={reach.can('canViewAuditLogs') ? `${href(adminListRoute('audit', reach.space))}?family=packs` : null}
              />
            </Suspense>
          ) : null}
        </div>
      )}
    </AdminSectionScreen>
  );
}

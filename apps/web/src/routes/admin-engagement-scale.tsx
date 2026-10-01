import { adminListRoute } from '@/lib/admin/admin-routes';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import { AdminEngagementScalePanel } from '@/routes/admin-engagement-scale-parts';
import { AdminDenied, AdminScreenFrame, AdminSkeleton } from '@/routes/admin-parts';

/**
 * **LE BARÈME DE POINTS** (#8906, rangé dans « Plateforme » par #8876, servi en quatre langues — D-162) —
 * `/adm/engagement-scale` et `/admin/engagement-scale`.
 *
 * La garde est LUE ICI, pas héritée du hub (motif `admin-agent.tsx`) : on
 * entre aussi par un lien profond. Le seuil est celui de la passerelle —
 * ADMIN ou BIGBOSS (`adminRankOnly` de la section) ; un MODERATOR, qui entre
 * dans l'espace, lit « réservé aux administrateurs » plutôt qu'un 403. Le
 * retour reste dans l'espace où l'on est (`/adm` ne saute pas vers `/admin`).
 */
export default function AdminEngagementScaleScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);
  const reach = useAdminReach();
  const frame = {
    language,
    title: translateAdmin(language, 'admin.scale.title'),
    back: adminListRoute('dashboard', reach.space),
    backLabel: translate(language, 'admin.title'),
  };

  if (reach.status === 'pending') {
    return (
      <AdminScreenFrame {...frame}>
        <AdminSkeleton rows={6} />
      </AdminScreenFrame>
    );
  }

  if (!reach.opens('engagementScale')) {
    return (
      <AdminScreenFrame {...frame}>
        {reach.status === 'ready' ? (
          <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-admin-scale-denied>
            {translateAdmin(language, 'admin.scale.denied')}
          </p>
        ) : (
          <AdminDenied language={language} />
        )}
      </AdminScreenFrame>
    );
  }

  return (
    <AdminScreenFrame {...frame}>
      <AdminEngagementScalePanel language={language} deps={apiDeps} />
    </AdminScreenFrame>
  );
}

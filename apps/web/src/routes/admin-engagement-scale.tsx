import { useQuery } from '@tanstack/react-query';

import { canEnterAdmin, visibleAdminSections } from '@/lib/admin/sections';
import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { AdminEngagementScalePanel } from '@/routes/admin-engagement-scale-parts';
import { AdminDenied, AdminScreenFrame, AdminSkeleton } from '@/routes/admin-parts';

/**
 * **LE BARÈME DE POINTS** (#8906) — `/adm/engagement-scale` et
 * `/admin/engagement-scale`.
 *
 * La garde est LUE ICI, pas héritée du hub (motif `admin-agent.tsx`) : on
 * entre aussi par un lien profond. Le seuil est celui de la passerelle —
 * ADMIN ou BIGBOSS (`adminRankOnly` de la section) ; un MODERATOR, qui entre
 * dans l'espace, lit « réservé aux administrateurs » plutôt qu'un 403.
 */
export default function AdminEngagementScaleScreen() {
  const language = currentInterfaceLanguage();
  const identite = useQuery(adminIdentityQueryOptions(apiDeps));
  const titre = translateAdmin(language, 'admin.scale.title');

  if (identite.isPending) {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        <AdminSkeleton rows={6} />
      </AdminScreenFrame>
    );
  }

  const permissions = identite.data?.permissions ?? null;
  const ouvert = visibleAdminSections(permissions, identite.data?.role).some((section) => section.id === 'engagementScale');

  if (!ouvert) {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        {canEnterAdmin(permissions) ? (
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
    <AdminScreenFrame language={language} title={titre} back="admin">
      <AdminEngagementScalePanel language={language} deps={apiDeps} />
    </AdminScreenFrame>
  );
}

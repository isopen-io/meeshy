import { ADMIN_FICHES, adminListRoute, type AdminSectionId } from '@/lib/admin/admin-routes';
import { ADMIN_SECTIONS, visibleAdminSections } from '@/lib/admin/sections';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOptionalRoute } from '@/lib/router';
import { AdminDenied, AdminScreenFrame, AdminSkeleton } from '@/routes/admin-parts';

import { AdminPageHeader } from './page-header';
import { AdminEmptyState } from './states';

/**
 * **L'ÉCRAN D'ATTENTE D'UNE SECTION PAS ENCORE PORTÉE** (#8876) — joignable par
 * son ADRESSE seulement : tant que `ready` est faux (`lib/admin/ready/`), ni le
 * menu, ni le hub, ni un lien d'entité n'y mènent.
 *
 * Il garde quand même sa porte : un lecteur sans la capacité de la section
 * reçoit le refus unique, pas l'annonce — l'existence d'une section ne se
 * révèle pas à qui n'a pas le droit de la lire. Le lot de la section remplace
 * ce fichier ; l'intégration supprime ce composant (spécification § 1.5).
 */
export function AdminStubScreen({ section }: { readonly section: AdminSectionId }) {
  const language = currentInterfaceLanguage();
  const reach = useAdminReach();
  const routeKey = useOptionalRoute()?.key ?? '';
  const isFiche = ADMIN_FICHES.some((fiche) => fiche.section === section && (fiche.admin === routeKey || fiche.adm === routeKey));
  const title = translateAdmin(language, `admin.nav.${section}`);
  const frame = {
    language,
    title,
    heading: 'content' as const,
    back: adminListRoute(isFiche ? section : 'dashboard', reach.space),
    backLabel: isFiche ? title : translate(language, 'admin.title'),
  };

  if (reach.status === 'pending') {
    return (
      <AdminScreenFrame {...frame}>
        <AdminSkeleton rows={3} />
      </AdminScreenFrame>
    );
  }

  const definition = ADMIN_SECTIONS.find((candidate) => candidate.id === section);
  const entitled = definition !== undefined && visibleAdminSections(reach.permissions, reach.role, [{ ...definition, ready: true }]).length > 0;

  if (!entitled) {
    return (
      <AdminScreenFrame {...frame}>
        <AdminDenied language={language} />
      </AdminScreenFrame>
    );
  }

  return (
    <AdminScreenFrame {...frame}>
      <div className="grid gap-6" data-admin-stub={section}>
        <AdminPageHeader language={language} title={title} />
        <AdminEmptyState
          title={translateAdmin(language, 'admin.kit.notReady')}
          hint={translateAdmin(language, 'admin.kit.notReady.hint')}
          glyph="hourglass"
        />
      </div>
    </AdminScreenFrame>
  );
}

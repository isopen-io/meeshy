import type { ReactNode } from 'react';

import { ADMIN_FICHES, adminListRoute, type AdminBack, type AdminSectionId } from '@/lib/admin/admin-routes';
import { useAdminReach, type AdminReach } from '@/lib/admin/use-admin-reach';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import { useOptionalRoute } from '@/lib/router';
import { AdminDenied, AdminScreenFrame, AdminSkeleton } from '@/routes/admin-parts';

/**
 * **LA GARDE DE TOUT ÉCRAN DE SECTION** (#8876) — identité en vol → squelette ;
 * section non ouverte (refusée, ou pas encore prête) → le refus unique, qui ne
 * dit pas pourquoi ; sinon le cadre d'administration et les enfants, à qui la
 * portée du lecteur est remise pour masquer les blocs qu'il ne peut pas lire.
 *
 * Le retour par défaut est celui qu'un lecteur attend : le hub de l'ESPACE
 * COURANT depuis une liste, la liste de la section depuis une fiche — jamais
 * l'autre espace (D-76).
 */
export function AdminSectionScreen({
  section,
  language,
  title,
  back,
  actions,
  fills = false,
  children,
}: {
  readonly section: AdminSectionId;
  readonly language: AdminLanguage;
  readonly title: string;
  readonly back?: AdminBack;
  readonly actions?: ReactNode;
  readonly fills?: boolean;
  readonly children: (reach: AdminReach) => ReactNode;
}) {
  const reach = useAdminReach();
  const routeKey = useOptionalRoute()?.key ?? '';
  const isFiche = ADMIN_FICHES.some((fiche) => fiche.section === section && (fiche.admin === routeKey || fiche.adm === routeKey));

  const target: AdminBack = back ?? adminListRoute(isFiche ? section : 'dashboard', reach.space);
  const backLabel =
    back === 'list'
      ? translateAdmin(language, 'admin.shell.backToApp')
      : back !== undefined
        ? title
        : isFiche
          ? translateAdmin(language, `admin.nav.${section}`)
          : translate(language, 'admin.title');

  const frame = { language, title, back: target, heading: 'content' as const, backLabel, fills };

  if (reach.status === 'pending') {
    return (
      <AdminScreenFrame {...frame}>
        <AdminSkeleton rows={4} />
      </AdminScreenFrame>
    );
  }

  if (!reach.opens(section)) {
    return (
      <AdminScreenFrame {...frame}>
        <AdminDenied language={language} />
      </AdminScreenFrame>
    );
  }

  return (
    <AdminScreenFrame {...frame} {...(actions === undefined ? {} : { actions })}>
      {children(reach)}
    </AdminScreenFrame>
  );
}

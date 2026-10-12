import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminOfflineNotice } from '@/components/admin/states';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LES OPÉRATIONS DU SERVEUR** (#10391, #10396) — `/admin/operations` · `/adm/operations`.
 * La section est rangée sous le domaine « Opérations » ; ses graphes et ses gestes
 * arrivent avec le relais d'opérations de la passerelle.
 */
export function AdminOperationsPanel({ language }: { readonly language: AdminLanguage }) {
  return (
    <div className="grid gap-6" data-admin-operations>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.operations')}
        subtitle={translateAdmin(language, 'admin.nav.operations.hint')}
        crumbs={[{ label: translateAdmin(language, 'admin.group.operations') }, { label: translateAdmin(language, 'admin.nav.operations') }]}
      />
      <AdminOfflineNotice language={language} />
    </div>
  );
}

export default function AdminOperationsScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);

  return (
    <AdminSectionScreen section="operations" language={language} title={translateAdmin(language, 'admin.nav.operations')}>
      {() => <AdminOperationsPanel language={language} />}
    </AdminSectionScreen>
  );
}

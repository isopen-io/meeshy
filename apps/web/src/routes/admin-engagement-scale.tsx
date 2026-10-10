import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminOfflineNotice } from '@/components/admin/states';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { AdminEngagementScalePanel } from '@/routes/admin-engagement-scale-parts';

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
 */
export default function AdminEngagementScaleScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);

  return (
    <AdminSectionScreen section="engagementScale" language={language} title={translateAdmin(language, 'admin.scale.title')}>
      {() => (
        <div className="grid gap-4" data-admin-screen="engagement-scale">
          <AdminPageHeader
            language={language}
            title={translateAdmin(language, 'admin.scale.title')}
            subtitle={translateAdmin(language, 'admin.scale.subtitle')}
            crumbs={[{ label: translateAdmin(language, 'admin.group.platform') }, { label: translateAdmin(language, 'admin.scale.title') }]}
          />
          <AdminOfflineNotice language={language} />
          <AdminEngagementScalePanel language={language} deps={apiDeps} />
        </div>
      )}
    </AdminSectionScreen>
  );
}

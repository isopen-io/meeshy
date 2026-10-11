import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminOfflineNotice } from '@/components/admin/states';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { AdminGameSeasonsPanel } from '@/routes/admin-game-seasons-parts';

/**
 * **JEU — SAISONS** (#10232, #10233) — `/adm/game-seasons` et `/admin/game-seasons`, rangé dans « Plateforme ».
 *
 * Même cadre que les autres écrans de section : `AdminSectionScreen` (la garde — la section n'est ouverte qu'à qui porte
 * `canManageGame`, BIGBOSS et ADMIN ; les autres lisent le refus unique du kit), `AdminPageHeader`, des blocs
 * `AdminFicheSection`. La garde est LUE ICI (on entre aussi par un lien profond).
 */
export default function AdminGameSeasonsScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);

  return (
    <AdminSectionScreen section="gameSeasons" language={language} title={translateAdmin(language, 'admin.gameSeasons.title')}>
      {() => (
        <div className="grid gap-4" data-admin-screen="game-seasons">
          <AdminPageHeader
            language={language}
            title={translateAdmin(language, 'admin.gameSeasons.title')}
            subtitle={translateAdmin(language, 'admin.gameSeasons.subtitle')}
            crumbs={[{ label: translateAdmin(language, 'admin.group.platform') }, { label: translateAdmin(language, 'admin.gameSeasons.title') }]}
          />
          <AdminOfflineNotice language={language} />
          <AdminGameSeasonsPanel language={language} deps={apiDeps} />
        </div>
      )}
    </AdminSectionScreen>
  );
}

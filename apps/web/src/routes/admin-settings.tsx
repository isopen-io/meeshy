import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminOfflineNotice } from '@/components/admin/states';
import type { AdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { AdminAnnouncement } from '@/routes/admin-parts';

import { AccessBlock } from './admin-settings-access';
import { DashboardBlock, SpaceBlock } from './admin-settings-blocks';

/**
 * **LES RÉGLAGES D'ADMINISTRATION** (#8876, #6732) — `/admin/settings`, trois blocs, chacun
 * avec un effet :
 *
 * 1. **Votre accès** — le rôle, les dix capacités servies dites en mots, ce que chacune
 *    ouvre ; pour le créateur, les gestes que son rang ouvre. Rien ne s'y règle : c'est la
 *    réponse à « qu'est-ce que je peux faire ici, et pourquoi pas le reste ? ».
 * 2. **Compteurs du tableau de bord** — « Recalculer maintenant », pour qui porte
 *    `canManageNotifications` (la route l'exige : sinon, le bloc n'est pas dessiné).
 * 3. **Espace d'administration** — « Menu latéral replié par défaut », par navigateur.
 *
 * Aucune « configuration de la plateforme » : aucune ressource ne la sert. Seuil de la
 * section : `canAccessAdmin` — tout administrateur peut lire son propre accès.
 */
type SettingsPanelProps = {
  readonly language: InterfaceLanguage;
  readonly reach: AdminReach;
  readonly deps?: AdminDeps;
};

export function AdminSettingsPanel({ language, reach, deps = apiDeps }: SettingsPanelProps) {
  const online = useOnline();
  const announcer = useLiveAnnouncer();

  return (
    <div className="grid gap-6" data-admin-settings>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.settings')}
        subtitle={translateAdmin(language, 'admin.settings.subtitle')}
        crumbs={[{ label: translateAdmin(language, 'admin.group.platform') }, { label: translateAdmin(language, 'admin.nav.settings') }]}
      />
      <AdminOfflineNotice language={language} />
      <AccessBlock language={language} reach={reach} />
      {reach.can('canManageNotifications') ? <DashboardBlock language={language} deps={deps} online={online} announce={announcer.announce} /> : null}
      <SpaceBlock language={language} announce={announcer.announce} />
      <AdminAnnouncement text={announcer.text} />
    </div>
  );
}

export default function AdminSettingsScreen() {
  const language = currentInterfaceLanguage();

  return (
    <AdminSectionScreen section="settings" language={language} title={translateAdmin(language, 'admin.nav.settings')}>
      {(reach) => <AdminSettingsPanel language={language} reach={reach} />}
    </AdminSectionScreen>
  );
}

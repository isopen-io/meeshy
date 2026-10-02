import { AdminTabs } from '@/components/admin/tabs';
import { ADMIN_USER_TABS, type AdminUserTab } from '@/lib/admin/user-tabs';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

const LIBELLES_ONGLETS = {
  profile: 'admin.tab.profile',
  conversations: 'admin.tab.conversations',
  media: 'admin.tab.media',
  contacts: 'admin.tab.contacts',
  communities: 'admin.tab.communities',
  voice: 'admin.tab.voice',
  preferences: 'admin.tab.preferences',
  security: 'admin.tab.security',
  reports: 'admin.tab.reports',
} as const satisfies Readonly<Record<AdminUserTab, string>>;

/**
 * La base des identifiants onglet/panneau de la fiche : `admin-user-tab-<onglet>` et
 * `admin-user-panel-<onglet>`, que `check-admin-souverain` atteint par identifiant.
 */
export const ADMIN_USER_TABS_BASE = 'admin-user';

/**
 * LES ONGLETS DE LA FICHE (#7845, #7873) — le gabarit COMMUN des onglets de l'administration
 * (`AdminTabs`) : une seule implémentation du clavier (flèches, Début/Fin), de `aria-controls`
 * et du défilement de l'onglet actif dans une liste qui déborde à 375 px. Cette fiche n'a
 * plus de variante : la liste d'onglets des fiches d'un membre, d'une communauté et d'une
 * diffusion se comporte pareil.
 *
 * Les ancres `data-admin-user-tab` et les identifiants `admin-user-tab-*` sont un CONTRAT de
 * la recette `check-admin-souverain` (elle atteint l'onglet des conversations à la souris puis
 * au clavier) : ils ne se renomment pas.
 */
export function AdminUserTabs({
  language,
  actif,
  onChange,
}: {
  readonly language: AdminLanguage;
  readonly actif: AdminUserTab;
  readonly onChange: (onglet: AdminUserTab) => void;
}) {
  return (
    <AdminTabs
      label={translateAdmin(language, 'admin.tab.label')}
      tabs={ADMIN_USER_TABS.map((onglet) => ({ id: onglet, label: translateAdmin(language, LIBELLES_ONGLETS[onglet]) }))}
      active={actif}
      onChange={onChange}
      idBase={ADMIN_USER_TABS_BASE}
      anchor="admin-user-tab"
    />
  );
}

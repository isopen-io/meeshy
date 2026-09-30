import { ADMIN_USER_TABS, type AdminUserTab } from '@/lib/admin/user-tabs';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

const INK2 = 'var(--color-ios-ink-2)';

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
 * LES ONGLETS DE LA FICHE (#7845, #7873) — un `tablist` ARIA : flèches
 * gauche/droite pour passer d'un onglet à l'autre (inversées en arabe), un seul
 * arrêt de tabulation (l'onglet actif), et l'onglet dans l'adresse (`?tab=`).
 *
 * Les ancres `data-admin-user-tab` et les identifiants `admin-user-tab-*` sont un
 * CONTRAT de la recette `check-admin-souverain` (elle atteint l'onglet des
 * conversations à la souris puis au clavier) : ils ne se renomment pas.
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
  const aller = (pas: number) => {
    const index = ADMIN_USER_TABS.indexOf(actif);
    const suivant = ADMIN_USER_TABS[(index + pas + ADMIN_USER_TABS.length) % ADMIN_USER_TABS.length] ?? 'profile';
    onChange(suivant);
    requestAnimationFrame(() => document.getElementById(`admin-user-tab-${suivant}`)?.focus());
  };
  return (
    <div
      role="tablist"
      aria-label={translateAdmin(language, 'admin.tab.label')}
      className="flex gap-1 overflow-x-auto"
      style={{ borderBottom: '1px solid var(--color-edge)' }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') aller(1);
        if (event.key === 'ArrowLeft') aller(-1);
      }}
    >
      {ADMIN_USER_TABS.map((onglet) => {
        const selectionne = onglet === actif;
        return (
          <button
            key={onglet}
            type="button"
            role="tab"
            id={`admin-user-tab-${onglet}`}
            aria-selected={selectionne}
            aria-controls={`admin-user-panel-${onglet}`}
            tabIndex={selectionne ? 0 : -1}
            data-admin-user-tab={onglet}
            onClick={() => onChange(onglet)}
            className="shrink-0 px-3 text-body focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 44,
              color: selectionne ? 'var(--color-ios-brand)' : INK2,
              fontWeight: selectionne ? 600 : 500,
              borderBottom: `2px solid ${selectionne ? 'var(--color-ios-brand)' : 'transparent'}`,
              outlineColor: 'var(--color-ios-brand)',
            }}
          >
            {translateAdmin(language, LIBELLES_ONGLETS[onglet])}
          </button>
        );
      })}
    </div>
  );
}

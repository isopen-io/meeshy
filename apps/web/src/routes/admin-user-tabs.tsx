import { useRef, type KeyboardEvent } from 'react';

import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES ONGLETS DE LA FICHE D'UN MEMBRE** (#7845) — six surfaces, une à la fois.
 *
 * ## Un onglet ne MONTE que sa section
 *
 * Chaque section lit sa propre route (préférences, conversations, sessions…).
 * Les monter toutes à l'ouverture de la fiche coûterait six requêtes pour un
 * administrateur venu vérifier une adresse e-mail — et trois d'entre elles
 * écrivent une ligne d'audit « a consulté des données sensibles ». Le panneau
 * de l'onglet actif est le seul rendu ; revenir sur un onglet se repeint
 * depuis le cache.
 *
 * ## Le motif ARIA des onglets, au complet
 *
 * `tablist` › `tab` (`aria-selected`, `aria-controls`) › `tabpanel`
 * (`aria-labelledby`). Focus ITINÉRANT : seul l'onglet actif est dans l'ordre
 * de tabulation, les flèches passent d'un onglet à l'autre (inversées sous
 * `dir="rtl"`), Début et Fin vont aux bouts — et l'onglet atteint au clavier
 * s'ACTIVE (activation automatique : chaque panneau est bon marché à monter,
 * le cache le sert). Cibles de 44 px ; la barre défile à l'horizontale sur un
 * téléphone plutôt que de faire défiler la page.
 */
export const ADMIN_USER_TABS = ['profile', 'preferences', 'conversations', 'media', 'security', 'activity'] as const;

export type AdminUserTab = (typeof ADMIN_USER_TABS)[number];

const LIBELLES: Readonly<Record<AdminUserTab, AdminPlainCatalogKey>> = {
  profile: 'admin.tab.profile',
  preferences: 'admin.tab.preferences',
  conversations: 'admin.tab.conversations',
  media: 'admin.tab.media',
  security: 'admin.tab.security',
  activity: 'admin.tab.activity',
};

export function isAdminUserTab(value: unknown): value is AdminUserTab {
  return typeof value === 'string' && (ADMIN_USER_TABS as readonly string[]).includes(value);
}

export const adminUserTabId = (tab: AdminUserTab) => `admin-user-tab-${tab}`;
export const adminUserPanelId = (tab: AdminUserTab) => `admin-user-panel-${tab}`;

const BRAND = 'var(--color-ios-brand)';

export function AdminUserTabs({
  active,
  language,
  onSelect,
}: {
  readonly active: AdminUserTab;
  readonly language: InterfaceLanguage;
  readonly onSelect: (tab: AdminUserTab) => void;
}) {
  const liste = useRef<HTMLDivElement>(null);

  const aller = (tab: AdminUserTab) => {
    onSelect(tab);
    const bouton = liste.current?.querySelector<HTMLButtonElement>(`#${adminUserTabId(tab)}`);
    bouton?.focus();
  };

  const surTouche = (event: KeyboardEvent<HTMLDivElement>) => {
    const rang = ADMIN_USER_TABS.indexOf(active);
    const rtl = event.currentTarget.closest('[dir]')?.getAttribute('dir') === 'rtl';
    const dernier = ADMIN_USER_TABS.length - 1;
    const cible =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? dernier
          : event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')
            ? (rang + 1) % ADMIN_USER_TABS.length
            : event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')
              ? (rang + dernier) % ADMIN_USER_TABS.length
              : null;
    if (cible === null) return;
    event.preventDefault();
    const tab = ADMIN_USER_TABS[cible];
    if (tab !== undefined) aller(tab);
  };

  return (
    <div
      ref={liste}
      role="tablist"
      aria-label={translateAdmin(language, 'admin.user.title')}
      onKeyDown={surTouche}
      data-admin-user-tabs
      className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0"
    >
      {ADMIN_USER_TABS.map((tab) => {
        const selectionne = tab === active;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            id={adminUserTabId(tab)}
            aria-selected={selectionne}
            aria-controls={adminUserPanelId(tab)}
            tabIndex={selectionne ? 0 : -1}
            data-admin-user-tab={tab}
            onClick={() => onSelect(tab)}
            className="shrink-0 rounded-chip px-4 text-body font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
            style={{
              minHeight: 44,
              outlineColor: BRAND,
              color: selectionne ? 'white' : 'var(--color-ios-ink)',
              backgroundColor: selectionne ? BRAND : 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)',
            }}
          >
            {translateAdmin(language, LIBELLES[tab])}
          </button>
        );
      })}
    </div>
  );
}

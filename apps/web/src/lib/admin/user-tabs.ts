/**
 * LES ONGLETS DE LA FICHE D'UN MEMBRE (#7845, #7873), dans l'ordre où
 * l'administrateur les parcourt : qui il est, où il parle, ce qu'il a publié,
 * qui il connaît, où il appartient, sa voix, ses préférences, sa sécurité,
 * ses signalements.
 *
 * L'onglet vit dans l'adresse (`?tab=`) : un lien partagé ou un retour depuis
 * une conversation rouvre la fiche sur le bon onglet. Une valeur inconnue
 * retombe sur le profil — jamais sur un panneau vide.
 */
export const ADMIN_USER_TABS = ['profile', 'conversations', 'media', 'contacts', 'communities', 'voice', 'preferences', 'security', 'reports'] as const;

export type AdminUserTab = (typeof ADMIN_USER_TABS)[number];

/**
 * Les onglets OFFERTS à un administrateur (#8003). Les préférences d'un membre
 * ne se lisent que sous `canViewSensitiveData` : qui ne la porte pas ne voit pas
 * l'onglet, plutôt qu'un onglet qui mènerait à un refus. L'ordre des autres ne
 * bouge pas.
 */
export function adminUserTabsFor({ sensitive }: { readonly sensitive: boolean }): readonly AdminUserTab[] {
  return sensitive ? ADMIN_USER_TABS : ADMIN_USER_TABS.filter((onglet) => onglet !== 'preferences');
}

export function adminUserTabOf(search: URLSearchParams, offerts: readonly AdminUserTab[] = ADMIN_USER_TABS): AdminUserTab {
  const demande = search.get('tab');
  return offerts.find((onglet) => onglet === demande) ?? 'profile';
}

export function withAdminUserTab(search: URLSearchParams, tab: AdminUserTab): URLSearchParams {
  const suivant = new URLSearchParams(search);
  if (tab === 'profile') suivant.delete('tab');
  else suivant.set('tab', tab);
  return suivant;
}

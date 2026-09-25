/**
 * LES ONGLETS DE LA FICHE D'UN MEMBRE (#7845, #7873), dans l'ordre où
 * l'administrateur les parcourt : qui il est, où il parle, ce qu'il a publié,
 * qui il connaît, où il appartient, sa voix, sa sécurité, ses signalements.
 *
 * L'onglet vit dans l'adresse (`?tab=`) : un lien partagé ou un retour depuis
 * une conversation rouvre la fiche sur le bon onglet. Une valeur inconnue
 * retombe sur le profil — jamais sur un panneau vide.
 */
export const ADMIN_USER_TABS = ['profile', 'conversations', 'media', 'contacts', 'communities', 'voice', 'security', 'reports'] as const;

export type AdminUserTab = (typeof ADMIN_USER_TABS)[number];

export function adminUserTabOf(search: URLSearchParams): AdminUserTab {
  const demande = search.get('tab');
  return ADMIN_USER_TABS.find((onglet) => onglet === demande) ?? 'profile';
}

export function withAdminUserTab(search: URLSearchParams, tab: AdminUserTab): URLSearchParams {
  const suivant = new URLSearchParams(search);
  if (tab === 'profile') suivant.delete('tab');
  else suivant.set('tab', tab);
  return suivant;
}

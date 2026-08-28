import { useUserPreferencesStore } from '@/stores/user-preferences-store';

/**
 * Ce qu'une annonce de catégorie user-level doit faire au DOUBLE Zustand, en un
 * seul site.
 *
 * Le web tient deux exemplaires des préférences user-level :
 *
 * | exemplaire | qui l'écrit | qui le lit |
 * |---|---|---|
 * | cache React Query `queryKeys.preferences.category(c)` | `usePreferences(c)` — les écrans de réglages | l'écran de réglages MONTÉ, et lui seul |
 * | store Zustand `user-preferences-store` | `initialize()` au montage | les bulles de messagerie (`DeliveryIndicator`, `FocalRow`, `BubbleMessageNormalView`) et l'écran de chiffrement |
 *
 * Les trois routes qui annoncent un changement — la diffusion
 * `user:preferences-updated` (scope catégorie) d'un autre APPAREIL, le
 * `BroadcastChannel` d'un autre ONGLET, et le PATCH de l'onglet COURANT —
 * atterrissaient toutes sur le premier exemplaire, en invalidant une clé qui
 * n'a d'observateur que pendant que l'écran de réglages est ouvert. Le second,
 * celui que la messagerie REND, n'avait qu'une seule source : `initialize()`,
 * appelé une fois au montage. Couper ses accusés de lecture laissait donc les
 * coches en place jusqu'à un rechargement complet de la page.
 *
 * La règle vit ici pour que les trois routes disent la même chose ; elles se
 * contentent de délivrer l'annonce.
 *
 * **Pourquoi seule `privacy` est doublée.** Mesuré : c'est la seule catégorie
 * dont le bloc Zustand a un lecteur hors des réglages. Le bloc `notifications`
 * du store n'a aucun consommateur en production (l'écran
 * `/notifications/preferences` tient son propre état local) ; les cinq autres
 * catégories sont lues à la demande par l'écran qui les affiche. Leur ajouter
 * une relecture ici serait une requête de plus pour zéro fraîcheur de plus.
 *
 * **Pourquoi `privacy` en relit DEUX.** `syncPrivacy` et `syncEncryption` sont
 * deux projections de la MÊME ligne (`GET /me/preferences/privacy`) : une
 * annonce `privacy` périme les deux, donc les deux se relisent.
 */
const MIRRORED_CATEGORIES: Readonly<Record<string, (state: MirroredState) => Promise<unknown>>> = {
  privacy: (state) => Promise.all([state.syncPrivacy(), state.syncEncryption()]),
};

type MirroredState = {
  syncPrivacy: () => Promise<void>;
  syncEncryption: () => Promise<void>;
};

/**
 * Relit le bloc doublé que la catégorie annoncée périme, s'il y en a un.
 *
 * Sans effet — et sans lever — pour une catégorie non doublée ou inconnue du
 * client : la charge vient du fil, et un nom qu'on ne connaît pas ne doit pas
 * faire tomber le gestionnaire qui l'a routée.
 *
 * L'échec de la relecture est absorbé ici comme il l'est dans le store : la
 * dernière valeur connue reste affichée, une panne réseau n'étant pas la preuve
 * que l'utilisateur a changé d'avis.
 */
export function refreshMirroredPreferenceCategory(category: string): void {
  const refresh = MIRRORED_CATEGORIES[category];
  if (!refresh) return;

  void refresh(useUserPreferencesStore.getState()).catch(() => undefined);
}

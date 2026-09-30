import { safeLocalStorage } from '../storage';

import { createAccountVault } from './accounts';
import { apiDeps } from './deps';
import type { ProfileActionDeps } from './profile-actions';
import { appQueryClient } from './query-client';
import { sessionStore } from './session';

/**
 * LES DÉPENDANCES RÉELLES DES GESTES DU PROFIL — un seul assemblage pour le
 * profil et l'accueil (#8886) : deux écrans qui les recomposaient chacun
 * auraient oublié, au premier ajout, la moitié que l'autre portait. Le coffre
 * des comptes est lu sur le MÊME `localStorage` que celui de
 * `device-accounts.ts`, sans en importer la bascule ni la déconnexion.
 */
export const appProfileActionDeps = (): ProfileActionDeps => ({
  ...apiDeps,
  queryClient: appQueryClient,
  session: sessionStore,
  accounts: createAccountVault({ storage: safeLocalStorage(), now: () => Date.now() }),
  isOnline: () => navigator.onLine,
});

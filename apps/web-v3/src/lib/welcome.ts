import { safeLocalStorage, type SafeStorage } from './storage';

/**
 * L'ACCUEIL SE SOLDE UNE FOIS PAR APPAREIL (#5816) — miroir
 * `@AppStorage("hasCompletedOnboarding")` (`MeeshyApp.swift:18, 37-39` ;
 * `WelcomeView.swift:14-16` : « aucun chemin ne laisse l'écran revenir »).
 *
 * `session-guard.ts` lit `isCompleted()` (synchrone, aucun abonnement — la
 * valeur ne change qu'au clic d'une des deux portes, qui navigue aussitôt
 * après) pour décider `redirect-welcome` vs `redirect-login`.
 */

const STORAGE_KEY = 'meeshy.welcome-completed';
const COMPLETED_VALUE = '1';

export type WelcomeStore = {
  isCompleted(): boolean;
  markCompleted(): void;
};

export type WelcomeStoreOptions = {
  readonly storage?: SafeStorage;
};

export function createWelcomeStore(options: WelcomeStoreOptions = {}): WelcomeStore {
  const storage = options.storage ?? safeLocalStorage();

  return {
    isCompleted: () => {
      try {
        return storage.getItem(STORAGE_KEY) === COMPLETED_VALUE;
      } catch {
        return false;
      }
    },
    markCompleted: () => {
      try {
        storage.setItem(STORAGE_KEY, COMPLETED_VALUE);
      } catch {
        /* Stockage refusé : l'accueil revient au prochain démarrage — même
         * doctrine que `session.ts#persist`, jamais une exception. */
      }
    },
  };
}

/** L'UNIQUE instance que l'application partage. */
export const welcomeStore = createWelcomeStore();

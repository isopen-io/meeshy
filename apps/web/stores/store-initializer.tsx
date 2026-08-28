/**
 * Store Initializer - Initializes all Zustand stores on app startup
 */

'use client';

import { useEffect, ReactNode } from 'react';
import { useAppStore } from './app-store';
import { useAuthStore } from './auth-store';
import { useLanguageStore } from './language-store';
import { useUserPreferencesStore } from './user-preferences-store';
import { startMirroredPreferenceRehydration } from '@/lib/preferences/preference-rehydration';

interface StoreInitializerProps {
  children: ReactNode;
}

export function StoreInitializer({ children }: StoreInitializerProps) {
  const initializeApp = useAppStore((state) => state.initialize);
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const detectBrowserLanguage = useLanguageStore((state) => state.detectAndSetBrowserLanguage);
  const initializeUserPreferences = useUserPreferencesStore((state) => state.initialize);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    const initializeStores = async () => {
      try {
        if (process.env.NODE_ENV === 'development') {
        }
        
        // Initialize app and auth in parallel
        await Promise.all([
          initializeApp(),
          initializeAuth(),
        ]);

        // Initialize user preferences after auth (requires authentication)
        await initializeUserPreferences();

        // Initialize language after auth (user preferences might affect language)
        // IMPORTANT: Ne PAS écraser la langue si elle est déjà persistée dans localStorage
        const languageStore = useLanguageStore.getState();
        const hasPersistedLanguage = typeof window !== 'undefined' && localStorage.getItem('meeshy-language');
        
        if (user?.systemLanguage) {
          // Utilisateur connecté : utiliser sa préférence backend
          languageStore.setInterfaceLanguage(user.systemLanguage);
        } else if (!hasPersistedLanguage) {
          // Aucune préférence sauvegardée : détecter la langue du navigateur
          detectBrowserLanguage();
        } else {
          // Préférence déjà sauvegardée dans localStorage : ne rien faire
        }
        
        if (process.env.NODE_ENV === 'development') {
        }
        
      } catch (error) {
        console.error('[STORE_INITIALIZER] Store initialization failed:', error);
        useAppStore.getState().addNotification({
          type: 'error',
          title: 'Initialization Error',
          message: 'Failed to initialize application stores',
        });
      }
    };
    
    initializeStores();
  }, []); // Empty dependency array - run once on mount

  /**
   * Le rattrapage PÉRENNE du double des préférences prend le relais de
   * l'hydratation initiale ci-dessus.
   *
   * Il vit ICI, et pas dans `useSocketCacheSync`, parce que ce dernier n'est
   * monté que sur les écrans de conversation : un changement fait ailleurs
   * pendant qu'aucune conversation n'est ouverte n'atteindrait le double qu'au
   * prochain montage. `StoreInitializer` enveloppe l'application entière.
   *
   * L'abonnement est posé APRÈS le premier rendu comme l'hydratation, et sa
   * clause « la lecture initiale n'a jamais abouti » lit `lastSyncedAt`, que
   * seule une hydratation RÉUSSIE renseigne — un onglet ouvert hors ligne se
   * rattrape donc à sa première connexion, et un démarrage nominal ne paie
   * aucune requête de plus.
   */
  useEffect(() => startMirroredPreferenceRehydration(), []);

  return <>{children}</>;
}

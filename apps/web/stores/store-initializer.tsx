/**
 * Store Initializer - Initializes all Zustand stores on app startup
 */

'use client';

import { useEffect, ReactNode } from 'react';
import { useAppStore } from './app-store';
import { useAuthStore } from './auth-store';
import { useLanguageStore } from './language-store';
import { useUserPreferencesStore } from './user-preferences-store';

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
  
  return <>{children}</>;
}

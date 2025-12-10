/**
 * Hook pour gérer les préférences de police utilisateur
 */

import { useState, useEffect, useCallback } from 'react';
import { authManager } from '@/services/auth-manager.service';
import { FontFamily, defaultFont, getFontConfig } from '@/lib/fonts';
import { buildApiUrl } from '@/lib/config';

const FONT_PREFERENCE_KEY = 'font-family';

export function useFontPreference() {
  const [currentFont, setCurrentFont] = useState<FontFamily>(defaultFont);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Charger la préférence depuis le localStorage et/ou le backend
  useEffect(() => {
    // Ne pas faire d'appels réseau pendant le build SSR
    if (typeof window === 'undefined') {
      return;
    }

    const loadFontPreference = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // 1. Vérifier localStorage en premier (cache local)
        const localFont = localStorage.getItem(FONT_PREFERENCE_KEY) as FontFamily;
        if (localFont && getFontConfig(localFont)) {
          setCurrentFont(localFont);
          applyFontToDocument(localFont);
        }

        // 2. Récupérer depuis le backend si connecté (seulement côté client)
        const token = authManager.getAuthToken();
        if (token && typeof window !== 'undefined') {
          try {
            const response = await fetch(buildApiUrl('/users/preferences'), {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              signal: AbortSignal.timeout(5000), // Timeout de 5 secondes
            });

            if (response.ok) {
              const result = await response.json();
              if (result.success && result.data) {
                const serverFont = result.data.find((pref: any) => pref.key === FONT_PREFERENCE_KEY);
                
                if (serverFont && serverFont.value && getFontConfig(serverFont.value as FontFamily)) {
                  const fontFamily = serverFont.value as FontFamily;
                  setCurrentFont(fontFamily);
                  applyFontToDocument(fontFamily);
                  
                  // Synchroniser avec localStorage
                  localStorage.setItem(FONT_PREFERENCE_KEY, fontFamily);
                }
              }
            }
          } catch (backendError) {
            console.warn('Could not load font preference from backend:', backendError);
            // Continuer avec la police locale ou par défaut
          }
        }

      } catch (err) {
        console.error('Error loading font preference:', err);
        setError('Erreur lors du chargement des préférences de police');
        setCurrentFont(defaultFont);
        applyFontToDocument(defaultFont);
      } finally {
        setIsLoading(false);
      }
    };

    loadFontPreference();
  }, []);

  // Appliquer la police au document
  const applyFontToDocument = useCallback((fontFamily: FontFamily) => {
    // Ne pas appliquer pendant le SSR
    if (typeof window === 'undefined') {
      return;
    }

    const fontConfig = getFontConfig(fontFamily);
    if (!fontConfig) return;

    // Supprimer toutes les classes de police existantes
    const existingFontClasses = document.body.className
      .split(' ')
      .filter(className => className.startsWith('font-'));
    
    existingFontClasses.forEach(className => {
      document.body.classList.remove(className);
    });

    // Ajouter la nouvelle classe de police
    document.body.classList.add(fontConfig.cssClass);
    
    // Mettre à jour la variable CSS custom si nécessaire
    document.documentElement.style.setProperty('--font-primary', `var(${fontConfig.variable})`);
  }, []);

  // Changer la police
  const changeFontFamily = useCallback(async (newFont: FontFamily) => {
    try {
      setError(null);
      
      // Vérifier que la police existe
      const fontConfig = getFontConfig(newFont);
      if (!fontConfig) {
        throw new Error(`Police non trouvée: ${newFont}`);
      }

      // Appliquer immédiatement
      setCurrentFont(newFont);
      applyFontToDocument(newFont);
      
      // Sauvegarder en localStorage (seulement côté client)
      if (typeof window !== 'undefined') {
        localStorage.setItem(FONT_PREFERENCE_KEY, newFont);
      }

      // Sauvegarder sur le backend si connecté (seulement côté client)
      if (typeof window !== 'undefined') {
        const token = authManager.getAuthToken();
        if (token) {
          try {
            const response = await fetch(buildApiUrl('/users/preferences'), {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                key: FONT_PREFERENCE_KEY,
                value: newFont,
              }),
              signal: AbortSignal.timeout(5000), // Timeout de 5 secondes
            });

            if (!response.ok) {
              console.warn('Could not save font preference to backend');
            }
          } catch (backendError) {
            console.warn('Backend save failed:', backendError);
            // L'erreur n'est pas critique car nous avons le localStorage
          }
        }
      }

    } catch (err) {
      console.error('Error changing font:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors du changement de police');
    }
  }, [applyFontToDocument]);

  // Réinitialiser à la police par défaut
  const resetToDefault = useCallback(() => {
    changeFontFamily(defaultFont);
  }, [changeFontFamily]);

  return {
    currentFont,
    changeFontFamily,
    resetToDefault,
    isLoading,
    error,
    fontConfig: getFontConfig(currentFont),
  };
}

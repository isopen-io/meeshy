/**
 * Hook pour gérer les préférences de police utilisateur
 *
 * `fontFamily` vit dans la catégorie `application` de `/me/preferences`
 * (§ `ApplicationPreferenceSchema`, `@meeshy/shared/types/preferences`) — la
 * même route que `usePreferences('application')` lit pour l'écran de
 * réglages. Ce hook-ci n'utilise pas `usePreferences` : il applique la police
 * au `document` en dehors de React Query et doit rester lisible AVANT
 * l'hydratation du reste de l'app (cf. lecture `localStorage` synchrone plus
 * bas), ce que le cache React Query ne garantit pas. Il parle donc à la même
 * route en `fetch` nu, comme il le faisait déjà pour la lecture.
 */

import { useState, useEffect, useCallback } from 'react';
import { authManager } from '@/services/auth-manager.service';
import { FontFamily, getFontConfig } from '@/lib/fonts';
import { buildApiUrl } from '@/lib/config';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';

const FONT_PREFERENCE_KEY = 'font-family';
const DEFAULT_FONT_ID: FontFamily = 'nunito';

export function useFontPreference() {
  const [currentFont, setCurrentFont] = useState<FontFamily>(DEFAULT_FONT_ID);
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
            // La route unique de #4181 : `?categories=application` ne
            // repatrie qu'UNE catégorie (~15 clés), pas les sept (~130).
            const fontPrefsEndpoint = `${API_ENDPOINTS.me.preferences}?categories=application`;
            const response = await fetch(buildApiUrl(fontPrefsEndpoint), {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              signal: AbortSignal.timeout(5000), // Timeout de 5 secondes
            });

            if (response.ok) {
              const result = await response.json();
              // La réponse range chaque catégorie sous son nom :
              // { success, data: { application: { fontFamily, … } } }.
              const serverFontValue = result?.success ? result.data?.application?.fontFamily : undefined;

              if (serverFontValue && getFontConfig(serverFontValue as FontFamily)) {
                const fontFamily = serverFontValue as FontFamily;
                setCurrentFont(fontFamily);
                applyFontToDocument(fontFamily);

                // Synchroniser avec localStorage
                localStorage.setItem(FONT_PREFERENCE_KEY, fontFamily);
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
        setCurrentFont(DEFAULT_FONT_ID);
        applyFontToDocument(DEFAULT_FONT_ID);
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
      
      // Sauvegarder en localStorage (seulement côté client) — c'est ce qui
      // rend le changement INSTANTANÉ, avant tout aller-retour réseau.
      if (typeof window !== 'undefined') {
        localStorage.setItem(FONT_PREFERENCE_KEY, newFont);
      }

      // Synchroniser côté serveur, au mieux, sur la route UNIQUE de #4181.
      //
      // Ce bloc envoyait auparavant un `POST /user-preferences` — une adresse
      // qui n'existe pas côté gateway (#4189) — puis, le temps que #4181
      // fournisse une route d'écriture, plus rien du tout : le choix de
      // police ne quittait jamais le navigateur, sur aucun AUTRE appareil du
      // même compte.
      //
      // Best-effort et NON attendu : un échec réseau ne doit ni bloquer ce
      // changement (déjà appliqué localement, ligne au-dessus) ni le faire
      // reculer — une police est un réglage de confort, pas une donnée dont la
      // perte justifie un rollback UI.
      if (typeof window !== 'undefined') {
        const token = authManager.getAuthToken();
        if (token) {
          fetch(buildApiUrl(API_ENDPOINTS.me.preferences), {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ application: { fontFamily: newFont } }),
            signal: AbortSignal.timeout(5000),
          }).catch((backendError) => {
            console.warn('Could not persist font preference to backend:', backendError);
          });
        }
      }

    } catch (err) {
      console.error('Error changing font:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors du changement de police');
    }
  }, [applyFontToDocument]);

  // Réinitialiser à la police par défaut
  const resetToDefault = useCallback(() => {
    changeFontFamily(DEFAULT_FONT_ID);
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

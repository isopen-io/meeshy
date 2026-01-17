/**
 * Hook I18n pour la traduction de l'interface utilisateur
 * Charge les fichiers JSON de traduction depuis /locales/{lang}/{namespace}.json
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLanguageStore } from '@/stores';

// Cache global pour éviter de recharger les mêmes fichiers
const translationsCache = new Map<string, Record<string, any>>();

// Fonction pour vider le cache (utile lors de changements de structure)
export function clearTranslationsCache() {
  translationsCache.clear();
  if (process.env.NODE_ENV === 'development') {
  }
}

interface UseI18nOptions {
  fallbackLocale?: string;
}

interface UseI18nReturn {
  t: (key: string, paramsOrFallback?: Record<string, any> | string) => string;
  tArray: (key: string) => string[];
  locale: string;
  setLocale: (locale: string) => void;
  isLoading: boolean;
  currentLanguage: string;
}

/**
 * Hook pour gérer les traductions i18n
 * @param namespace - Module de traduction (ex: 'landing', 'auth', 'dashboard')
 * @param options - Options de configuration
 */
export function useI18n(namespace: string = 'common', options: UseI18nOptions = {}): UseI18nReturn {
  const { fallbackLocale = 'en' } = options;
  
  // Utiliser le store de langue Zustand
  const currentInterfaceLanguage = useLanguageStore(state => state.currentInterfaceLanguage);
  const setLanguage = useLanguageStore(state => state.setInterfaceLanguage);
  
  const [translations, setTranslations] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  
  // Charger les traductions pour un namespace et une locale donnés
  const loadTranslations = useCallback(async (locale: string, ns: string) => {
    const cacheKey = `${locale}-${ns}`;
    
    // En développement, ne PAS utiliser le cache pour voir les changements immédiatement
    const useCache = process.env.NODE_ENV !== 'development';
    
    // Vérifier le cache d'abord (seulement en production)
    if (useCache && translationsCache.has(cacheKey)) {
      if (process.env.NODE_ENV === 'development') {
      }
      return translationsCache.get(cacheKey)!;
    }
    
    try {
      // Importer dynamiquement le fichier JSON
      const data = await import(`@/locales/${locale}/${ns}.json`);
      
      // Extraire les traductions : soit data.default, soit data directement
      let translations = data.default || data;
      
      // Si les traductions ont une clé qui correspond au namespace, l'extraire
      // Ex: { "landing": { "hero": {...} } } → { "hero": {...} }
      if (ns in translations) {
        translations = translations[ns];
      }
      
      // Mettre en cache (seulement en production)
      if (useCache) {
        translationsCache.set(cacheKey, translations);
      }
      
      return translations;
    } catch (error) {
      console.error(`[i18n] ❌ Failed to load translations for ${locale}/${ns}:`, error);
      
      // Si on est déjà sur le fallback, retourner un objet vide
      if (locale === fallbackLocale) {
        return {};
      }
      
      // Essayer avec la locale de fallback
      try {
        const fallbackData = await import(`@/locales/${fallbackLocale}/${ns}.json`);
        const fallbackTranslations = fallbackData.default || fallbackData;
        return fallbackTranslations;
      } catch (fallbackError) {
        console.error(`[i18n] Failed to load fallback translations for ${fallbackLocale}/${ns}:`, fallbackError);
        return {};
      }
    }
  }, [fallbackLocale]);
  
  // Charger les traductions quand la locale ou le namespace change
  useEffect(() => {
    let isMounted = true;
    
    const load = async () => {
      setIsLoading(true);
      const data = await loadTranslations(currentInterfaceLanguage, namespace);
      
      if (isMounted) {
        // Si les données ont une clé racine qui correspond au namespace, l'extraire
        // Ex: { "landing": { "hero": { ... } } } → { "hero": { ... } }
        // Note: loadTranslations fait déjà cette extraction maintenant
        const translationsData = data;
        
        setTranslations(translationsData);
        
        setIsLoading(false);
      }
    };
    
    load();
    
    return () => {
      isMounted = false;
    };
  }, [currentInterfaceLanguage, namespace, loadTranslations]);
  
  // Fonction de traduction
  // Supporte deux signatures:
  // - t(key, params) où params est un objet { name: "John" }
  // - t(key, fallback) où fallback est un string à utiliser si la clé n'existe pas
  const t = useCallback((key: string, paramsOrFallback?: Record<string, any> | string): string => {
    // Déterminer si le second argument est un fallback string ou des params
    const isFallback = typeof paramsOrFallback === 'string';
    const fallback = isFallback ? paramsOrFallback : undefined;
    const params = isFallback ? undefined : paramsOrFallback;

    // Ne pas afficher de warnings pendant le chargement initial
    const shouldWarn = process.env.NODE_ENV === 'development' && !isLoading;

    // Debug: afficher l'état des translations seulement si elles sont censées être chargées
    if (shouldWarn && Object.keys(translations).length === 0) {
      console.warn(`[i18n] Translations object is empty for namespace "${namespace}"`);
    }

    // Naviguer dans l'objet de traductions en utilisant la clé avec points
    const keys = key.split('.');
    let value: any = translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Clé non trouvée - retourner le fallback ou la clé elle-même
        if (shouldWarn && !fallback) {
          console.warn(`[i18n] Missing translation key: ${namespace}.${key}`, {
            translationsKeys: Object.keys(translations),
            lookingFor: k,
            currentValue: value
          });
        }
        return fallback || key;
      }
    }

    // Si la valeur n'est pas une string, retourner le fallback ou la clé
    if (typeof value !== 'string') {
      if (process.env.NODE_ENV === 'development' && !fallback) {
        console.warn(`[i18n] Translation key "${namespace}.${key}" is not a string:`, value);
      }
      return fallback || key;
    }

    // Remplacer les paramètres dans la traduction
    if (params) {
      return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
        return params[paramKey]?.toString() || match;
      });
    }

    return value;
  }, [translations, namespace, isLoading]);
  
  // Fonction pour récupérer un tableau de traductions
  const tArray = useCallback((key: string): string[] => {
    // Naviguer dans l'objet de traductions en utilisant la clé avec points
    const keys = key.split('.');
    let value: any = translations;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Clé non trouvée
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[i18n] Missing translation array key: ${namespace}.${key}`);
        }
        return [];
      }
    }
    
    // Si la valeur est un tableau, le retourner
    if (Array.isArray(value)) {
      return value;
    }
    
    // Si ce n'est pas un tableau, retourner un tableau vide
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[i18n] Translation key "${namespace}.${key}" is not an array:`, value);
    }
    return [];
  }, [translations, namespace]);
  
  // Mémoïser le retour pour éviter les re-renders inutiles
  return useMemo(() => ({
    t,
    tArray,
    locale: currentInterfaceLanguage,
    currentLanguage: currentInterfaceLanguage,
    setLocale: setLanguage,
    isLoading,
  }), [t, tArray, currentInterfaceLanguage, setLanguage, isLoading]);
}

// Export du type pour réutilisation
export type { UseI18nReturn };


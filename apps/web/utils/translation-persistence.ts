/**
 * Utilitaires pour la persistance des traductions de messages
 */

import type { Translation } from '@/types';

const STORAGE_KEY_PREFIX = 'meeshy_message_translations_';

/**
 * Génère une clé de stockage unique pour un message
 */
function getStorageKey(messageId: string): string {
  return `${STORAGE_KEY_PREFIX}${messageId}`;
}

/**
 * Sauvegarde les traductions d'un message
 */
export function saveMessageTranslations(messageId: string, translations: Translation[], showingOriginal: boolean = true): void {
  try {
    if (typeof window === 'undefined') return;
    
    const data = {
      messageId,
      translations,
      showingOriginal,
      lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem(getStorageKey(messageId), JSON.stringify(data));
  } catch (error) {
    console.warn('Erreur lors de la sauvegarde des traductions:', error);
  }
}

/**
 * Charge les traductions d'un message
 */
export function loadMessageTranslations(messageId: string): { translations: Translation[]; showingOriginal: boolean } | null {
  try {
    if (typeof window === 'undefined') return null;
    
    const stored = localStorage.getItem(getStorageKey(messageId));
    if (!stored) return null;
    
    const data = JSON.parse(stored);
    
    // Vérifier que les données ne sont pas trop anciennes (7 jours)
    const lastUpdated = new Date(data.lastUpdated);
    const now = new Date();
    const daysDiff = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > 7) {
      // Supprimer les données expirées
      localStorage.removeItem(getStorageKey(messageId));
      return null;
    }
    
    return {
      translations: data.translations || [],
      showingOriginal: data.showingOriginal ?? true
    };
  } catch (error) {
    console.warn('Erreur lors du chargement des traductions:', error);
    return null;
  }
}

/**
 * Supprime les traductions d'un message
 */
export function removeMessageTranslations(messageId: string): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(getStorageKey(messageId));
  } catch (error) {
    console.warn('Erreur lors de la suppression des traductions:', error);
  }
}

/**
 * Nettoie les traductions expirées (plus de 7 jours)
 */
export function cleanupExpiredTranslations(): void {
  try {
    if (typeof window === 'undefined') return;
    
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        try {
          const stored = localStorage.getItem(key);
          if (stored) {
            const data = JSON.parse(stored);
            const lastUpdated = new Date(data.lastUpdated);
            const now = new Date();
            const daysDiff = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysDiff > 7) {
              keysToRemove.push(key);
            }
          }
        } catch {
          // Supprimer les données corrompues
          keysToRemove.push(key);
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    if (keysToRemove.length > 0) {
    }
  } catch (error) {
    console.warn('Erreur lors du nettoyage des traductions:', error);
  }
}

/**
 * Charge toutes les traductions pour une liste de messages
 */
export function loadAllMessageTranslations(messageIds: string[]): Map<string, { translations: Translation[]; showingOriginal: boolean }> {
  const result = new Map();
  
  messageIds.forEach(messageId => {
    const data = loadMessageTranslations(messageId);
    if (data) {
      result.set(messageId, data);
    }
  });
  
  return result;
}

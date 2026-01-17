/**
 * Service de traduction unifié pour Meeshy
 * Utilise uniquement l'API de traduction côté serveur (plus de ML côté client)
 * Performances optimisées et gestion des erreurs robuste
 */

import axios from 'axios';
import type { TranslationModel } from '@meeshy/shared/types';

// === TYPES ET INTERFACES ===
export interface TranslationResult {
  sourceText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  model: string;
  confidence: number;
  cached: boolean;
  processingTime?: number;
}

export interface TranslationRequest {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  model?: TranslationModel;
}

export interface TranslationError {
  code: string;
  message: string;
  details?: any;
}

// === CONFIGURATION ===
const API_BASE_URL = process.env.NEXT_PUBLIC_TRANSLATION_URL || 'http://meeshy.me/api';
const TIMEOUT = 30000; // 30 secondes

// === SERVICE DE TRADUCTION ===
class TranslationService {
  private cache = new Map<string, TranslationResult>();
  
  /**
   * Génère une clé de cache pour une traduction
   */
  private getCacheKey(text: string, sourceLanguage: string, targetLanguage: string, model?: string): string {
    return `${sourceLanguage}-${targetLanguage}-${model || 'default'}-${text}`;
  }

  /**
   * Traduit un texte via l'API de traduction
   */
  async translateText(request: TranslationRequest): Promise<TranslationResult> {
    const { text, sourceLanguage, targetLanguage, model = 'basic' } = request;
    
    // Vérifier le cache
    const cacheKey = this.getCacheKey(text, sourceLanguage, targetLanguage, model);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    try {
      const startTime = Date.now();
      
      const response = await axios.post(`${API_BASE_URL}/translate`, {
        text,
        source_language: sourceLanguage,
        target_language: targetLanguage,
        model
      }, {
        timeout: TIMEOUT,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const processingTime = Date.now() - startTime;
      
      const result: TranslationResult = {
        sourceText: text,
        translatedText: response.data.translated_text || response.data.translatedText,
        sourceLanguage,
        targetLanguage,
        model: response.data.model || model,
        confidence: response.data.confidence || 0.95,
        cached: false,
        processingTime
      };

      // Mettre en cache
      this.cache.set(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('Erreur lors de la traduction:', error);
      
      // Retourner le texte original en cas d'erreur
      return {
        sourceText: text,
        translatedText: text, // Fallback: texte original
        sourceLanguage,
        targetLanguage,
        model: model || 'basic',
        confidence: 0,
        cached: false,
        processingTime: 0
      };
    }
  }

  /**
   * Traduit un texte avec détection automatique de langue
   */
  async translateWithAutoDetect(text: string, targetLanguage: string, model: TranslationModel = 'basic'): Promise<TranslationResult> {
    try {
      const response = await axios.post(`${API_BASE_URL}/translate/auto`, {
        text,
        target_language: targetLanguage,
        model
      }, {
        timeout: TIMEOUT,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        sourceText: text,
        translatedText: response.data.translated_text,
        sourceLanguage: response.data.detected_language || 'auto',
        targetLanguage,
        model: response.data.model || model,
        confidence: response.data.confidence || 0.95,
        cached: false,
        processingTime: response.data.processing_time || 0
      };
    } catch (error) {
      console.error('Erreur lors de la traduction avec détection automatique:', error);
      
      // Fallback: essayer avec français comme langue source
      return this.translateText({
        text,
        sourceLanguage: 'fr',
        targetLanguage,
        model
      });
    }
  }

  /**
   * Vérifie la disponibilité du service de traduction
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${API_BASE_URL}/health`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      console.error('Service de traduction indisponible:', error);
      return false;
    }
  }

  /**
   * Obtient les langues supportées
   */
  async getSupportedLanguages(): Promise<string[]> {
    try {
      const response = await axios.get(`${API_BASE_URL}/languages`, {
        timeout: 10000
      });
      return response.data.languages || ['fr', 'en', 'es', 'de', 'pt', 'zh', 'ja', 'ar'];
    } catch (error) {
      console.error('Erreur lors de la récupération des langues supportées:', error);
      return ['fr', 'en', 'es', 'de', 'pt', 'zh', 'ja', 'ar'];
    }
  }

  /**
   * Vide le cache de traduction
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Obtient la taille du cache
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

// Instance singleton
export const translationService = new TranslationService();

// Export par défaut
export default translationService;

// === FONCTIONS UTILITAIRES ===

/**
 * Traduit un texte simple (fonction de commodité)
 */
export async function translateText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  model: TranslationModel = 'basic'
): Promise<string> {
  const result = await translationService.translateText({
    text,
    sourceLanguage,
    targetLanguage,
    model
  });
  return result.translatedText;
}

/**
 * Vérifie si une langue est supportée
 */
export function isLanguageSupported(language: string): boolean {
  const supportedLanguages = ['fr', 'en', 'es', 'de', 'pt', 'zh', 'ja', 'ar'];
  return supportedLanguages.includes(language.toLowerCase());
}

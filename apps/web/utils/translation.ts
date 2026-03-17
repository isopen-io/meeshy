/**
 * Système de traduction unifié - Intégration avec le service API
 * Maintient la compatibilité avec l'API existante
 */

import { translationService } from '@/services/translation.service';

// Service de traduction global
// const translationService = translationService; // Déjà importé

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    this.cache.delete(key);
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean { return this.cache.has(key); }
  get size(): number { return this.cache.size; }
  clear(): void { this.cache.clear(); }
  keys(): IterableIterator<K> { return this.cache.keys(); }
}

const translationCache = new LRUCache<string, string>(500);

/**
 * Génère une clé de cache pour une traduction
 */
function getCacheKey(text: string, sourceLang: string, targetLang: string): string {
  return `${sourceLang}-${targetLang}-${text.trim().toLowerCase()}`;
}

/**
 * Résultat de la détection de langue avec score de confiance
 */
export interface LanguageDetectionResult {
  language: string;
  confidence: number; // Pourcentage de confiance (0-100)
  scores: Record<string, number>; // Scores détaillés par langue
}

/**
 * Détecte la langue d'un texte avec des patterns simples
 * Version simplifiée pour compatibilité
 */
export function detectLanguage(text: string): string {
  const result = detectLanguageWithConfidence(text);
  return result.language;
}

/**
 * Détecte la langue d'un texte avec des patterns simples et retourne le score de confiance
 */
export function detectLanguageWithConfidence(text: string): LanguageDetectionResult {
  if (!text || text.trim().length === 0) {
    return {
      language: 'en',
      confidence: 0,
      scores: {}
    };
  }

  const cleanText = text.toLowerCase().trim();
  const words = cleanText.split(/\s+/).length;

  // Patterns de détection basiques
  const patterns: Record<string, RegExp[]> = {
    fr: [
      /\b(le|la|les|de|du|des|un|une|et|est|avec|pour|par|dans|sur|son|sa|ses|que|qui|où|quand|comment|pourquoi|je|tu|il|elle|nous|vous|ils|elles|moi|toi|lui|eux|ça|ce|cette|ces|mon|ma|mes|ton|ta|tes)\b/g,
      /[àâäéèêëïîôöùûüÿç]/g,
    ],
    es: [
      /\b(el|la|los|las|de|del|un|una|y|es|con|para|por|en|sobre|su|sus|que|quien|donde|cuando|como|porque|yo|tú|él|ella|nosotros|vosotros|ellos|ellas|mi|tu|su|nuestro|vuestro)\b/g,
      /[áéíóúüñ]/g,
    ],
    de: [
      /\b(der|die|das|den|dem|ein|eine|und|ist|mit|für|von|in|auf|sein|seine|ihre|dass|wer|wo|wann|wie|warum|ich|du|er|sie|es|wir|ihr|sie|mein|dein|sein|unser|euer)\b/g,
      /[äöüß]/g,
    ],
    it: [
      /\b(il|la|lo|gli|le|di|del|un|una|e|è|con|per|da|in|su|suo|sua|che|chi|dove|quando|come|perché|io|tu|lui|lei|noi|voi|loro|mio|tuo|suo|nostro|vostro)\b/g,
      /[àèéìíîòóù]/g,
    ],
    pt: [
      /\b(o|a|os|as|de|do|da|um|uma|e|é|com|para|por|em|sobre|seu|sua|que|quem|onde|quando|como|porque|eu|tu|ele|ela|nós|vós|eles|elas|meu|teu|seu|nosso|vosso)\b/g,
      /[àáâãéêíóôõú]/g,
    ],
    en: [
      /\b(the|a|an|and|is|with|for|by|in|on|his|her|their|that|who|where|when|how|why|i|you|he|she|we|they|me|him|her|us|them|my|your|his|her|our|their)\b/g,
    ],
  };

  // Compter les matches pour chaque langue
  const scores: Record<string, number> = {};

  for (const [lang, langPatterns] of Object.entries(patterns)) {
    let score = 0;
    for (const pattern of langPatterns) {
      const matches = cleanText.match(pattern);
      if (matches) {
        score += matches.length;
      }
    }
    scores[lang] = score;
  }

  // Trouver la langue avec le meilleur score
  const sortedScores = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a);

  if (sortedScores.length > 0 && sortedScores[0][1] > 1) {
    const bestScore = sortedScores[0][1];
    const totalMatches = Object.values(scores).reduce((sum, score) => sum + score, 0);
    
    // Calculer la confiance basée sur le ratio du meilleur score
    // et le nombre de mots analysés
    const confidence = Math.min(100, Math.round(
      (bestScore / Math.max(totalMatches, 1)) * 100 * Math.min(1, words / 5)
    ));

    return {
      language: sortedScores[0][0],
      confidence,
      scores
    };
  }

  // Fallback à l'anglais avec confiance faible
  return {
    language: 'en',
    confidence: 10,
    scores
  };
}

/**
 * Fonction principale de traduction
 * Utilise TranslationModels de manière transparente
 */
export async function translateMessage(
  text: string, 
  sourceLang: string, 
  targetLang: string
): Promise<string> {
  if (!text || !text.trim()) {
    return text;
  }

  if (sourceLang === targetLang) {
    return text;
  }

  // Vérifier le cache d'abord
  const cacheKey = getCacheKey(text, sourceLang, targetLang);
  const cached = translationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Utiliser le service API pour la traduction
    const result = await translationService.translateText({
      text, 
      targetLanguage: targetLang,
      sourceLanguage: sourceLang || 'auto',
      model: 'premium'
    });
    
    const translatedText = result?.translatedText;
    
    // Mettre en cache le résultat
    if (translatedText && translatedText !== text) {
      translationCache.set(cacheKey, translatedText);
    }
    
    return translatedText;
  } catch (error) {
    console.error('❌ Erreur de traduction:', error);
    
    // En cas d'erreur, essayer avec un modèle de base
    try {
      
      const result = await translationService.translateText({
        text,
        targetLanguage: targetLang,
        sourceLanguage: sourceLang || 'auto',
        model: 'basic'
      });
      
      const translatedText = result?.translatedText;
      
      // Mettre en cache le résultat
      if (translatedText && translatedText !== text) {
        translationCache.set(cacheKey, translatedText);
      }
      
      return translatedText;
    } catch (fallbackError) {
      console.error('❌ Échec de la traduction de secours:', fallbackError);
      throw new Error('Service de traduction indisponible');
    }
  }
}

/**
 * Nettoie le cache de traduction
 */
export function clearTranslationCache(): void {
  translationCache.clear();
}

/**
 * Obtient les statistiques du cache
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: translationCache.size,
    keys: Array.from(translationCache.keys()),
  };
}

/**
 * Obtient une traduction du cache
 */
export function getCachedTranslation(text: string, sourceLang: string, targetLang: string): string | null {
  const cacheKey = getCacheKey(text, sourceLang, targetLang);
  return translationCache.get(cacheKey) || null;
}

/**
 * Met en cache une traduction
 */
export function setCachedTranslation(
  text: string, 
  sourceLang: string, 
  targetLang: string, 
  translation: string
): void {
  const cacheKey = getCacheKey(text, sourceLang, targetLang);
  translationCache.set(cacheKey, translation);
}

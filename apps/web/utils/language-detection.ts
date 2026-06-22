/**
 * Utilitaires pour la détection et gestion des langues
 */

import { detectAll } from 'tinyld/light';
import { SUPPORTED_LANGUAGES as SHARED_LANGUAGES } from '@meeshy/shared/utils/languages';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

// Convertir les langues partagées au format local pour compatibilité
export const SUPPORTED_LANGUAGES: Language[] = SHARED_LANGUAGES.map(lang => ({
  code: lang.code,
  name: lang.name,
  nativeName: lang.name,
  flag: lang.flag,
}));

/**
 * Détecte la langue d'un texte en utilisant des patterns simples
 * Fallback basique avant d'utiliser des APIs externes
 */
export function detectLanguage(text: string): string {
  if (!text || text.trim().length === 0) {
    return 'en'; // Langue par défaut
  }

  // Nettoyer le texte
  const cleanText = text.toLowerCase().trim();

  // Patterns de détection basiques
  const patterns: Record<string, RegExp[]> = {
    fr: [
      /\b(le|la|les|de|du|des|un|une|et|est|avec|pour|par|dans|sur|son|sa|ses|que|qui|où|quand|comment|pourquoi)\b/g,
      /[àâäéèêëïîôöùûüÿç]/g,
    ],
    es: [
      /\b(el|la|los|las|de|del|un|una|y|es|con|para|por|en|sobre|su|sus|que|quien|donde|cuando|como|porque)\b/g,
      /[áéíóúüñ]/g,
    ],
    de: [
      /\b(der|die|das|den|dem|ein|eine|und|ist|mit|für|von|in|auf|sein|seine|ihre|dass|wer|wo|wann|wie|warum)\b/g,
      /[äöüß]/g,
    ],
    it: [
      /\b(il|la|lo|gli|le|di|del|un|una|e|è|con|per|da|in|su|suo|sua|che|chi|dove|quando|come|perché)\b/g,
      /[àèéìíîòóù]/g,
    ],
    pt: [
      /\b(o|a|os|as|de|do|da|um|uma|e|é|com|para|por|em|sobre|seu|sua|que|quem|onde|quando|como|porque)\b/g,
      /[àáâãéêíóôõú]/g,
    ],
    ru: [
      /[а-яё]/g,
      /\b(и|в|на|с|по|к|из|от|за|для|про|под|над|при|без|через|между|среди|около|вокруг|внутри)\b/g,
    ],
    ar: [
      /[ا-ي]/g,
      /\b(في|من|إلى|على|عن|مع|بعد|قبل|عند|لدى|حول|خلال|بين|ضد|نحو|تحت|فوق|أمام|خلف|يمين|شمال)\b/g,
    ],
    zh: [
      /[\u4e00-\u9fff]/g,
      /\b(的|了|在|是|我|有|和|人|这|中|大|为|上|个|国|年|到|说|们|就|出|要|以|时|和|地|们|得|可|下|对|生|也|子|后|自|回|她|哪|并|那|意|发|样|等|法|应|加|好)\b/g,
    ],
    ja: [
      /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g,
      /\b(は|が|を|に|で|と|から|まで|より|へ|の|だ|である|です|ます|した|する|される|なる|ある|いる|この|その|あの|どの)\b/g,
    ],
    ko: [
      /[\uac00-\ud7af]/g,
      /\b(은|는|이|가|을|를|에|에서|으로|로|와|과|의|도|만|조차|까지|부터|보다|처럼|같이|위해|대해|통해|따라|관해|대한|위한)\b/g,
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

  if (sortedScores.length > 0) {
    return sortedScores[0][0];
  }

  // Détection par défaut selon le navigateur
  if (typeof window !== 'undefined') {
    const browserLang = navigator.language.split('-')[0];
    if (SUPPORTED_LANGUAGES.some(lang => lang.code === browserLang)) {
      return browserLang;
    }
  }

  return 'en'; // Fallback
}

/**
 * Obtient les informations d'une langue par son code
 */
export function getLanguageInfo(code: string): Language | undefined {
  return SUPPORTED_LANGUAGES.find(lang => lang.code === code);
}

/**
 * Formate le nom d'une langue pour l'affichage
 */
export function formatLanguageName(code: string, format: 'name' | 'native' | 'both' = 'both'): string {
  const lang = getLanguageInfo(code);
  if (!lang) return code.toUpperCase();

  switch (format) {
    case 'name':
      return lang.name;
    case 'native':
      return lang.nativeName;
    case 'both':
      return lang.name === lang.nativeName 
        ? `${lang.flag} ${lang.name}` 
        : `${lang.flag} ${lang.name} (${lang.nativeName})`;
    default:
      return lang.name;
  }
}

/**
 * Valide si une langue est supportée
 */
export function isSupportedLanguage(code: string): boolean {
  return SUPPORTED_LANGUAGES.some(lang => lang.code === code);
}

/**
 * Obtient la langue préférée de l'utilisateur avec détection automatique améliorée
 */
export function getUserPreferredLanguage(): string {
  if (typeof window === 'undefined') return 'en';


  // Vérifier le localStorage d'abord
  const savedLang = localStorage.getItem('meeshy-preferred-language');
  if (savedLang && isSupportedLanguage(savedLang)) {
    return savedLang;
  }

  // Détecter automatiquement en utilisant toutes les langues préférées du navigateur
  const browserLanguages = navigator.languages || [navigator.language || 'en'];
  
  for (const lang of browserLanguages) {
    const languageCode = lang.split('-')[0].toLowerCase();
    if (isSupportedLanguage(languageCode)) {
      
      // Sauvegarder la langue détectée automatiquement
      saveUserPreferredLanguage(languageCode);
      
      return languageCode;
    }
  }

  // Fallback vers l'anglais si aucune langue supportée n'est trouvée
  saveUserPreferredLanguage('en');
  return 'en';
}

/**
 * Détecte automatiquement la meilleure langue d'interface basée sur les préférences du navigateur
 */
export function detectBestInterfaceLanguage(): string {
  if (typeof window === 'undefined') return 'en';

  const interfaceLanguages = ['en', 'fr', 'pt']; // Langues d'interface supportées
  const browserLanguages = navigator.languages || [navigator.language || 'en'];
  
  
  for (const lang of browserLanguages) {
    const languageCode = lang.split('-')[0].toLowerCase();
    if (interfaceLanguages.includes(languageCode)) {
      return languageCode;
    }
  }
  
  return 'en';
}

/**
 * Sauvegarde la langue préférée de l'utilisateur
 */
export function saveUserPreferredLanguage(code: string): void {
  if (typeof window === 'undefined') return;

  if (isSupportedLanguage(code)) {
    localStorage.setItem('meeshy-preferred-language', code);
  }
}

const COMPOSE_MIN_ALPHA = 4;
const COMPOSE_MIN_ACCURACY = 0.5;

/**
 * Détecte la langue du message composé (on-device, via tinyld) pour fixer
 * `originalLanguage` à l'émission. Repli sur `fallback` (langue annoncée /
 * systemLanguage) si le texte est trop court ou la confiance trop faible.
 * tinyld renvoie déjà de l'ISO 639-1 ; on normalise par sûreté.
 */
export function detectComposeLanguage(text: string, fallback: string): string {
  try {
    const safeFallback = normalizeLanguageCode(fallback) ?? fallback;
    const cleaned = (text || '').replace(/https?:\/\/\S+/g, ' ');
    const alpha = (cleaned.match(/\p{L}/gu) || []).length;
    if (alpha < COMPOSE_MIN_ALPHA) return safeFallback;
    const ranked = detectAll(cleaned);
    const top = ranked && ranked[0];
    if (!top || top.accuracy < COMPOSE_MIN_ACCURACY) return safeFallback;
    return normalizeLanguageCode(top.lang) ?? safeFallback;
  } catch {
    return normalizeLanguageCode(fallback) ?? fallback;
  }
}

/**
 * Utilitaire pour logger les informations de détection de langue
 * Aide au débogage et à la compréhension du comportement de l'auto-détection
 * 
 * NOTE: Ce fichier est uniquement pour le développement
 */

export function logLanguageDetectionInfo(): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return;

  console.group('🌐 MEESHY - Language Detection Information');
  
  try {
    // Informations du navigateur

    // Langues supportées par Meeshy
    const supportedInterfaceLanguages = ['en', 'fr', 'pt'];
    const supportedTranslationLanguages = ['en', 'fr', 'es', 'de', 'ru', 'zh', 'ja', 'ar', 'hi', 'pt', 'it', 'sv'];


    // Analyse des langues du navigateur
    const browserLanguages = navigator.languages || [navigator.language || 'en'];
    const languageAnalysis = browserLanguages.map(lang => {
      const code = lang.split('-')[0].toLowerCase();
      return {
        original: lang,
        code,
        supportsInterface: supportedInterfaceLanguages.includes(code),
        supportsTranslation: supportedTranslationLanguages.includes(code)
      };
    });


    // Recommendations
    const recommendedInterface = languageAnalysis.find(lang => lang.supportsInterface)?.code || 'en';
    const recommendedTranslation = languageAnalysis.find(lang => lang.supportsTranslation)?.code || 'en';


    // Configuration actuelle en localStorage
    const currentConfig = {
      interfaceLanguage: localStorage.getItem('meeshy_interface_language'),
      userLanguageConfig: localStorage.getItem('meeshy_user_language_config'),
      preferredLanguage: localStorage.getItem('meeshy-preferred-language')
    };


    // Suggestions d'amélioration

  } catch (error) {
    console.error('❌ Error in language detection logging:', error);
  }

  console.groupEnd();
}

/**
 * Version simplifiée pour le logging (uniquement en développement)
 */
export function logLanguageDetectionSummary(): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return;

  const browserLanguages = navigator.languages || [navigator.language || 'en'];
  const supportedInterfaceLanguages = ['en', 'fr', 'pt'];
  
  const detectedInterface = browserLanguages
    .map(lang => lang.split('-')[0].toLowerCase())
    .find(code => supportedInterfaceLanguages.includes(code)) || 'en';

}

/**
 * Fonction pour tester différents scénarios de langue (uniquement en développement)
 */
export function testLanguageDetection(): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') {
    return;
  }

  console.group('🧪 Language Detection Test');

  // Test cases simulés
  const testCases = [
    ['fr-FR', 'en-US'],
    ['pt-BR', 'en-US'],
    ['es-ES', 'fr-FR'],
    ['de-DE', 'en-US'],
    ['zh-CN', 'en-US'],
    ['ja-JP', 'en-US']
  ];

  testCases.forEach((languages, index) => {
    
    const detectedInterface = languages
      .map(lang => lang.split('-')[0].toLowerCase())
      .find(code => ['en', 'fr', 'pt'].includes(code)) || 'en';
    
    const detectedSystem = languages
      .map(lang => lang.split('-')[0].toLowerCase())
      .find(code => ['en', 'fr', 'es', 'de', 'ru', 'zh', 'ja', 'ar', 'hi', 'pt', 'it', 'sv'].includes(code)) || 'en';

  });

  console.groupEnd();
}

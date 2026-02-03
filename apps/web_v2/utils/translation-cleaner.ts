/**
 * Utilitaire pour nettoyer les résultats de traduction des tokens spéciaux
 * et autres artefacts de génération
 */

/**
 * Nettoie les tokens spéciaux et autres artefacts dans le texte traduit
 * @param text Le texte à nettoyer
 * @returns Le texte nettoyé
 */
export function cleanTranslationOutput(text: string): string {
  if (!text) return '';
  
  return text
    // Nettoyer les tokens spéciaux de modèles de traduction
    .replace(/<extra_id_\d+>/g, '')
    // Nettoyer les caractères spéciaux de tokenisation
    .replace(/▁/g, ' ')
    // Nettoyer les tokens d'ouverture et fermeture
    .replace(/<pad>|<\/pad>/g, '')
    .replace(/<unk>|<\/unk>/g, '')
    .replace(/<\/s>|<s>/g, '')
    // Gérer les problèmes courants
    .replace(/\s{2,}/g, ' ') // Normaliser les espaces multiples
    .trim();
}

/**
 * Version plus agressive qui nettoie également la ponctuation mal placée
 * et corrige d'autres problèmes de format courants
 * @param text Le texte à nettoyer
 * @returns Le texte nettoyé
 */
export function deepCleanTranslationOutput(text: string): string {
  if (!text) return '';
  
  let cleaned = cleanTranslationOutput(text);
  
  // Corrections supplémentaires pour les cas problématiques
  cleaned = cleaned
    // Normaliser la ponctuation collée sans espace
    .replace(/([.,!?;:])([A-Za-zÀ-ÖØ-öø-ÿ])/g, '$1 $2')
    // Normaliser les guillemets
    .replace(/["']([^"']*?)["']/g, '"$1"')
    // Supprimer les séquences de caractères non imprimables
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    // Normaliser les espaces avant la ponctuation française
    .replace(/\s+([.,!?;:])/g, '$1');

  return cleaned.trim();
}

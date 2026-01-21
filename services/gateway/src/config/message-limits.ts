/**
 * Configuration des limites de messages
 * Centralisée pour cohérence entre frontend et backend
 */

export const MESSAGE_LIMITS = {
  /**
   * Limite maximale de caractères pour un message (validé à l'envoi)
   * Frontend: validation à l'envoi (pas de blocage de saisie)
   * Backend: rejet des messages dépassant cette limite
   * Aligné avec frontend: 4000 caractères pour tous les rôles
   */
  MAX_MESSAGE_LENGTH: parseInt(process.env.MAX_MESSAGE_LENGTH || '4000', 10),

  /**
   * Seuil pour convertir le texte en pièce jointe textuelle
   * Au-delà de cette limite, le texte long est automatiquement converti en pièce jointe
   */
  MAX_TEXT_ATTACHMENT_THRESHOLD: parseInt(process.env.MAX_TEXT_ATTACHMENT_THRESHOLD || '4000', 10),

  /**
   * Limite maximale de caractères pour la traduction
   * Les messages dépassant cette limite ne seront pas envoyés au service de traduction
   * Aligné avec MAX_MESSAGE_LENGTH pour permettre la traduction de tous les messages valides
   */
  MAX_TRANSLATION_LENGTH: parseInt(process.env.MAX_TRANSLATION_LENGTH || '10000', 10),
} as const;

/**
 * Valide la longueur d'un message
 */
export function validateMessageLength(content: string): { isValid: boolean; error?: string } {
  if (!content || !content.trim()) {
    return { isValid: false, error: 'Le message ne peut pas être vide' };
  }

  if (content.length > MESSAGE_LIMITS.MAX_MESSAGE_LENGTH) {
    return { 
      isValid: false, 
      error: `Le message ne peut pas dépasser ${MESSAGE_LIMITS.MAX_MESSAGE_LENGTH} caractères (${content.length} caractères fournis)` 
    };
  }

  return { isValid: true };
}

/**
 * Vérifie si un message doit être converti en pièce jointe textuelle
 */
export function shouldConvertToTextAttachment(content: string): boolean {
  return content.length > MESSAGE_LIMITS.MAX_TEXT_ATTACHMENT_THRESHOLD;
}

/**
 * Vérifie si un message peut être traduit (selon sa longueur)
 */
export function canTranslateMessage(content: string): boolean {
  return content.length <= MESSAGE_LIMITS.MAX_TRANSLATION_LENGTH;
}

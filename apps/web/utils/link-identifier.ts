/**
 * Utilitaires pour la gestion des identifiants de liens de partage
 */

export interface LinkIdentifierInfo {
  type: 'linkId' | 'conversationShareLinkId' | 'unknown';
  value: string;
  isValid: boolean;
}

/**
 * Analyse un identifiant pour déterminer son type et sa validité
 */
export function analyzeLinkIdentifier(identifier: string): LinkIdentifierInfo {
  if (!identifier || typeof identifier !== 'string') {
    return {
      type: 'unknown',
      value: identifier,
      isValid: false
    };
  }

  // Vérifier si c'est un ObjectId MongoDB (24 caractères hexadécimaux)
  if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    return {
      type: 'conversationShareLinkId',
      value: identifier,
      isValid: true
    };
  }

  // Vérifier si c'est un linkId (format: mongoId.timestamp_randomString)
  // Exemple: 68ee540df062ef6a37bd3cca.2510141545_ordljlc5
  if (/^[0-9a-fA-F]{24}\.[0-9]+_[a-z0-9]+$/.test(identifier)) {
    return {
      type: 'linkId',
      value: identifier,
      isValid: true
    };
  }

  // Fallback: identifiant personnalisé (alphanumérique avec tirets/underscores/points)
  if (/^[a-zA-Z0-9._-]+$/.test(identifier)) {
    return {
      type: identifier.includes('.') ? 'linkId' : 'conversationShareLinkId',
      value: identifier,
      isValid: identifier.length >= 3
    };
  }

  return {
    type: 'unknown',
    value: identifier,
    isValid: false
  };
}

/**
 * Génère des identifiants de fallback pour essayer différents formats
 */
export function generateFallbackIdentifiers(identifier: string): string[] {
  const fallbacks: string[] = [];
  const info = analyzeLinkIdentifier(identifier);

  if (info.type === 'linkId') {
    // Si c'est un linkId (format: id.timestamp_random), essayer juste l'ID
    const parts = identifier.split('.');
    if (parts.length > 1 && /^[0-9a-fA-F]{24}$/.test(parts[0])) {
      fallbacks.push(parts[0]); // Essayer avec juste le conversationShareLinkId
    }
  } else if (info.type === 'conversationShareLinkId') {
    // Si c'est un conversationShareLinkId, on ne peut pas reconstruire le linkId
    // Car il nécessite le timestamp et le random qui ne sont pas disponibles
  }

  return fallbacks;
}

/**
 * Valide qu'un identifiant est utilisable pour les requêtes API
 */
export function isValidForApiRequest(identifier: string): boolean {
  const info = analyzeLinkIdentifier(identifier);
  return info.isValid && (info.type === 'linkId' || info.type === 'conversationShareLinkId');
}

/**
 * Normalise un identifiant pour l'affichage
 */
export function normalizeForDisplay(identifier: string): string {
  const info = analyzeLinkIdentifier(identifier);
  
  if (info.type === 'linkId') {
    // Pour les linkIds, afficher de manière plus lisible
    return identifier.replace('mshy_', '');
  }
  
  return identifier;
}

/**
 * Génère un identifiant de lien temporaire pour le stockage local
 */
export function generateTemporaryLinkId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `temp_${timestamp}_${random}`;
}

/**
 * Vérifie si un identifiant est temporaire
 */
export function isTemporaryLinkId(identifier: string): boolean {
  return identifier.startsWith('temp_');
}

/**
 * Extrait le conversationShareLinkId depuis un linkId
 * Format linkId: conversationShareLinkId.timestamp_random
 */
export function extractConversationShareLinkId(identifier: string): string | null {
  const info = analyzeLinkIdentifier(identifier);
  
  if (info.type === 'linkId') {
    // Pour les linkIds (format: id.timestamp_random), extraire la première partie
    const parts = identifier.split('.');
    if (parts.length > 1 && /^[0-9a-fA-F]{24}$/.test(parts[0])) {
      return parts[0];
    }
  }
  
  if (info.type === 'conversationShareLinkId') {
    // C'est déjà un conversationShareLinkId
    return identifier;
  }
  
  return null;
}

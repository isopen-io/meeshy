/**
 * Utilitaires pour la gestion des identifiants de conversation
 * Clarification : utiliser `id` (ObjectId) pour les API/WebSocket, `identifier` pour l'affichage/URLs
 */

/**
 * Vérifie si une chaîne est un ObjectId MongoDB valide
 */
export function isValidObjectId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Vérifie si une chaîne est un identifiant de conversation lisible (pour URLs)
 */
export function isConversationIdentifier(identifier: string): boolean {
  if (!identifier || typeof identifier !== 'string') return false;
  // Les identifiants lisibles sont généralement alphanumériques avec des tirets
  return /^[a-zA-Z0-9_-]+$/.test(identifier) && !isValidObjectId(identifier);
}

/**
 * Détermine le type d'identifiant de conversation
 */
export function getConversationIdType(id: string): 'objectId' | 'identifier' | 'invalid' {
  if (!id || typeof id !== 'string') return 'invalid';
  
  if (isValidObjectId(id)) {
    return 'objectId';
  }
  
  if (isConversationIdentifier(id)) {
    return 'identifier';
  }
  
  return 'invalid';
}

/**
 * Logs de debugging pour les identifiants de conversation
 */
export function logConversationIdDebug(id: string, context: string = '') {
  const type = getConversationIdType(id);
  
  
  return type;
}

/**
 * Extrait l'ID (ObjectId) d'un objet conversation
 * RÈGLE: Toujours utiliser l'`id` pour les communications backend
 */
export function getConversationApiId(conversation: any): string {
  if (!conversation) {
    throw new Error('Conversation object is null or undefined');
  }
  
  // Priorité à l'ID (ObjectId) - c'est ce qu'on doit TOUJOURS utiliser pour l'API
  if (conversation.id) {
    const type = getConversationIdType(conversation.id);
    if (type === 'objectId') {
      return conversation.id;
    }
  }
  
  // Si pas d'ID valide, on a un problème dans les données
  console.error('❌ getConversationApiId: Pas d\'ObjectId valide trouvé:', conversation);
  throw new Error(`Invalid conversation object: missing valid ObjectId. Got: ${JSON.stringify(conversation)}`);
}

/**
 * Extrait l'identifier d'un objet conversation pour l'affichage (URLs)
 * RÈGLE: Utiliser l'`identifier` pour les URLs quand disponible, sinon fallback sur l'ID
 */
export function getConversationDisplayId(conversation: any): string {
  if (!conversation) {
    throw new Error('Conversation object is null or undefined');
  }
  
  // Priorité à l'identifier pour l'affichage (URLs lisibles)
  if (conversation.identifier && isConversationIdentifier(conversation.identifier)) {
    return conversation.identifier;
  }
  
  // Fallback sur l'ID si pas d'identifier
  if (conversation.id) {
    return conversation.id;
  }
  
  console.error('❌ getConversationDisplayId: Ni identifier ni ID trouvé:', conversation);
  throw new Error(`Invalid conversation object: missing identifier and id. Got: ${JSON.stringify(conversation)}`);
}

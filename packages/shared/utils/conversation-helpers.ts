/**
 * Helpers utilitaires pour les conversations
 * Logique métier réutilisable entre Gateway et Frontend
 */

/**
 * Résout la langue préférée d'un utilisateur selon ses préférences
 */
export function resolveUserLanguage(user: {
  systemLanguage?: string;
  regionalLanguage?: string;
  customDestinationLanguage?: string;
  translateToSystemLanguage?: boolean;
  translateToRegionalLanguage?: boolean;
  useCustomDestination?: boolean;
}): string {
  if (user.useCustomDestination && user.customDestinationLanguage) {
    return user.customDestinationLanguage;
  }
  
  if (user.translateToSystemLanguage && user.systemLanguage) {
    return user.systemLanguage;
  }
  
  if (user.translateToRegionalLanguage && user.regionalLanguage) {
    return user.regionalLanguage;
  }
  
  return user.systemLanguage || 'fr'; // fallback
}

/**
 * Génère un identifiant unique pour une conversation
 * Format: mshy_<titre_sanitisé>-YYYYMMDDHHMMSS ou mshy_<unique_id>-YYYYMMDDHHMMSS si pas de titre
 */
export function generateConversationIdentifier(title?: string): string {
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  
  if (title) {
    // Sanitiser le titre : enlever les caractères spéciaux, remplacer les espaces par des tirets
    const sanitizedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Garder seulement lettres, chiffres, espaces et tirets
      .replace(/\s+/g, '-') // Remplacer les espaces par des tirets
      .replace(/-+/g, '-') // Remplacer les tirets multiples par un seul
      .replace(/^-|-$/g, ''); // Enlever les tirets en début/fin
    
    if (sanitizedTitle.length > 0) {
      return `mshy_${sanitizedTitle}-${timestamp}`;
    }
  }
  
  // Fallback: générer un identifiant unique avec préfixe mshy_
  const uniqueId = Math.random().toString(36).slice(2, 10);
  return `mshy_${uniqueId}-${timestamp}`;
}

/**
 * Vérifie si un identifiant est un ObjectID MongoDB valide
 */
export function isValidMongoId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Calcule si un message peut encore être modifié (1 heure max pour users normaux)
 */
export function canEditMessage(
  createdAt: Date | string,
  userRole: string = 'USER'
): { canEdit: boolean; reason?: string } {
  // Admins et BIGBOSS peuvent toujours modifier
  if (['ADMIN', 'BIGBOSS', 'MODERATOR', 'CREATOR'].includes(userRole)) {
    return { canEdit: true };
  }
  
  const messageDate = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const messageAge = Date.now() - messageDate.getTime();
  const oneHourInMs = 60 * 60 * 1000;
  
  if (messageAge > oneHourInMs) {
    return {
      canEdit: false,
      reason: 'MESSAGE_TOO_OLD',
    };
  }
  
  return { canEdit: true };
}

/**
 * Génère un titre par défaut pour une conversation sans titre
 */
export function generateDefaultConversationTitle(
  members: Array<{ displayName?: string; username?: string; firstName?: string; lastName?: string }>,
  currentUserId: string
): string {
  const otherMembers = members.filter((m: any) => m.id !== currentUserId);
  
  if (otherMembers.length === 0) {
    return 'Conversation';
  }
  
  if (otherMembers.length === 1) {
    const member = otherMembers[0];
    if (member) {
      return member.displayName || member.username || `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Unknown User';
    }
    return 'Unknown User';
  }
  
  if (otherMembers.length === 2) {
    const names = otherMembers.map(m => 
      m.displayName || m.username || m.firstName || 'Unknown User'
    );
    return names.join(', ');
  }
  
  // 3+ membres
  const firstTwo = otherMembers.slice(0, 2).map(m => 
    m.displayName || m.username || m.firstName || 'Unknown User'
  );
  return `${firstTwo.join(', ')} and ${otherMembers.length - 2} other(s)`;
}

/**
 * Calcule les langues requises pour une conversation
 */
export function getRequiredLanguages(
  conversationMembers: Array<{
    systemLanguage?: string;
    regionalLanguage?: string;
    customDestinationLanguage?: string;
    translateToSystemLanguage?: boolean;
    translateToRegionalLanguage?: boolean;
    useCustomDestination?: boolean;
  }>
): string[] {
  const languages = new Set<string>();
  
  conversationMembers.forEach(user => {
    const lang = resolveUserLanguage(user);
    if (lang) {
      languages.add(lang);
    }
  });
  
  return Array.from(languages);
}

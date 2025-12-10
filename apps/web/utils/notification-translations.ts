/**
 * Utilitaires pour la gestion des traductions dans les notifications
 */

export interface NotificationTranslations {
  fr?: string;
  en?: string;
  es?: string;
}

export interface MessageNotificationData {
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  conversationId: string;
  conversationType: string;
  timestamp: string;
  translations?: NotificationTranslations;
}

/**
 * Construit un message de notification multilingue
 */
export const buildMultilingualNotificationMessage = (
  content: string, 
  translations?: NotificationTranslations
): string => {
  const baseMessage = content.substring(0, 30) + (content.length > 30 ? '...' : '');
  
  if (translations && (translations.fr || translations.en || translations.es)) {
    const messages = [];
    
    // Message original (français par défaut)
    messages.push(`🇫🇷 ${baseMessage}`);
    
    // Traductions disponibles
    if (translations.en) {
      const enMessage = translations.en.substring(0, 30) + (translations.en.length > 30 ? '...' : '');
      messages.push(`🇺🇸 ${enMessage}`);
    }
    
    if (translations.es) {
      const esMessage = translations.es.substring(0, 30) + (translations.es.length > 30 ? '...' : '');
      messages.push(`🇪🇸 ${esMessage}`);
    }
    
    return messages.join('\n');
  }
  
  return baseMessage;
};

/**
 * Génère un titre de notification adapté au type de conversation
 */
export const getNotificationTitle = (conversationType: string, senderName: string): string => {
  switch (conversationType) {
    case 'direct':
      return `Message direct de ${senderName}`;
    case 'group':
      return `Message de groupe de ${senderName}`;
    case 'public':
      return `Message public de ${senderName}`;
    case 'global':
      return `Message global de ${senderName}`;
    default:
      return `Nouveau message de ${senderName}`;
  }
};

/**
 * Génère une icône adaptée au type de conversation
 */
export const getNotificationIcon = (conversationType: string): string => {
  switch (conversationType) {
    case 'direct':
      return '💬';
    case 'group':
      return '👥';
    case 'public':
      return '🌐';
    case 'global':
      return '🌍';
    default:
      return '💬';
  }
};

/**
 * Détermine la durée d'affichage du toast selon le contenu
 */
export const getToastDuration = (hasTranslations: boolean): number => {
  return hasTranslations ? 6000 : 4000; // Plus long si traductions multiples
};

/**
 * Valide si les traductions sont disponibles et valides
 */
export const hasValidTranslations = (translations?: NotificationTranslations): boolean => {
  if (!translations) return false;
  
  return !!(translations.fr || translations.en || translations.es);
};

/**
 * Formate les traductions pour l'affichage dans les notifications
 */
export const formatTranslationsForNotification = (translations: NotificationTranslations): string[] => {
  const formattedMessages = [];
  
  if (translations.fr) {
    const frMessage = translations.fr.substring(0, 30) + (translations.fr.length > 30 ? '...' : '');
    formattedMessages.push(`🇫🇷 ${frMessage}`);
  }
  
  if (translations.en) {
    const enMessage = translations.en.substring(0, 30) + (translations.en.length > 30 ? '...' : '');
    formattedMessages.push(`🇺🇸 ${enMessage}`);
  }
  
  if (translations.es) {
    const esMessage = translations.es.substring(0, 30) + (translations.es.length > 30 ? '...' : '');
    formattedMessages.push(`🇪🇸 ${esMessage}`);
  }
  
  return formattedMessages;
};


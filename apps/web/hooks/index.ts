// Hooks React personnalisés pour Meeshy

// Hook de messaging unifié (Socket.IO + Envoi + Typing)
export { useSocketIOMessaging } from './use-socketio-messaging'; // Service mature et stable
export { useMessaging } from './use-messaging'; // Hook de haut niveau

// Traduction unifiée
export { useMessageTranslation } from './useMessageTranslation'; // Pour traduction de messages API
export { useI18n } from './useI18n'; // Pour traduction i18n interface
export { useMessageTranslations } from './use-message-translations';
export { useMessageLoader } from './use-message-loader';
export { useConversationMessages } from './use-conversation-messages';

// Langues unifiées
export { useLanguage } from './use-language'; // Nouveau hook fusionné

// Interface utilisateur et notifications
export { useNotifications } from './use-notifications';
export { useFontPreference } from './use-font-preference';
export { useFixRadixZIndex } from './use-fix-z-index';

// Authentification
export { useAuth } from './use-auth';
export { useAuthGuard } from './use-auth-guard';

// Hooks legacy supprimés - migration vers les nouveaux hooks unifiés terminée

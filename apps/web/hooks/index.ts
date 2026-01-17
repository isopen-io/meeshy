// Hooks React personnalisés pour Meeshy

// Hook de messaging unifié (Socket.IO + Envoi + Typing)
export { useSocketIOMessaging } from './use-socketio-messaging'; // Service mature et stable
export { useMessaging } from './use-messaging'; // Hook de haut niveau

// Traduction unifiée
export { useMessageTranslation } from './useMessageTranslation'; // Pour traduction de messages API
export { useI18n } from './useI18n'; // Pour traduction i18n interface
export { useMessageTranslations } from './use-message-translations';
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

// Encryption (E2EE)
export { useEncryption, getEncryptionService } from './use-encryption';

// Hooks legacy supprimés - migration vers les nouveaux hooks unifiés terminée

// Hooks de conversation (extraits de ConversationLayout)
export {
  useConversationSelection,
  useConversationUI,
  useConversationTyping,
  useComposerDrafts,
  useMessageActions,
} from './conversations';

// Hooks de composer (extraits de MessageComposer)
export {
  useAttachmentUpload,
  useAudioRecorder,
  useMentions,
  useTextareaAutosize,
} from './composer';

// Hooks vidéo (extraits de VideoPlayer)
export { useVideoPlayback } from './use-video-playback';
export { useFullscreen } from './use-fullscreen';
export { useVolume } from './use-volume';

// Hooks contacts (extraits de ContactsPage)
export { useContactsData } from './use-contacts-data';
export { useContactsFiltering } from './use-contacts-filtering';
export { useContactsActions } from './use-contacts-actions';

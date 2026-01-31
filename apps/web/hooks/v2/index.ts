// Auth
export { useLoginV2 } from './use-login-v2';
export { useSignupV2 } from './use-signup-v2';
export { useForgotPasswordV2 } from './use-forgot-password-v2';
export type { ForgotPasswordState, ResetPasswordState, UseForgotPasswordV2Return } from './use-forgot-password-v2';

// Chat (legacy)
export { useChatV2 } from './use-chat-v2';

// Messaging V2
export { useConversationsV2 } from './use-conversations-v2';
export type { UseConversationsV2Options, ConversationsV2Return } from './use-conversations-v2';

export { useMessagesV2 } from './use-messages-v2';
export type { UseMessagesV2Options, MessagesV2Return, SendMessageOptions } from './use-messages-v2';

export { useConversationUrlSync } from './use-conversation-url-sync';

// Contacts V2
export { useContactsV2 } from './use-contacts-v2';
export type { UseContactsV2Options, ContactsV2Return, ContactV2 } from './use-contacts-v2';

// Profile V2
export { useProfileV2 } from './use-profile-v2';
export type { UseProfileV2Options, ProfileV2Return, ProfileV2, ProfileStatsV2, LanguageInfo, UpdateProfileData } from './use-profile-v2';

// Notifications V2
export { useNotificationsV2 } from './use-notifications-v2';
export type { UseNotificationsV2Options, NotificationsV2Return, NotificationV2 } from './use-notifications-v2';

// Settings V2
export { useSettingsV2 } from './use-settings-v2';
export type {
  UseSettingsV2Options,
  SettingsV2Return,
  LanguageSettingV2,
  NotificationSettingsV2,
  ThemeSettingV2,
  AccountSettingsV2,
} from './use-settings-v2';

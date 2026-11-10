import type { ExternalConversationCatalog } from '@/lib/i18n-external-conversation-catalog';

const en = {
  'externalConversation.entry.title': 'Write to a friend on WhatsApp',
  'externalConversation.entry.detail': 'By their number, end-to-end encrypted',
  'externalConversation.handle.label': 'Your friend’s WhatsApp number',
  'externalConversation.handle.hint': 'In international format, with the country code: +44 20 7946 0958.',
  'externalConversation.handle.invalid': 'This number is not in international format. Start with + and the country code.',
  'externalConversation.submit': 'Write',
  'externalConversation.pending': 'Opening…',
  'externalConversation.cancel': 'Cancel',
  'externalConversation.encrypted': 'End-to-end encrypted: Meeshy cannot read your messages. Translation happens on your device, and features that require reading the message on our servers are not available in this conversation.',
  'externalConversation.phoneUnverified': 'Verify your phone number to write to a friend on WhatsApp.',
  'externalConversation.phoneVerified': 'Number verified. Tap “Write” to open the conversation.',
  'externalConversation.refused.disabled': 'Writing to a friend on WhatsApp is not available here yet.',
  'externalConversation.refused.reserved': 'During the test phase, end-to-end encrypted conversations are reserved for some accounts.',
  'externalConversation.refused.limit': 'You already have the maximum number of open WhatsApp conversations. Close one to open another.',
  'externalConversation.refused.rateLimited': 'Too many conversations opened in a short time. Try again in an hour.',
  'externalConversation.refused.offline': 'Offline: reconnect, then tap “Write” again.',
  'externalConversation.refused.failed': 'This conversation could not be opened. Try again in a moment.',
} satisfies ExternalConversationCatalog;

export default en;

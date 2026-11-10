import type { ExternalConversationCatalog } from '@/lib/i18n-external-conversation-catalog';

const de = {
  'externalConversation.entry.title': 'Einem Freund auf WhatsApp schreiben',
  'externalConversation.entry.detail': 'Über seine Nummer, Ende-zu-Ende-verschlüsselt',
  'externalConversation.handle.label': 'WhatsApp-Nummer deines Freundes',
  'externalConversation.handle.hint': 'Im internationalen Format, mit Ländervorwahl: +49 151 23456789.',
  'externalConversation.handle.invalid': 'Diese Nummer ist nicht im internationalen Format. Beginne mit + und der Ländervorwahl.',
  'externalConversation.submit': 'Schreiben',
  'externalConversation.pending': 'Wird geöffnet…',
  'externalConversation.cancel': 'Abbrechen',
  'externalConversation.encrypted': 'Ende-zu-Ende-verschlüsselt: Meeshy kann deine Nachrichten nicht lesen. Die Übersetzung erfolgt auf deinem Gerät, und Funktionen, die das Lesen der Nachricht auf unseren Servern erfordern, gibt es in dieser Unterhaltung nicht.',
  'externalConversation.phoneUnverified': 'Bestätige deine Telefonnummer, um einem Freund auf WhatsApp zu schreiben.',
  'externalConversation.phoneVerified': 'Nummer bestätigt. Tippe auf „Schreiben“, um die Unterhaltung zu öffnen.',
  'externalConversation.refused.disabled': 'Einem Freund auf WhatsApp zu schreiben ist hier noch nicht verfügbar.',
  'externalConversation.refused.reserved': 'Während der Testphase sind Ende-zu-Ende-verschlüsselte Unterhaltungen einigen Konten vorbehalten.',
  'externalConversation.refused.limit': 'Du hast bereits die maximale Zahl offener WhatsApp-Unterhaltungen. Schließe eine, um eine neue zu öffnen.',
  'externalConversation.refused.rateLimited': 'Zu viele Unterhaltungen in kurzer Zeit geöffnet. Versuche es in einer Stunde erneut.',
  'externalConversation.refused.offline': 'Offline: Stelle die Verbindung wieder her und tippe dann erneut auf „Schreiben“.',
  'externalConversation.refused.failed': 'Diese Unterhaltung konnte nicht geöffnet werden. Versuche es gleich noch einmal.',
} satisfies ExternalConversationCatalog;

export default de;

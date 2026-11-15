import type { ExternalInteropCatalog } from '@/lib/i18n-external-interop-catalog';

/** L'information sur ce qui part chez Meta et le signalement d'un contenu WhatsApp (#17120) — voir `catalog-external-interop-fr.ts`. */
const de = {
  'externalInterop.notice.title': 'Einem Freund auf WhatsApp schreiben',
  'externalInterop.notice.lead': 'Um deinen Freund auf WhatsApp zu erreichen, übermittelt Meeshy an Meta, den Betreiber von WhatsApp:',
  'externalInterop.disclosure.phone-number': 'deine verifizierte Telefonnummer, die dich bei WhatsApp identifiziert;',
  'externalInterop.disclosure.profile-name': 'deinen Anzeigenamen;',
  'externalInterop.disclosure.public-keys': 'die öffentlichen Verschlüsselungsschlüssel deiner Geräte;',
  'externalInterop.disclosure.encrypted-content': 'deine Nachrichten und Medien, Ende-zu-Ende-verschlüsselt: Meta kann sie nicht lesen;',
  'externalInterop.disclosure.delivery-metadata': 'wer wem wann schreibt, die Größe der Sendungen und die Zustellbestätigungen.',
  'externalInterop.notice.retention': 'Meeshy speichert die Nummer deines Freundes {days} Tage nach deinem letzten Öffnen der Unterhaltung und löscht sie dann.',
  'externalInterop.notice.retention.unknown': 'Meeshy speichert die Nummer deines Freundes für eine begrenzte Zeit und löscht sie dann.',
  'externalInterop.notice.translation': 'Die Übersetzung erfolgt auf deinem Gerät: Meeshy sieht den Inhalt dieser Unterhaltung nie.',
  'externalInterop.notice.withdraw': 'Du kannst diese Einwilligung jederzeit widerrufen: Meeshy löscht dann die Nummern deiner WhatsApp-Freunde.',
  'externalInterop.notice.accept': 'Ich stimme zu und fahre fort',
  'externalInterop.notice.accept.busy': 'Wird gespeichert…',
  'externalInterop.notice.cancel': 'Abbrechen',
  'externalInterop.notice.outdated': 'Diese Information hat sich geändert: Aktualisiere Meeshy, um sie vor der Zustimmung erneut zu lesen.',
  'externalInterop.notice.unavailable': 'Einem Freund auf WhatsApp zu schreiben ist hier noch nicht verfügbar.',
  'externalInterop.notice.error': 'Deine Einwilligung konnte nicht gespeichert werden. Versuche es erneut.',
  'externalInterop.report.title': 'Diesen WhatsApp-Inhalt melden',
  'externalInterop.report.lead': 'Meeshy kann diese Unterhaltung nicht lesen: Nur was du anhängst, wird an unser Moderationsteam gesendet.',
  'externalInterop.report.reason': 'Grund',
  'externalInterop.report.attach': 'Nachrichtentext anhängen',
  'externalInterop.report.attach.hint': 'Der angehängte Text wird unverschlüsselt an die Moderation von Meeshy gesendet.',
  'externalInterop.report.block': 'Diesen Kontakt auf Meeshy blockieren',
  'externalInterop.report.submit': 'Meldung senden',
  'externalInterop.report.submit.busy': 'Wird gesendet…',
  'externalInterop.report.cancel': 'Abbrechen',
  'externalInterop.report.done.title': 'Meldung gesendet',
  'externalInterop.report.done.blocked': 'Dieser Kontakt ist blockiert: Du erhältst seine Nachrichten auf Meeshy nicht mehr.',
  'externalInterop.report.done.orientation': 'Meeshy kann nicht auf sein WhatsApp-Konto einwirken. Um diesen Inhalt bei WhatsApp entfernen zu lassen, nutze die Meldefunktion von Meta.',
  'externalInterop.report.done.close': 'Schließen',
  'externalInterop.report.error': 'Die Meldung konnte nicht gesendet werden. Versuche es erneut.',
} satisfies ExternalInteropCatalog;

export default de;

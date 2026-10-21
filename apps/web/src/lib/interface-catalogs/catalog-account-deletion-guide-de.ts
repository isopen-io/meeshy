import type { AccountDeletionGuideCatalog } from '@/lib/i18n-account-deletion-guide';

/**
 * LA PAGE DE SUPPRESSION VUE DÉCONNECTÉ — ses libellés, importés par la seule page
 * qui les rend : les catalogues d'interface (budget `interface_catalogs`) n'en portent rien.
 * `routes/account-deletion-guide.tsx` (#9921).
 */
const deAccountDeletionGuide = {
  'accountDeletion.guide.title': 'Dein Meeshy-Konto löschen',
  'accountDeletion.guide.intro': 'Diese Seite betrifft die App Meeshy für Android, iOS und das Web. Sie erklärt, wie du dein Konto löschst und was mit deinen Daten geschieht.',
  'accountDeletion.guide.steps.title': 'So geht’s',
  'accountDeletion.guide.step.signIn': 'Melde dich über die Schaltfläche unten an. In der App findest du dieselbe Anfrage unter Einstellungen, Konto löschen.',
  'accountDeletion.guide.step.confirm': 'Gib den Bestätigungssatz und dein Passwort ein und beantrage die Löschung.',
  'accountDeletion.guide.step.email': 'Öffne die E-Mail, die wir dir senden, und bestätige die Löschung.',
  'accountDeletion.guide.step.wait': 'Dein Konto wird 30 Tage später gelöscht. Du musst sonst nichts tun.',
  'accountDeletion.guide.signIn': 'Anmelden, um mein Konto zu löschen',
  'accountDeletion.guide.deleted.title': 'Was gelöscht wird',
  'accountDeletion.guide.deleted.profile': 'Dein Profil: Name, Benutzername, E-Mail, Telefonnummer, Foto, Banner, Biografie und Geburtsdatum.',
  'accountDeletion.guide.deleted.access': 'Dein Passwort, deine Sitzungen und deine Verschlüsselungsschlüssel.',
  'accountDeletion.guide.deleted.messages': 'Der Text deiner Nachrichten und ihre Übersetzungen, deine Fotos, Videos und Sprachnachrichten.',
  'accountDeletion.guide.deleted.other': 'Dein Stimmprofil, dein Adressbuch, deine Benachrichtigungen, deine Freigabelinks, dein Spielfortschritt und deine Sticker.',
  'accountDeletion.guide.kept.title': 'Was erhalten bleibt',
  'accountDeletion.guide.kept.messages': 'In den Unterhaltungen anderer bleiben deine Nachrichten an ihrem Platz, leer und als gelöscht markiert.',
  'accountDeletion.guide.kept.posts': 'Der Text deiner Beiträge und Kommentare bleibt unter dem Namen „Gelöschtes Konto“ sichtbar. Um sie zu entfernen, lösche sie vor deiner Anfrage in der App.',
  'accountDeletion.guide.kept.packs': 'Von dir veröffentlichte Sticker-Pakete bleiben verfügbar, ohne deinen Namen.',
  'accountDeletion.guide.kept.stats': 'Eine anonyme Konto-Kennung und Nutzungsstatistiken, die dich nicht identifizieren.',
  'accountDeletion.guide.delay.title': 'Frist',
  'accountDeletion.guide.delay.body': 'Dein Konto wird 30 Tage nach deiner Bestätigung gelöscht. Bis dahin kannst du über den Link in der E-Mail abbrechen.',
  'accountDeletion.guide.noAccess.title': 'Du kannst dich nicht mehr anmelden?',
  'accountDeletion.guide.noAccess.body': 'Schreib uns von der E-Mail-Adresse deines Kontos und bitte um die Löschung. Wir antworten innerhalb von 30 Tagen.',
} as const satisfies AccountDeletionGuideCatalog;

export default deAccountDeletionGuide;

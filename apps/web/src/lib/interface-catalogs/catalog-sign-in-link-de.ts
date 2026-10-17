import type { SignInLinkCatalog } from '@/lib/i18n-sign-in-link-catalog';

/** La confirmation d'un lien de connexion (8da83d255f) — voir `catalog-sign-in-link-fr.ts`. */
const de = {
  'signInLink.confirm.title': 'Als @{username} anmelden?',
  'signInLink.confirm.lead': 'Dieser Link wurde nicht auf diesem Gerät angefordert. Fahre nur fort, wenn dieses Konto dir gehört.',
  'signInLink.confirm.leadSignedIn': 'Du bist als @{current} angemeldet. Dieser Link würde stattdessen das Konto unten öffnen; @{current} bleibt in deinen Konten auf diesem Gerät.',
  'signInLink.confirm.accept': 'Anmelden',
  'signInLink.confirm.cancel': 'Abbrechen',
} satisfies SignInLinkCatalog;

export default de;

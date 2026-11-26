/**
 * LE PROFIL MEESHY SUR LA PAGE ÉDITEUR (#16440), ALLEMAND : la section de
 * Réglages réservée aux comptes qui ont un profil d'éditeur. Hors du catalogue
 * d'interface, arrivé à son plafond : chargé par la section
 * (`i18n-publisher-page-catalog.ts`), jamais au démarrage.
 */
import type { PublisherPageCatalog } from '../i18n-publisher-page-catalog';

const de = {
  'publisherPage.title': 'Herausgeberseite',
  'publisherPage.showOwner': 'Mein Meeshy-Profil auf meiner Herausgeberseite zeigen',
  'publisherPage.caption': 'Dein Benutzername, dein Name und dein Avatar erscheinen auf der Seite von „{name}“. Standardmäßig ausgeblendet.',
} satisfies PublisherPageCatalog;

export default de;

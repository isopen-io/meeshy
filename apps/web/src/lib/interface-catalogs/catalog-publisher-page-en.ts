/**
 * LE PROFIL MEESHY SUR LA PAGE ÉDITEUR (#16440), ANGLAIS : la section de
 * Réglages réservée aux comptes qui ont un profil d'éditeur. Hors du catalogue
 * d'interface, arrivé à son plafond : chargé par la section
 * (`i18n-publisher-page-catalog.ts`), jamais au démarrage.
 */
import type { PublisherPageCatalog } from '../i18n-publisher-page-catalog';

const en = {
  'publisherPage.title': 'Publisher page',
  'publisherPage.showOwner': 'Show my Meeshy profile on my publisher page',
  'publisherPage.caption': 'Your username, name and avatar appear on the “{name}” page. Hidden by default.',
} satisfies PublisherPageCatalog;

export default en;

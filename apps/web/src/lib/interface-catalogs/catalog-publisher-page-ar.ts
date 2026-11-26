/**
 * LE PROFIL MEESHY SUR LA PAGE ÉDITEUR (#16440), ARABE : la section de
 * Réglages réservée aux comptes qui ont un profil d'éditeur. Hors du catalogue
 * d'interface, arrivé à son plafond : chargé par la section
 * (`i18n-publisher-page-catalog.ts`), jamais au démarrage.
 */
import type { PublisherPageCatalog } from '../i18n-publisher-page-catalog';

const ar = {
  'publisherPage.title': 'صفحة الناشر',
  'publisherPage.showOwner': 'إظهار ملفي في Meeshy على صفحة الناشر',
  'publisherPage.caption': 'يظهر اسم المستخدم واسمك وصورتك الرمزية على صفحة «{name}». مخفي افتراضيًا.',
} satisfies PublisherPageCatalog;

export default ar;

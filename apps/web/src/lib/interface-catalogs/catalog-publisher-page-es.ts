/**
 * LE PROFIL MEESHY SUR LA PAGE ÉDITEUR (#16440), ESPAGNOL : la section de
 * Réglages réservée aux comptes qui ont un profil d'éditeur. Hors du catalogue
 * d'interface, arrivé à son plafond : chargé par la section
 * (`i18n-publisher-page-catalog.ts`), jamais au démarrage.
 */
import type { PublisherPageCatalog } from '../i18n-publisher-page-catalog';

const es = {
  'publisherPage.title': 'Página de editor',
  'publisherPage.showOwner': 'Mostrar mi perfil de Meeshy en mi página de editor',
  'publisherPage.caption': 'Tu nombre de usuario, tu nombre y tu avatar aparecen en la página de «{name}». Oculto por defecto.',
} satisfies PublisherPageCatalog;

export default es;

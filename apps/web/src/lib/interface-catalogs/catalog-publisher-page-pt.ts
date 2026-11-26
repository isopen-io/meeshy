/**
 * LE PROFIL MEESHY SUR LA PAGE ÉDITEUR (#16440), PORTUGAIS : la section de
 * Réglages réservée aux comptes qui ont un profil d'éditeur. Hors du catalogue
 * d'interface, arrivé à son plafond : chargé par la section
 * (`i18n-publisher-page-catalog.ts`), jamais au démarrage.
 */
import type { PublisherPageCatalog } from '../i18n-publisher-page-catalog';

const pt = {
  'publisherPage.title': 'Página de editor',
  'publisherPage.showOwner': 'Mostrar o meu perfil Meeshy na minha página de editor',
  'publisherPage.caption': 'O seu nome de utilizador, o seu nome e o seu avatar aparecem na página de «{name}». Oculto por predefinição.',
} satisfies PublisherPageCatalog;

export default pt;

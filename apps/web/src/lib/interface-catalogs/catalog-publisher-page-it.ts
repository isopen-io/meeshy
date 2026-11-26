/**
 * LE PROFIL MEESHY SUR LA PAGE ÉDITEUR (#16440), ITALIEN : la section de
 * Réglages réservée aux comptes qui ont un profil d'éditeur. Hors du catalogue
 * d'interface, arrivé à son plafond : chargé par la section
 * (`i18n-publisher-page-catalog.ts`), jamais au démarrage.
 */
import type { PublisherPageCatalog } from '../i18n-publisher-page-catalog';

const it = {
  'publisherPage.title': 'Pagina editore',
  'publisherPage.showOwner': 'Mostra il mio profilo Meeshy sulla mia pagina editore',
  'publisherPage.caption': 'Il tuo nome utente, il tuo nome e il tuo avatar compaiono sulla pagina di «{name}». Nascosto per impostazione predefinita.',
} satisfies PublisherPageCatalog;

export default it;

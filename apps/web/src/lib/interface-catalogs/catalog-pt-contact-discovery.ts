import type { ContactDiscoveryCatalogSlice } from './catalog-fr-contact-discovery';

/** Ce que mes contacts savent de moi, et ce que j'apprends d'eux (#8105, #8285) — miroir de `catalog-fr-contact-discovery.ts`. */
const ptContactDiscovery = {
  'settings.privacy.hide_from_search': 'Ocultar meu número e meu e-mail',
  'settings.privacy.hide_from_search.info':
    'Seus contatos não vão te encontrar pelo seu número ou e-mail, e não serão avisados da sua chegada.',
  'settings.privacy.hide_from_search.question': 'Quem não me encontrará mais?',
  'settings.privacy.notify_contacts_on_return': 'Anunciar meu retorno',
  'settings.privacy.notify_contacts_on_return.info':
    'Seus amigos e quem tem seu número ou e-mail veem “esteve no Meeshy recentemente”, no máximo uma vez a cada 3 horas. Nunca se o seu status online estiver oculto.',
  'settings.privacy.notify_contacts_on_return.question': 'Quem é avisado do meu retorno?',
  'settings.notif.contact_activity': 'Retorno de um contato',
} satisfies ContactDiscoveryCatalogSlice;

export default ptContactDiscovery;

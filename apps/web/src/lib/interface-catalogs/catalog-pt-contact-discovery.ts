import type { ContactDiscoveryCatalogSlice } from './catalog-fr-contact-discovery';

/** Ce que mes contacts savent de moi, et ce que j'apprends d'eux (#8105, #8285) — miroir de `catalog-fr-contact-discovery.ts`. */
const ptContactDiscovery = {
  'settings.privacy.hide_from_search': 'Não me sugerir a quem tem meu número ou e-mail',
  'settings.privacy.hide_from_search.info':
    'Seus contatos não vão te encontrar pelo seu número ou e-mail, e não serão avisados da sua chegada.',
  'settings.privacy.notify_contacts_on_return': 'Avisar meus contatos quando eu voltar ao Meeshy',
  'settings.privacy.notify_contacts_on_return.info':
    'Seus amigos e quem tem seu número ou e-mail veem “esteve no Meeshy recentemente”, no máximo uma vez a cada 3 horas. Nunca se o seu status online estiver oculto.',
  'settings.notif.contact_activity': 'Quando um contato volta ao Meeshy',
} satisfies ContactDiscoveryCatalogSlice;

export default ptContactDiscovery;

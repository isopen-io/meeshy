import type { ContactDiscoveryCatalogSlice } from './catalog-fr-contact-discovery';

/** Ce que mes contacts savent de moi, et ce que j'apprends d'eux (#8105, #8285) — miroir de `catalog-fr-contact-discovery.ts`. */
const esContactDiscovery = {
  'settings.privacy.hide_from_search': 'No sugerirme a quien tenga mi número o mi correo',
  'settings.privacy.hide_from_search.info':
    'Tus contactos no te encontrarán por tu número o tu correo, y no se les avisará de tu llegada.',
  'settings.privacy.notify_contacts_on_return': 'Avisar a mis contactos cuando vuelvo a Meeshy',
  'settings.privacy.notify_contacts_on_return.info':
    'Tus amigos y quienes tienen tu número o tu correo ven «estuvo en Meeshy hace poco», como máximo una vez cada 3 horas. Nunca si ocultas tu estado en línea.',
  'settings.notif.contact_activity': 'Cuando un contacto vuelve a Meeshy',
} satisfies ContactDiscoveryCatalogSlice;

export default esContactDiscovery;

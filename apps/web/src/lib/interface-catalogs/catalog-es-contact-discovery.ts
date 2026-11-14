import type { ContactDiscoveryCatalogSlice } from './catalog-fr-contact-discovery';

/** Ce que mes contacts savent de moi, et ce que j'apprends d'eux (#8105, #8285) — miroir de `catalog-fr-contact-discovery.ts`. */
const esContactDiscovery = {
  'settings.privacy.hide_from_search': 'Ocultar mi número y mi correo',
  'settings.privacy.hide_from_search.info':
    'Tus contactos no te encontrarán por tu número o tu correo, y no se les avisará de tu llegada.',
  'settings.privacy.notify_contacts_on_return': 'Anunciar mi regreso',
  'settings.privacy.notify_contacts_on_return.info':
    'Tus amigos y quienes tienen tu número o tu correo ven «estuvo en Meeshy hace poco», como máximo una vez cada 3 horas. Nunca si ocultas tu estado en línea.',
  'settings.notif.contact_activity': 'Regreso de un contacto',
  'settings.notif.contact_activity.info': 'Una notificación cuando un contacto vuelve a Meeshy.',
  'settings.notif.bring': 'Recibir Brings',
  'settings.notif.bring.info':
    'Un allegado puede hacer sonar tu teléfono en una emergencia extrema, incluso en silencio. Desactivado, nadie podrá hacerte sonar.',
} satisfies ContactDiscoveryCatalogSlice;

export default esContactDiscovery;

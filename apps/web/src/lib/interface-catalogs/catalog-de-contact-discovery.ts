import type { ContactDiscoveryCatalogSlice } from './catalog-fr-contact-discovery';

/** Ce que mes contacts savent de moi, et ce que j'apprends d'eux (#8105, #8285) — miroir de `catalog-fr-contact-discovery.ts`. */
const deContactDiscovery = {
  'settings.privacy.hide_from_search': 'Meine Nummer und E-Mail verbergen',
  'settings.privacy.hide_from_search.info':
    'Deine Kontakte finden dich nicht über deine Nummer oder E-Mail und werden nicht benachrichtigt, wenn du beitrittst.',
  'settings.privacy.hide_from_search.question': 'Wer findet mich dann nicht mehr?',
  'settings.privacy.notify_contacts_on_return': 'Meine Rückkehr ankündigen',
  'settings.privacy.notify_contacts_on_return.info':
    'Deine Freunde und alle, die deine Nummer oder E-Mail haben, sehen „war kürzlich auf Meeshy“ – höchstens einmal alle 3 Stunden. Nie, wenn dein Online-Status verborgen ist.',
  'settings.privacy.notify_contacts_on_return.question': 'Wer erfährt von meiner Rückkehr?',
  'settings.notif.contact_activity': 'Rückkehr eines Kontakts',
} satisfies ContactDiscoveryCatalogSlice;

export default deContactDiscovery;

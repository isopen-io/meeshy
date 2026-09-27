import type { ContactDiscoveryCatalogSlice } from './catalog-fr-contact-discovery';

/** Ce que mes contacts savent de moi, et ce que j'apprends d'eux (#8105, #8285) — miroir de `catalog-fr-contact-discovery.ts`. */
const deContactDiscovery = {
  'settings.privacy.hide_from_search': 'Mich nicht Personen vorschlagen, die meine Nummer oder E-Mail haben',
  'settings.privacy.hide_from_search.info':
    'Deine Kontakte finden dich nicht über deine Nummer oder E-Mail und werden nicht benachrichtigt, wenn du beitrittst.',
  'settings.privacy.notify_contacts_on_return': 'Meine Kontakte informieren, wenn ich zurück auf Meeshy bin',
  'settings.privacy.notify_contacts_on_return.info':
    'Deine Freunde und alle, die deine Nummer oder E-Mail haben, sehen „war kürzlich auf Meeshy“ – höchstens einmal alle 3 Stunden. Nie, wenn dein Online-Status verborgen ist.',
  'settings.notif.contact_activity': 'Wenn ein Kontakt zurück auf Meeshy ist',
} satisfies ContactDiscoveryCatalogSlice;

export default deContactDiscovery;

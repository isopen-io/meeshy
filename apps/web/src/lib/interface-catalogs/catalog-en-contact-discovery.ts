import type { ContactDiscoveryCatalogSlice } from './catalog-fr-contact-discovery';

/** Ce que mes contacts savent de moi, et ce que j'apprends d'eux (#8105, #8285) — miroir de `catalog-fr-contact-discovery.ts`. */
const enContactDiscovery = {
  'settings.privacy.hide_from_search': 'Don\'t suggest me to people who have my number or email',
  'settings.privacy.hide_from_search.info':
    'Your contacts won\'t find you by your number or email, and won\'t be told when you join.',
  'settings.privacy.notify_contacts_on_return': 'Let my contacts know when I’m back on Meeshy',
  'settings.privacy.notify_contacts_on_return.info':
    'Your friends and anyone who has your number or email see “was on Meeshy recently”, at most once every 3 hours. Never if your online status is hidden.',
  'settings.notif.contact_activity': 'When a contact is back on Meeshy',
} satisfies ContactDiscoveryCatalogSlice;

export default enContactDiscovery;

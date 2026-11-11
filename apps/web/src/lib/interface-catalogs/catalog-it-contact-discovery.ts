import type { ContactDiscoveryCatalogSlice } from './catalog-fr-contact-discovery';

/** Ce que mes contacts savent de moi, et ce que j'apprends d'eux (#8105, #8285) — miroir de `catalog-fr-contact-discovery.ts`. */
const itContactDiscovery = {
  'settings.privacy.hide_from_search': 'Non propormi a chi ha il mio numero o la mia email',
  'settings.privacy.hide_from_search.info':
    'I tuoi contatti non ti troveranno tramite il tuo numero o la tua email, e non saranno avvisati del tuo arrivo.',
  'settings.privacy.notify_contacts_on_return': 'Avvisa i miei contatti quando torno su Meeshy',
  'settings.privacy.notify_contacts_on_return.info':
    'I tuoi amici e chi ha il tuo numero o la tua email vedono «era su Meeshy di recente», al massimo una volta ogni 3 ore. Mai se il tuo stato online è nascosto.',
  'settings.notif.contact_activity': 'Quando un contatto torna su Meeshy',
} satisfies ContactDiscoveryCatalogSlice;

export default itContactDiscovery;

import type { ContactDiscoveryCatalogSlice } from './catalog-fr-contact-discovery';

/** Ce que mes contacts savent de moi, et ce que j'apprends d'eux (#8105, #8285) — miroir de `catalog-fr-contact-discovery.ts`. */
const itContactDiscovery = {
  'settings.privacy.hide_from_search': 'Nascondi il mio numero e la mia e-mail',
  'settings.privacy.hide_from_search.info':
    'I tuoi contatti non ti troveranno tramite il tuo numero o la tua email, e non saranno avvisati del tuo arrivo.',
  'settings.privacy.notify_contacts_on_return': 'Annuncia il mio ritorno',
  'settings.privacy.notify_contacts_on_return.info':
    'I tuoi amici e chi ha il tuo numero o la tua email vedono «era su Meeshy di recente», al massimo una volta ogni 3 ore. Mai se il tuo stato online è nascosto.',
  'settings.notif.contact_activity': 'Ritorno di un contatto',
  'settings.notif.contact_activity.info': 'Una notifica quando un contatto torna su Meeshy.',
  'settings.notif.bring': 'Ricevere Bring',
  'settings.notif.bring.info':
    'Una persona vicina può far squillare il tuo telefono per un’emergenza estrema, anche in silenzioso. Disattivato, nessuno potrà più farti squillare.',
} satisfies ContactDiscoveryCatalogSlice;

export default itContactDiscovery;

/**
 * EFFACER MON CARNET D'ADRESSES (#8167) — tranche du catalogue,
 * RÉPANDUE par `catalog-en.ts` comme `catalog-en-calls-erase.ts`.
 */
const enAddressBook = {
  'settings.address_book.erase': 'Erase my address book',
  'settings.address_book.erase.info': 'Contacts synced from your phone are only used to let you know when a friend joins Meeshy.',
  'settings.address_book.erased': 'Address book erased',
  'settings.address_book.confirm.title': 'Erase your address book?',
  'settings.address_book.confirm.body': 'Your synced contacts are deleted from our servers, along with the record of friends whose arrival was announced to you. Nothing is sent again until you sync from your phone once more.',
  'settings.address_book.confirm.action': 'Erase',
  'settings.address_book.done': 'Address book cleared',
  'settings.address_book.failed': 'The erasure didn’t go through. Please try again.',
} as const;

export default enAddressBook;

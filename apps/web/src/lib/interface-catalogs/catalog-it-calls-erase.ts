/**
 * EFFACER ET CHERCHER DANS LE JOURNAL D'APPELS (#8066) — tranche du catalogue,
 * RÉPANDUE par `catalog-it.ts` comme `catalog-it-call-feedback.ts`.
 */
const itCallsErase = {
  'calls.edit': 'Modifica',
  'calls.editDone': 'Fine',
  'calls.hide.named': 'Rimuovi la chiamata con {name} dal registro',
  'calls.clearAll': 'Cancella tutto',
  'calls.clearAll.confirm': 'Cancellare tutto il registro chiamate? Gli altri partecipanti mantengono il loro.',
  'calls.clearAll.confirmAction': 'Cancella',
  'calls.clearAll.cancel': 'Annulla',
  'calls.erase.failed': 'La cancellazione non è riuscita. Riprova.',
  'calls.search': 'Cerca un nome',
  'calls.search.clear': 'Cancella la ricerca',
  'calls.search.empty': 'Nessuna chiamata corrisponde a «{query}»',
} as const;

export default itCallsErase;

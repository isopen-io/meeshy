/**
 * EFFACER ET CHERCHER DANS LE JOURNAL D'APPELS (#8066) — tranche du catalogue,
 * RÉPANDUE par `catalog-de.ts` comme `catalog-de-call-feedback.ts`.
 */
const deCallsErase = {
  'calls.edit': 'Bearbeiten',
  'calls.editDone': 'Fertig',
  'calls.hide.named': 'Anruf mit {name} aus dem Verlauf entfernen',
  'calls.clearAll': 'Alle löschen',
  'calls.clearAll.confirm': 'Den gesamten Anrufverlauf löschen? Die anderen Teilnehmer behalten ihren.',
  'calls.clearAll.confirmAction': 'Löschen',
  'calls.clearAll.cancel': 'Abbrechen',
  'calls.erase.failed': 'Das Löschen ist fehlgeschlagen. Bitte erneut versuchen.',
  'calls.search': 'Nach Namen suchen',
  'calls.search.clear': 'Suche löschen',
  'calls.search.empty': 'Kein Anruf passt zu „{query}“',
  'calls.participants.more': '{names} +{count}',
  'calls.participants.a11y': 'mit {names}',
  'callJoin.detail.participants': 'Teilnehmende',
  'calls.filter.videoOnly': 'Nur Videoanrufe',
} as const;

export default deCallsErase;

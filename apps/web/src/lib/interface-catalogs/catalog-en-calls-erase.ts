/**
 * EFFACER ET CHERCHER DANS LE JOURNAL D'APPELS (#8066) — tranche du catalogue,
 * RÉPANDUE par `catalog-en.ts` comme `catalog-en-call-feedback.ts`.
 */
const enCallsErase = {
  'calls.edit': 'Edit',
  'calls.editDone': 'Done',
  'calls.hide.named': 'Remove the call with {name} from the log',
  'calls.clearAll': 'Clear all',
  'calls.clearAll.confirm': 'Clear your whole call log? Other participants keep theirs.',
  'calls.clearAll.confirmAction': 'Clear',
  'calls.clearAll.cancel': 'Cancel',
  'calls.erase.failed': 'The call log could not be cleared. Try again.',
  'calls.search': 'Search a name',
  'calls.search.clear': 'Clear search',
  'calls.search.empty': 'No call matches “{query}”',
  'calls.participants.more': '{names} +{count}',
  'calls.participants.a11y': 'with {names}',
  'callJoin.detail.participants': 'Participants',
  'callJoin.detail.reactions': 'Reactions',
  'calls.filter.videoOnly': 'Video calls only',
} as const;

export default enCallsErase;

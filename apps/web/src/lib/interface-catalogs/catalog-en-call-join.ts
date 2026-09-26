/**
 * REJOINDRE, REPRENDRE, LA FICHE D'UN APPEL ET LE PAVÉ (lot 3 des appels —
 * #6383, #6454, #3586) — tranche anglaise du catalogue, RÉPANDUE par
 * `catalog-en.ts` comme `catalog-en-call.ts`. Libellés repris d'iOS
 * (`CallDetailSheet.swift`, `KeypadTab.swift`).
 */
const enCallJoin = {
  'callJoin.action': 'Join',
  'callJoin.named': 'Join the call with {name}',
  'callJoin.header': 'Join the ongoing call',
  'callJoin.resume.title': 'Call in progress',
  'callJoin.resume.action': 'Resume',
  'callJoin.resume.named': 'Resume the call with {name}',
  'callJoin.detail.title': 'Call details',
  'callJoin.detail.type': 'Type',
  'callJoin.detail.date': 'Date',
  'callJoin.detail.duration': 'Duration',
  'callJoin.detail.data': 'Data',
  'callJoin.detail.openConversation': 'Open conversation',
  'callJoin.detail.loading': 'Loading call',
  'callJoin.detail.notFound.title': 'Call not found',
  'callJoin.detail.notFound.body': 'This call no longer exists or isn’t available to you.',
  'callJoin.detail.joining': 'Joining the call…',
  'keypad.title': 'Keypad',
  'keypad.open': 'Dial a number',
  'keypad.input.placeholder': 'Number or name',
  'keypad.input.label': 'Number or name to search',
  'keypad.delete': 'Delete',
  'keypad.clear': 'Clear all',
  'keypad.prompt.title': 'Dial a number or a name',
  'keypad.prompt.subtitle': 'Find someone by phone number or by name.',
  'keypad.searching': 'Searching…',
  'keypad.noMatch.title': 'No contact found',
  'keypad.noMatch.subtitle': 'Check the number or name you entered.',
  'keypad.error.title': 'Search failed',
  'keypad.error.body': 'Check your connection and try again.',
  'keypad.offline.title': 'Offline',
  'keypad.offline.body': 'Search will resume when you’re back online.',
  'keypad.results': 'Results',
  'keypad.call.audio.named': 'Voice call to {name}',
  'keypad.call.video.named': 'Video call to {name}',
  'keypad.call.failed': 'The call couldn’t start. Try again.',
  'keypad.retry': 'Try again',
} as const;

export default enCallJoin;

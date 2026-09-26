/**
 * REJOINDRE, REPRENDRE, LA FICHE D'UN APPEL ET LE PAVÉ (lot 3 des appels —
 * #6383, #6454, #3586) — tranche italienne du catalogue, RÉPANDUE par
 * `catalog-it.ts` comme `catalog-it-call.ts`. Libellés repris d'iOS
 * (`CallDetailSheet.swift`, `KeypadTab.swift`).
 */
const itCallJoin = {
  'callJoin.action': 'Partecipa',
  'callJoin.named': 'Partecipa alla chiamata con {name}',
  'callJoin.header': 'Partecipa alla chiamata in corso',
  'callJoin.resume.title': 'Chiamata in corso',
  'callJoin.resume.action': 'Riprendi',
  'callJoin.resume.named': 'Riprendi la chiamata con {name}',
  'callJoin.detail.title': 'Dettagli della chiamata',
  'callJoin.detail.type': 'Tipo',
  'callJoin.detail.date': 'Data',
  'callJoin.detail.duration': 'Durata',
  'callJoin.detail.data': 'Dati',
  'callJoin.detail.openConversation': 'Apri la conversazione',
  'callJoin.detail.loading': 'Caricamento della chiamata',
  'callJoin.detail.notFound.title': 'Chiamata non trovata',
  'callJoin.detail.notFound.body': 'Questa chiamata non esiste più o non ti è accessibile.',
  'callJoin.detail.joining': 'Connessione alla chiamata…',
  'keypad.title': 'Tastierino',
  'keypad.open': 'Componi un numero',
  'keypad.input.placeholder': 'Numero o nome',
  'keypad.input.label': 'Numero o nome da cercare',
  'keypad.delete': 'Cancella',
  'keypad.clear': 'Cancella tutto',
  'keypad.prompt.title': 'Componi un numero o un nome',
  'keypad.prompt.subtitle': 'Trova qualcuno per numero di telefono o per nome.',
  'keypad.searching': 'Ricerca…',
  'keypad.noMatch.title': 'Nessun contatto trovato',
  'keypad.noMatch.subtitle': 'Controlla il numero o il nome inserito.',
  'keypad.error.title': 'La ricerca non è riuscita',
  'keypad.error.body': 'Controlla la connessione e riprova.',
  'keypad.offline.title': 'Offline',
  'keypad.offline.body': 'La ricerca riprenderà al ritorno della rete.',
  'keypad.results': 'Risultati',
  'keypad.call.audio.named': 'Chiamata vocale a {name}',
  'keypad.call.video.named': 'Videochiamata a {name}',
  'keypad.call.failed': 'Impossibile avviare la chiamata. Riprova.',
  'keypad.retry': 'Riprova',
} as const;

export default itCallJoin;

/**
 * REJOINDRE, REPRENDRE, LA FICHE D'UN APPEL ET LE PAVÉ (lot 3 des appels —
 * #6383, #6454, #3586) — tranche allemande du catalogue, RÉPANDUE par
 * `catalog-de.ts` comme `catalog-de-call.ts`. Libellés repris d'iOS
 * (`CallDetailSheet.swift`, `KeypadTab.swift`).
 */
const deCallJoin = {
  'callJoin.action': 'Beitreten',
  'callJoin.named': 'Dem Anruf mit {name} beitreten',
  'callJoin.header': 'Dem laufenden Anruf beitreten',
  'callJoin.resume.title': 'Laufender Anruf',
  'callJoin.resume.action': 'Fortsetzen',
  'callJoin.resume.named': 'Anruf mit {name} fortsetzen',
  'callJoin.detail.title': 'Anrufdetails',
  'callJoin.detail.type': 'Art',
  'callJoin.detail.date': 'Datum',
  'callJoin.detail.duration': 'Dauer',
  'callJoin.detail.data': 'Daten',
  'callJoin.detail.openConversation': 'Unterhaltung öffnen',
  'callJoin.detail.loading': 'Anruf wird geladen',
  'callJoin.detail.notFound.title': 'Anruf nicht gefunden',
  'callJoin.detail.notFound.body': 'Dieser Anruf existiert nicht mehr oder ist für dich nicht verfügbar.',
  'callJoin.detail.joining': 'Verbindung zum Anruf…',
  'keypad.title': 'Tastenfeld',
  'keypad.open': 'Nummer wählen',
  'keypad.input.placeholder': 'Nummer oder Name',
  'keypad.input.label': 'Zu suchende Nummer oder Name',
  'keypad.delete': 'Löschen',
  'keypad.clear': 'Alles löschen',
  'keypad.prompt.title': 'Wähle eine Nummer oder einen Namen',
  'keypad.prompt.subtitle': 'Finde jemanden per Telefonnummer oder Name.',
  'keypad.searching': 'Suche…',
  'keypad.noMatch.title': 'Kein Kontakt gefunden',
  'keypad.noMatch.subtitle': 'Prüfe die eingegebene Nummer oder den Namen.',
  'keypad.error.title': 'Suche fehlgeschlagen',
  'keypad.error.body': 'Prüfe deine Verbindung und versuche es erneut.',
  'keypad.offline.title': 'Offline',
  'keypad.offline.body': 'Die Suche wird fortgesetzt, sobald das Netz zurück ist.',
  'keypad.results': 'Ergebnisse',
  'keypad.call.audio.named': 'Sprachanruf an {name}',
  'keypad.call.video.named': 'Videoanruf an {name}',
  'keypad.call.failed': 'Der Anruf konnte nicht starten. Versuche es erneut.',
  'keypad.retry': 'Erneut versuchen',
} as const;

export default deCallJoin;

/**
 * LES SOUS-TITRES D'UN APPEL ET SA TRANSCRIPTION (#8048) — tranche du catalogue,
 * RÉPANDUE par `catalog-it.ts` comme `catalog-it-call-quality.ts` : le bouton
 * Sous-titres de l'écran d'appel, le panneau et son journal
 * (`call-captions-panel.tsx`), la transcription d'après l'appel dans la bulle
 * du fil (`call-transcript-panel.tsx`).
 */
const itCallCaptions = {
  'call.captions.original': 'Mostra sottotitoli originali',
  'call.captions.invited': 'Mostra sottotitoli — il tuo interlocutore li sta già leggendo',
  'callCaptions.footer.touchForOriginal': '{pair} · tocca = originale',
  'callCaptions.footer.translating': '{language} · traduzione in corso',
  'callCaptions.footer.translatedLanguages.one': 'Tradotto · {count} lingua',
  'callCaptions.footer.translatedLanguages.two': 'Tradotto · due lingue',
  'callCaptions.footer.translatedLanguages.few': 'Tradotto · {count} lingue',
  'callCaptions.footer.translatedLanguages.many': 'Tradotto · {count} di lingue',
  'callCaptions.footer.translatedLanguages.other': 'Tradotto · {count} lingue',
  'callCaptions.self': 'Io',
  'callCaptions.regionLabel': 'Sottotitoli della chiamata',
  'callCaptions.translating': 'Traduzione in corso',
  'callCaptions.region': 'Sottotitoli',
  'callCaptions.waiting': 'I sottotitoli compaiono qui appena qualcuno parla',
  'callCaptions.listening': 'La tua voce viene trascritta',
  'callCaptions.unsupported': 'La tua voce non viene trascritta su questo dispositivo: leggi gli altri',
  'callCaptions.denied': 'Riconoscimento vocale negato: leggi gli altri',
  'callCaptions.sealed': 'Sottotitoli non disponibili: questa conversazione è crittografata end-to-end, oppure non è stato possibile verificarne la crittografia',
  'callCaptions.journal.title': 'Registro della chiamata',
  'callCaptions.participant': 'Partecipante',
  'callTranscript.show': 'Mostra la trascrizione',
  'callTranscript.hide': 'Nascondi la trascrizione',
  'callTranscript.title': 'Trascrizione della chiamata',
  'callTranscript.loading': 'Caricamento della trascrizione…',
  'callTranscript.empty': 'Nessuna trascrizione',
  'callTranscript.error': 'Trascrizione non disponibile',
  'callTranscript.retry': 'Riprova',
  'callTranscript.showOriginal': 'Vedi l’originale',
  'callTranscript.showTranslated': 'Vedi la traduzione',
  'callJournal.capture.screenshot': 'ha catturato lo schermo',
  'callJournal.capture.recording': 'sta registrando lo schermo',
  'callJournal.recording.started': 'La registrazione della chiamata è iniziata',
  'callJournal.recording.stopped': 'La registrazione della chiamata si è interrotta',
} as const;

export default itCallCaptions;

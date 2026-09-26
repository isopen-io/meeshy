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
  'callCaptions.region': 'Sottotitoli',
  'callCaptions.waiting': 'I sottotitoli compaiono qui appena qualcuno parla',
  'callCaptions.mode.translated': 'Tradotti nella tua lingua',
  'callCaptions.mode.original': 'Nella lingua originale',
  'callCaptions.listening': 'La tua voce viene trascritta',
  'callCaptions.unsupported': 'Questo browser non trascrive la tua voce: leggi gli altri',
  'callCaptions.denied': 'Riconoscimento vocale negato: leggi gli altri',
  'callCaptions.journal.show': 'Registro',
  'callCaptions.journal.hide': 'Nascondi il registro',
  'callCaptions.journal.title': 'Registro della chiamata',
  'callCaptions.participant': 'Partecipante',
  'callTranscript.show': 'Trascrizione',
  'callTranscript.hide': 'Nascondi la trascrizione',
  'callTranscript.title': 'Trascrizione della chiamata',
  'callTranscript.loading': 'Caricamento della trascrizione…',
  'callTranscript.empty': 'Nessuna trascrizione per questa chiamata',
  'callTranscript.error': 'Trascrizione non disponibile',
  'callTranscript.retry': 'Riprova',
  'callTranscript.showOriginal': 'Vedi l’originale',
  'callTranscript.showTranslated': 'Vedi la traduzione',
} as const;

export default itCallCaptions;

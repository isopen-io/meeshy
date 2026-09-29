/**
 * LES SOUS-TITRES D'UN APPEL ET SA TRANSCRIPTION (#8048) — tranche du catalogue,
 * RÉPANDUE par `catalog-en.ts` comme `catalog-en-call-quality.ts` : le bouton
 * Sous-titres de l'écran d'appel, le panneau et son journal
 * (`call-captions-panel.tsx`), la transcription d'après l'appel dans la bulle
 * du fil (`call-transcript-panel.tsx`).
 */
const enCallCaptions = {
  'call.captions.original': 'Show original captions',
  'call.captions.invited': 'Show captions — the other person is already reading them',
  'callCaptions.region': 'Captions',
  'callCaptions.waiting': 'Captions appear here as soon as someone speaks',
  'callCaptions.mode.translated': 'Translated into your language',
  'callCaptions.mode.original': 'In the original language',
  'callCaptions.listening': 'Your voice is being transcribed',
  'callCaptions.unsupported': 'This browser can’t transcribe your voice: you can read the others',
  'callCaptions.denied': 'Speech recognition denied: you can read the others',
  'callCaptions.journal.title': 'Call log',
  'callCaptions.participant': 'Participant',
  'callTranscript.show': 'Transcript',
  'callTranscript.hide': 'Hide transcript',
  'callTranscript.title': 'Call transcript',
  'callTranscript.loading': 'Loading transcript…',
  'callTranscript.empty': 'No transcript for this call',
  'callTranscript.error': 'Transcript unavailable',
  'callTranscript.retry': 'Try again',
  'callTranscript.showOriginal': 'Show original',
  'callTranscript.showTranslated': 'Show translation',
} as const;

export default enCallCaptions;

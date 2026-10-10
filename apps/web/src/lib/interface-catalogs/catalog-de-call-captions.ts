/**
 * LES SOUS-TITRES D'UN APPEL ET SA TRANSCRIPTION (#8048) — tranche du catalogue,
 * RÉPANDUE par `catalog-de.ts` comme `catalog-de-call-quality.ts` : le bouton
 * Sous-titres de l'écran d'appel, le panneau et son journal
 * (`call-captions-panel.tsx`), la transcription d'après l'appel dans la bulle
 * du fil (`call-transcript-panel.tsx`).
 */
const deCallCaptions = {
  'call.captions.original': 'Originale Untertitel anzeigen',
  'call.captions.invited': 'Untertitel anzeigen — dein Gegenüber liest sie bereits',
  'callCaptions.region': 'Untertitel',
  'callCaptions.waiting': 'Untertitel erscheinen hier, sobald jemand spricht',
  'callCaptions.mode.translated': 'In deine Sprache übersetzt',
  'callCaptions.mode.original': 'In der Originalsprache',
  'callCaptions.listening': 'Deine Stimme wird transkribiert',
  'callCaptions.unsupported': 'Deine Stimme wird auf diesem Gerät nicht transkribiert: Du liest die anderen',
  'callCaptions.denied': 'Spracherkennung abgelehnt: Du liest die anderen',
  'callCaptions.journal.title': 'Anrufprotokoll',
  'callCaptions.participant': 'Teilnehmer',
  'callTranscript.show': 'Transkript',
  'callTranscript.hide': 'Transkript ausblenden',
  'callTranscript.title': 'Transkript des Anrufs',
  'callTranscript.loading': 'Transkript wird geladen…',
  'callTranscript.empty': 'Kein Transkript für diesen Anruf',
  'callTranscript.error': 'Transkript nicht verfügbar',
  'callTranscript.retry': 'Erneut versuchen',
  'callTranscript.showOriginal': 'Original anzeigen',
  'callTranscript.showTranslated': 'Übersetzung anzeigen',
} as const;

export default deCallCaptions;

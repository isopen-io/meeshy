/**
 * LES SOUS-TITRES D'UN APPEL ET SA TRANSCRIPTION (#8048) — tranche du catalogue,
 * RÉPANDUE par `catalog-es.ts` comme `catalog-es-call-quality.ts` : le bouton
 * Sous-titres de l'écran d'appel, le panneau et son journal
 * (`call-captions-panel.tsx`), la transcription d'après l'appel dans la bulle
 * du fil (`call-transcript-panel.tsx`).
 */
const esCallCaptions = {
  'call.captions.original': 'Mostrar subtítulos originales',
  'call.captions.invited': 'Mostrar subtítulos — tu interlocutor ya los está leyendo',
  'callCaptions.region': 'Subtítulos',
  'callCaptions.waiting': 'Los subtítulos aparecen aquí en cuanto alguien habla',
  'callCaptions.mode.translated': 'Traducidos a tu idioma',
  'callCaptions.mode.original': 'En el idioma original',
  'callCaptions.listening': 'Tu voz se está transcribiendo',
  'callCaptions.unsupported': 'Este navegador no transcribe tu voz: lees a los demás',
  'callCaptions.denied': 'Reconocimiento de voz denegado: lees a los demás',
  'callCaptions.journal.show': 'Registro',
  'callCaptions.journal.hide': 'Ocultar el registro',
  'callCaptions.journal.title': 'Registro de la llamada',
  'callCaptions.participant': 'Participante',
  'callTranscript.show': 'Transcripción',
  'callTranscript.hide': 'Ocultar la transcripción',
  'callTranscript.title': 'Transcripción de la llamada',
  'callTranscript.loading': 'Cargando la transcripción…',
  'callTranscript.empty': 'No hay transcripción de esta llamada',
  'callTranscript.error': 'Transcripción no disponible',
  'callTranscript.retry': 'Reintentar',
  'callTranscript.showOriginal': 'Ver el original',
  'callTranscript.showTranslated': 'Ver la traducción',
} as const;

export default esCallCaptions;

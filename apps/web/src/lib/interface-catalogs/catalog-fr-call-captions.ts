/**
 * LES SOUS-TITRES D'UN APPEL ET SA TRANSCRIPTION (#8048) — tranche du catalogue,
 * RÉPANDUE par `catalog-fr.ts` comme `catalog-fr-call-quality.ts` : le bouton
 * Sous-titres de l'écran d'appel, le panneau et son journal
 * (`call-captions-panel.tsx`), la transcription d'après l'appel dans la bulle
 * du fil (`call-transcript-panel.tsx`).
 */
const frCallCaptions = {
  'call.captions.original': 'Afficher les sous-titres originaux',
  'call.captions.invited': 'Afficher les sous-titres — votre interlocuteur les lit déjà',
  'callCaptions.region': 'Sous-titres',
  'callCaptions.waiting': 'Les sous-titres s’affichent ici dès que quelqu’un parle',
  'callCaptions.mode.translated': 'Traduits dans votre langue',
  'callCaptions.mode.original': 'Dans la langue d’origine',
  'callCaptions.listening': 'Votre voix est transcrite',
  'callCaptions.unsupported': 'Ce navigateur ne transcrit pas votre voix : vous lisez les autres',
  'callCaptions.denied': 'Reconnaissance vocale refusée : vous lisez les autres',
  'callCaptions.journal.title': 'Journal de l’appel',
  'callCaptions.participant': 'Participant',
  'callTranscript.show': 'Transcription',
  'callTranscript.hide': 'Masquer la transcription',
  'callTranscript.title': 'Transcription de l’appel',
  'callTranscript.loading': 'Chargement de la transcription…',
  'callTranscript.empty': 'Aucune transcription pour cet appel',
  'callTranscript.error': 'Transcription indisponible',
  'callTranscript.retry': 'Réessayer',
  'callTranscript.showOriginal': 'Voir l’original',
  'callTranscript.showTranslated': 'Voir la traduction',
} as const;

export default frCallCaptions;

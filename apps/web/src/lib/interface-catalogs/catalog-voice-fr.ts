/**
 * LA VOIX (#16419), FRANÇAIS — la SOURCE des clés `voice.*` : la section Réglages › Voix et la note
 * sous mon propre vocal. Hors du catalogue d'interface, arrivé à son plafond :
 * chargé à la demande (`i18n-voice-catalog.ts`), jamais au démarrage.
 */
const fr = {
  'voice.title': 'Voix',
  'voice.intro': 'Ce que Meeshy fait de vos messages vocaux. Chaque droit se retire à tout moment.',
  'voice.transcription': 'Transcrire mes vocaux',
  'voice.transcription.info': 'Vos messages vocaux sont convertis en texte, lisible et traduisible par chacun.',
  'voice.translation': 'Traduire mes vocaux',
  'voice.translation.info': 'Vos messages vocaux sont réécoutés dans la langue de chaque destinataire.',
  'voice.cloning': 'Cloner ma voix',
  'voice.cloning.info': 'Les traductions audio de vos messages utilisent votre propre voix.',
  'voice.loading': 'Lecture de vos droits vocaux…',
  'voice.unavailable': 'Impossible de lire vos droits vocaux.',
  'voice.retry': 'Réessayer',
  'voice.notice.message': 'Activez le consentement vocal pour que vos messages audio soient transcrits et traduits.',
  'voice.notice.action': 'Activer dans les Réglages',
} as const;

export default fr;

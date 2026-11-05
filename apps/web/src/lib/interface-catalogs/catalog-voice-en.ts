/**
 * LA VOIX (#16419), ANGLAIS : la section Réglages › Voix et la note
 * sous mon propre vocal. Hors du catalogue d'interface, arrivé à son plafond :
 * chargé à la demande (`i18n-voice-catalog.ts`), jamais au démarrage.
 */
import type { VoiceCatalog } from '../i18n-voice-catalog';

const en = {
  'voice.title': 'Voice',
  'voice.intro': 'What Meeshy does with your voice messages. Each permission can be withdrawn at any time.',
  'voice.transcription': 'Transcribe my voice messages',
  'voice.transcription.info': 'Your voice messages are turned into text that everyone can read and translate.',
  'voice.translation': 'Translate my voice messages',
  'voice.translation.info': 'Your voice messages can be heard in each recipient’s language.',
  'voice.cloning': 'Clone my voice',
  'voice.cloning.info': 'Audio translations of your messages use your own voice.',
  'voice.loading': 'Reading your voice permissions…',
  'voice.unavailable': 'Unable to read your voice permissions.',
  'voice.retry': 'Try again',
  'voice.notice.message': 'Enable voice consent so your audio messages are transcribed and translated.',
  'voice.notice.action': 'Enable in Settings',
} as const satisfies VoiceCatalog;

export default en;

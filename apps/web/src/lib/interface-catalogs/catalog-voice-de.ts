/**
 * LA VOIX (#16419), ALLEMAND : la section Réglages › Voix et la note
 * sous mon propre vocal. Hors du catalogue d'interface, arrivé à son plafond :
 * chargé à la demande (`i18n-voice-catalog.ts`), jamais au démarrage.
 */
import type { VoiceCatalog } from '../i18n-voice-catalog';

const de = {
  'voice.title': 'Stimme',
  'voice.intro': 'Was Meeshy mit deinen Sprachnachrichten macht. Jede Erlaubnis lässt sich jederzeit widerrufen.',
  'voice.transcription': 'Meine Sprachnachrichten transkribieren',
  'voice.transcription.info': 'Deine Sprachnachrichten werden in Text umgewandelt, den alle lesen und übersetzen können.',
  'voice.translation': 'Meine Sprachnachrichten übersetzen',
  'voice.translation.info': 'Deine Sprachnachrichten sind in der Sprache jedes Empfängers zu hören.',
  'voice.cloning': 'Meine Stimme klonen',
  'voice.cloning.info': 'Audio-Übersetzungen deiner Nachrichten verwenden deine eigene Stimme.',
  'voice.loading': 'Deine Spracheinwilligungen werden gelesen…',
  'voice.unavailable': 'Deine Spracheinwilligungen können nicht gelesen werden.',
  'voice.retry': 'Erneut versuchen',
  'voice.notice.message': 'Aktiviere die Sprach-Einwilligung, damit deine Sprachnachrichten transkribiert und übersetzt werden.',
  'voice.notice.action': 'In Einstellungen aktivieren',
} as const satisfies VoiceCatalog;

export default de;

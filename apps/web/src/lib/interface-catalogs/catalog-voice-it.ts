/**
 * LA VOIX (#16419), ITALIEN : la section Réglages › Voix et la note
 * sous mon propre vocal. Hors du catalogue d'interface, arrivé à son plafond :
 * chargé à la demande (`i18n-voice-catalog.ts`), jamais au démarrage.
 */
import type { VoiceCatalog } from '../i18n-voice-catalog';

const it = {
  'voice.title': 'Voce',
  'voice.intro': 'Cosa fa Meeshy con i tuoi messaggi vocali. Ogni permesso si può revocare in qualsiasi momento.',
  'voice.transcription': 'Trascrivi i miei vocali',
  'voice.transcription.info': 'I tuoi messaggi vocali vengono convertiti in testo che tutti possono leggere e tradurre.',
  'voice.translation': 'Traduci i miei vocali',
  'voice.translation.info': 'I tuoi messaggi vocali si ascoltano nella lingua di ogni destinatario.',
  'voice.cloning': 'Clona la mia voce',
  'voice.cloning.info': 'Le traduzioni audio dei tuoi messaggi usano la tua voce.',
  'voice.loading': 'Lettura dei tuoi permessi vocali…',
  'voice.unavailable': 'Impossibile leggere i tuoi permessi vocali.',
  'voice.retry': 'Riprova',
  'voice.notice.message': 'Attiva il consenso vocale affinché i tuoi messaggi audio siano trascritti e tradotti.',
  'voice.notice.action': 'Attiva nelle Impostazioni',
} as const satisfies VoiceCatalog;

export default it;

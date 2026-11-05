/**
 * LA VOIX (#16419), ESPAGNOL : la section Réglages › Voix et la note
 * sous mon propre vocal. Hors du catalogue d'interface, arrivé à son plafond :
 * chargé à la demande (`i18n-voice-catalog.ts`), jamais au démarrage.
 */
import type { VoiceCatalog } from '../i18n-voice-catalog';

const es = {
  'voice.title': 'Voz',
  'voice.intro': 'Lo que Meeshy hace con tus mensajes de voz. Puedes retirar cada permiso en cualquier momento.',
  'voice.transcription': 'Transcribir mis mensajes de voz',
  'voice.transcription.info': 'Tus mensajes de voz se convierten en texto que todos pueden leer y traducir.',
  'voice.translation': 'Traducir mis mensajes de voz',
  'voice.translation.info': 'Tus mensajes de voz se escuchan en el idioma de cada destinatario.',
  'voice.cloning': 'Clonar mi voz',
  'voice.cloning.info': 'Las traducciones de audio de tus mensajes usan tu propia voz.',
  'voice.loading': 'Leyendo tus permisos de voz…',
  'voice.unavailable': 'No se pueden leer tus permisos de voz.',
  'voice.retry': 'Reintentar',
  'voice.notice.message': 'Activa el consentimiento de voz para que tus mensajes de audio sean transcritos y traducidos.',
  'voice.notice.action': 'Activar en Ajustes',
} as const satisfies VoiceCatalog;

export default es;

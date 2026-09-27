import type { CallRecordingCatalog } from '@/lib/i18n-call-recording-catalog';

const es = {
  'callRecording.stop': 'Detener la grabación',
  'callRecording.active': 'Grabación en curso',
  'callRecording.waiting': 'Esperando el consentimiento de todos…',
  'callRecording.ask': '{name} quiere grabar la llamada',
  'callRecording.askDetail': 'La grabación solo empieza si todos aceptan, y luego se añade a la conversación.',
  'callRecording.accept': 'Aceptar',
  'callRecording.refuse': 'Rechazar',
  'callRecording.cancel': 'Cancelar',
  'callRecording.someone': 'Un participante',
  'callRecording.stopped.refused': 'Grabación rechazada',
  'callRecording.stopped.timeout': 'No todos respondieron: no hay grabación',
  'callRecording.stopped.joined': 'Alguien se unió a la llamada: grabación detenida',
  'callRecording.stopped.other': 'Grabación detenida',
  'callRecording.unavailable': 'La grabación no está disponible ahora',
  'callRecording.saved': 'La grabación se añadió a la conversación',
  'callRecording.saveFailed': 'No se pudo añadir la grabación',
  'callRecording.close': 'Cerrar',
} satisfies CallRecordingCatalog;

export default es;

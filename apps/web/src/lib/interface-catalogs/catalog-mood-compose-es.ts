import type { MoodComposeCatalog } from '../i18n-mood-compose-catalog';

/** LA CRÉATION D'UNE HUMEUR, ESPAGNOL (#10527) — les clés du français. */
const es = {
  'status.compose.more': 'Más emojis',
  'status.compose.bare.ask': '¿Publicar tu estado de ánimo sin unas palabras?',
  'status.compose.bare.add': 'Añadir unas palabras',
  'status.compose.bare.publish': 'Publicar igualmente',
  'mood.page.label': 'El estado de ánimo del momento',
  'mood.page.close': 'Cerrar',
  'mood.page.reply.placeholder': 'Responder en privado…',
  'mood.page.reply.send': 'Enviar',
  'mood.page.reply.sent': 'Respuesta enviada',
  'mood.page.reply.open': 'Ver la conversación',
  'mood.page.reply.failed': 'La respuesta no se envió. Inténtalo de nuevo.',
  'mood.page.reply.offline': 'Sin conexión: inténtalo de nuevo cuando estés conectado.',
  'mood.page.gone': 'Este estado de ánimo ya no está disponible.',
  'mood.page.loading': 'Cargando el estado de ánimo',
} as const satisfies MoodComposeCatalog;

export default es;

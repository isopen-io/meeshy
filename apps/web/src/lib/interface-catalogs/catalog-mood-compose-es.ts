import type { MoodComposeCatalog } from '../i18n-mood-compose-catalog';

/** LA CRÉATION D'UNE HUMEUR, ESPAGNOL (#10527) — les clés du français. */
const es = {
  'status.compose.more': 'Más emojis',
  'status.compose.bare.ask': '¿Publicar tu estado de ánimo sin unas palabras?',
  'status.compose.bare.add': 'Añadir unas palabras',
  'status.compose.bare.publish': 'Publicar igualmente',
} as const satisfies MoodComposeCatalog;

export default es;

import type { EmojiPickerCatalog } from '../i18n-emoji-picker-catalog';

/** LA FEUILLE D'EMOJIS, ESPAGNOL (#10531) — les clés du français. */
const es = {
  'emojiPicker.search': 'Buscar un emoji',
  'emojiPicker.search.empty': 'No se encontró ningún emoji',
  'emojiPicker.search.unavailable': 'La búsqueda de emojis no está disponible por ahora.',
  'emojiPicker.loading': 'Cargando emojis…',
  'emojiPicker.failed': 'No se pudieron cargar los emojis.',
  'emojiPicker.retry': 'Reintentar',
  'emojiPicker.categories': 'Categorías de emojis',
  'emojiPicker.section.suggested': 'Sugerencias',
  'emojiPicker.section.recent': 'Usados recientemente',
  'emojiPicker.category.recent': 'Recientes',
  'emojiPicker.category.smileys': 'Caras y emociones',
  'emojiPicker.category.people': 'Personas y gestos',
  'emojiPicker.category.animals': 'Animales y naturaleza',
  'emojiPicker.category.food': 'Comida y bebida',
  'emojiPicker.category.activities': 'Actividades',
  'emojiPicker.category.travel': 'Viajes y lugares',
  'emojiPicker.category.objects': 'Objetos',
  'emojiPicker.category.symbols': 'Símbolos',
  'emojiPicker.category.flags': 'Banderas',
  'emojiPicker.tones': 'Tonos de piel',
  'emojiPicker.tone.default': 'Predeterminado',
  'emojiPicker.tone.light': 'Claro',
  'emojiPicker.tone.medium-light': 'Medio claro',
  'emojiPicker.tone.medium': 'Medio',
  'emojiPicker.tone.medium-dark': 'Medio oscuro',
  'emojiPicker.tone.dark': 'Oscuro',
} as const satisfies EmojiPickerCatalog;

export default es;

import type { EmojiPickerCatalog } from '../i18n-emoji-picker-catalog';

/** LA FEUILLE D'EMOJIS, ITALIEN (#10531) — les clés du français. */
const it = {
  'emojiPicker.search': 'Cerca un’emoji',
  'emojiPicker.search.empty': 'Nessuna emoji trovata',
  'emojiPicker.search.unavailable': 'La ricerca delle emoji non è disponibile al momento.',
  'emojiPicker.loading': 'Caricamento delle emoji…',
  'emojiPicker.failed': 'Non è stato possibile caricare le emoji.',
  'emojiPicker.retry': 'Riprova',
  'emojiPicker.categories': 'Categorie di emoji',
  'emojiPicker.section.suggested': 'Suggerimenti',
  'emojiPicker.section.recent': 'Usate di recente',
  'emojiPicker.category.recent': 'Recenti',
  'emojiPicker.category.smileys': 'Faccine ed emozioni',
  'emojiPicker.category.people': 'Persone e gesti',
  'emojiPicker.category.animals': 'Animali e natura',
  'emojiPicker.category.food': 'Cibo e bevande',
  'emojiPicker.category.activities': 'Attività',
  'emojiPicker.category.travel': 'Viaggi e luoghi',
  'emojiPicker.category.objects': 'Oggetti',
  'emojiPicker.category.symbols': 'Simboli',
  'emojiPicker.category.flags': 'Bandiere',
  'emojiPicker.tones': 'Tonalità della pelle',
  'emojiPicker.tone.default': 'Predefinita',
  'emojiPicker.tone.light': 'Chiara',
  'emojiPicker.tone.medium-light': 'Medio-chiara',
  'emojiPicker.tone.medium': 'Media',
  'emojiPicker.tone.medium-dark': 'Medio-scura',
  'emojiPicker.tone.dark': 'Scura',
} as const satisfies EmojiPickerCatalog;

export default it;

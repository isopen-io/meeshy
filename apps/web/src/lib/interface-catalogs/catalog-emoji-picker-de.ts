import type { EmojiPickerCatalog } from '../i18n-emoji-picker-catalog';

/** LA FEUILLE D'EMOJIS, ALLEMAND (#10531) — les clés du français. */
const de = {
  'emojiPicker.search': 'Emoji suchen',
  'emojiPicker.search.empty': 'Kein Emoji gefunden',
  'emojiPicker.search.unavailable': 'Die Emoji-Suche ist im Moment nicht verfügbar.',
  'emojiPicker.loading': 'Emojis werden geladen …',
  'emojiPicker.failed': 'Die Emojis konnten nicht geladen werden.',
  'emojiPicker.retry': 'Erneut versuchen',
  'emojiPicker.categories': 'Emoji-Kategorien',
  'emojiPicker.section.suggested': 'Vorschläge',
  'emojiPicker.section.recent': 'Zuletzt verwendet',
  'emojiPicker.category.recent': 'Zuletzt',
  'emojiPicker.category.smileys': 'Smileys und Emotionen',
  'emojiPicker.category.people': 'Personen und Gesten',
  'emojiPicker.category.animals': 'Tiere und Natur',
  'emojiPicker.category.food': 'Essen und Trinken',
  'emojiPicker.category.activities': 'Aktivitäten',
  'emojiPicker.category.travel': 'Reisen und Orte',
  'emojiPicker.category.objects': 'Objekte',
  'emojiPicker.category.symbols': 'Symbole',
  'emojiPicker.category.flags': 'Flaggen',
  'emojiPicker.tones': 'Hauttöne',
  'emojiPicker.tone.default': 'Standard',
  'emojiPicker.tone.light': 'Hell',
  'emojiPicker.tone.medium-light': 'Mittelhell',
  'emojiPicker.tone.medium': 'Mittel',
  'emojiPicker.tone.medium-dark': 'Mitteldunkel',
  'emojiPicker.tone.dark': 'Dunkel',
} as const satisfies EmojiPickerCatalog;

export default de;

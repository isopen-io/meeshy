import type { EmojiPickerCatalog } from '../i18n-emoji-picker-catalog';

/** LA FEUILLE D'EMOJIS, ANGLAIS (#10531) — les clés du français. */
const en = {
  'emojiPicker.search': 'Search emoji',
  'emojiPicker.search.empty': 'No emoji found',
  'emojiPicker.search.unavailable': 'Emoji search is unavailable right now.',
  'emojiPicker.loading': 'Loading emoji…',
  'emojiPicker.failed': 'The emoji could not be loaded.',
  'emojiPicker.retry': 'Try again',
  'emojiPicker.categories': 'Emoji categories',
  'emojiPicker.section.suggested': 'Suggested',
  'emojiPicker.section.recent': 'Recently used',
  'emojiPicker.category.recent': 'Recent',
  'emojiPicker.category.smileys': 'Smileys and emotion',
  'emojiPicker.category.people': 'People and gestures',
  'emojiPicker.category.animals': 'Animals and nature',
  'emojiPicker.category.food': 'Food and drink',
  'emojiPicker.category.activities': 'Activities',
  'emojiPicker.category.travel': 'Travel and places',
  'emojiPicker.category.objects': 'Objects',
  'emojiPicker.category.symbols': 'Symbols',
  'emojiPicker.category.flags': 'Flags',
  'emojiPicker.tones': 'Skin tones',
  'emojiPicker.tone.default': 'Default',
  'emojiPicker.tone.light': 'Light',
  'emojiPicker.tone.medium-light': 'Medium-light',
  'emojiPicker.tone.medium': 'Medium',
  'emojiPicker.tone.medium-dark': 'Medium-dark',
  'emojiPicker.tone.dark': 'Dark',
} as const satisfies EmojiPickerCatalog;

export default en;

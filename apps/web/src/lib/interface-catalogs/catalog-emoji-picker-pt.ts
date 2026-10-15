import type { EmojiPickerCatalog } from '../i18n-emoji-picker-catalog';

/** LA FEUILLE D'EMOJIS, PORTUGAIS (#10531) — les clés du français. */
const pt = {
  'emojiPicker.search': 'Pesquisar um emoji',
  'emojiPicker.search.empty': 'Nenhum emoji encontrado',
  'emojiPicker.search.unavailable': 'A pesquisa de emojis está indisponível no momento.',
  'emojiPicker.loading': 'Carregando emojis…',
  'emojiPicker.failed': 'Não foi possível carregar os emojis.',
  'emojiPicker.retry': 'Tentar novamente',
  'emojiPicker.categories': 'Categorias de emojis',
  'emojiPicker.section.suggested': 'Sugestões',
  'emojiPicker.section.recent': 'Usados recentemente',
  'emojiPicker.category.recent': 'Recentes',
  'emojiPicker.category.smileys': 'Carinhas e emoções',
  'emojiPicker.category.people': 'Pessoas e gestos',
  'emojiPicker.category.animals': 'Animais e natureza',
  'emojiPicker.category.food': 'Comida e bebida',
  'emojiPicker.category.activities': 'Atividades',
  'emojiPicker.category.travel': 'Viagens e lugares',
  'emojiPicker.category.objects': 'Objetos',
  'emojiPicker.category.symbols': 'Símbolos',
  'emojiPicker.category.flags': 'Bandeiras',
  'emojiPicker.tones': 'Tons de pele',
  'emojiPicker.tone.default': 'Padrão',
  'emojiPicker.tone.light': 'Claro',
  'emojiPicker.tone.medium-light': 'Médio claro',
  'emojiPicker.tone.medium': 'Médio',
  'emojiPicker.tone.medium-dark': 'Médio escuro',
  'emojiPicker.tone.dark': 'Escuro',
} as const satisfies EmojiPickerCatalog;

export default pt;

/**
 * **LA SEULE FONCTION D'INITIALES** (#12571) — tout avatar, toute pastille, toute
 * fiche l'importe d'ici ; `lib/view/conversation.ts` la ré-exporte pour ses
 * hôtes historiques. Les jumelles locales (profil, communautés, carte de
 * contact, admin) ont été supprimées, et `initials-single-source.test.ts`
 * interdit d'en écrire une nouvelle.
 *
 * Deux lettres, jamais plus : « Amina Diallo » → « AD », « Équipe » → « ÉQ ».
 * Un seul mot rend ses deux premières lettres plutôt qu'une seule, parce
 * qu'une initiale seule dans un cercle de 44 px lit comme une erreur.
 *
 * DES LETTRES, RIEN D'AUTRE (#8131, #8143) — un nom de carnet porte souvent
 * parenthèses, guillemets, emojis ou chiffres : « Théo (foot) » donnait
 * « T( ». Un mot est donc une suite de LETTRES Unicode (latin accentué, arabe,
 * CJK…), la ponctuation et les symboles le séparent sans y entrer. Sans aucune
 * lettre, « ? » — jamais un signe dans le cercle.
 */
const LETTER_WORD = /\p{L}+/gu;

export const letterWordsOf = (name: string): readonly string[] => name.normalize('NFC').match(LETTER_WORD) ?? [];

export const initialsOf = (name: string): string => {
  const words = letterWordsOf(name);
  const [first, second] = words;
  if (first === undefined) return '?';
  if (second === undefined) return [...first].slice(0, 2).join('').toUpperCase();
  return `${[...first][0] ?? ''}${[...second][0] ?? ''}`.toUpperCase();
};

/**
 * L'EXTRAIT D'UN MESSAGE LONG — loi pure, partagée par le web (et donc la
 * coque Android Capacitor) et iOS (miroir Swift, mêmes vecteurs :
 * `packages/shared/fixtures/long-message/excerpt.vectors.json`).
 *
 * Directive porteur 2026-09-26 (#8147) : « le message long qui doit avoir
 * “Lire la suite” affiche toujours moins de sa moitié : lorsqu'un message
 * dépasse la limite, afficher 25 % du contenu uniquement, en coupant
 * toujours au mot ».
 *
 * Contrat, à reproduire À L'IDENTIQUE dans chaque miroir :
 *
 * 1. L'unité est le GRAPHÈME (`Intl.Segmenter` ici, `Character` en Swift) :
 *    un emoji composé, un drapeau, une lettre accentuée décomposée ou le
 *    couple `\r\n` comptent pour UN.
 * 2. `graphèmes ≤ LONG_MESSAGE_THRESHOLD` ⇒ rien n'est tronqué, l'extrait
 *    est le texte entier.
 * 3. Sinon la cible vaut `floor(LONG_MESSAGE_EXCERPT_RATIO × graphèmes)`.
 *    On cherche, de la cible vers le début, le DERNIER graphème séparateur
 *    (`WORD_SEPARATORS`) situé à un indice `i` avec `1 ≤ i ≤ cible` ;
 *    l'extrait est le préfixe `[0, i)` — il se termine donc sur un mot
 *    complet et ne dépasse jamais la cible.
 * 4. On retire de sa fin, tant qu'il en reste, les séparateurs et la
 *    ponctuation d'OUVERTURE (`OPENING_PUNCTUATION`) : un extrait ne finit
 *    jamais sur « ( » ni sur une espace.
 * 5. Aucun séparateur utile (texte CJK sans espace, mot géant, ou préfixe
 *    vidé par l'étape 4) ⇒ coupe brute aux `cible` premiers graphèmes.
 * 6. L'extrait ne porte PAS l'ellipse : l'interface ajoute « … Lire la
 *    suite ». Il reste toujours sous la moitié du texte (cible ≤ n/4).
 *
 * Le texte reçu est le texte SERVI (Prisme) : l'appelant tronque ce qu'il
 * affiche, jamais l'original quand une traduction est servie.
 */

export const LONG_MESSAGE_THRESHOLD = 512;

export const LONG_MESSAGE_EXCERPT_RATIO = 0.25;

export type LongMessageExcerpt = {
  readonly truncated: boolean;
  readonly excerpt: string;
};

/** Espace, tabulation, saut de ligne (LF, CR, CRLF) et espace idéographique. L'espace insécable N'EN EST PAS : elle interdit justement la coupe. */
const WORD_SEPARATORS: ReadonlySet<string> = new Set([' ', '\t', '\n', '\r', '\r\n', '　']);

const OPENING_PUNCTUATION: ReadonlySet<string> = new Set([
  '(', '[', '{', '«', '‹', '“', '‘', '„', '¿', '¡', '「', '『', '（', '【', '《', '〈',
]);

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const graphemesOf = (text: string): readonly string[] =>
  Array.from(segmenter.segment(text), (part) => part.segment);

const isDroppableTail = (grapheme: string): boolean =>
  WORD_SEPARATORS.has(grapheme) || OPENING_PUNCTUATION.has(grapheme);

const lastIndexWhere = (graphemes: readonly string[], matches: (grapheme: string) => boolean): number =>
  graphemes.reduce((found, grapheme, index) => (matches(grapheme) ? index : found), -1);

const trimTail = (graphemes: readonly string[]): readonly string[] =>
  graphemes.slice(0, lastIndexWhere(graphemes, (grapheme) => !isDroppableTail(grapheme)) + 1);

const lastSeparatorAtOrBefore = (graphemes: readonly string[], target: number): number =>
  lastIndexWhere(graphemes.slice(1, target + 1), (grapheme) => WORD_SEPARATORS.has(grapheme)) + 1;

export function longMessageExcerpt(text: string): LongMessageExcerpt {
  const graphemes = graphemesOf(text);
  if (graphemes.length <= LONG_MESSAGE_THRESHOLD) {
    return { truncated: false, excerpt: text };
  }

  const target = Math.floor(LONG_MESSAGE_EXCERPT_RATIO * graphemes.length);
  const boundary = lastSeparatorAtOrBefore(graphemes, target);
  const atWord = boundary > 0 ? trimTail(graphemes.slice(0, boundary)) : [];
  const kept = atWord.length > 0 ? atWord : graphemes.slice(0, target);

  return { truncated: true, excerpt: kept.join('') };
}

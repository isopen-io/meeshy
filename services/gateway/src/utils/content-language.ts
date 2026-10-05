/**
 * LA détection de langue synchrone de la passerelle, pour un contenu dont
 * l'auteur n'a pas déclaré la langue (post, légende, texte alternatif,
 * commentaire, légende d'attachement).
 *
 * Elle vivait en quatre copies, toutes fausses de la même façon : sans le
 * drapeau `u`, `\b` ne voit pas une lettre accentuée comme une lettre, donc
 * le mot portugais `é` se trouvait À L'INTÉRIEUR de « légende », et la
 * première langue qui trouvait un mot gagnait. Ici, un mot n'est un mot
 * qu'entouré de non-lettres Unicode, et c'est la langue qui en trouve le
 * PLUS qui l'emporte. Les adresses, mentions et hashtags ne votent pas.
 */

const SCRIPTS: ReadonlyArray<readonly [string, RegExp]> = [
  ['ar', /[؀-ۿ]/u],
  ['ja', /[぀-ゟ゠-ヿ]/u],
  ['zh', /[一-鿿]/u],
];

const WORDS: ReadonlyArray<readonly [string, ReadonlySet<string>]> = [
  ['fr', new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'au', 'aux', 'de', 'et', 'je', 'tu', 'il', 'elle', 'nous', 'vous', 'est', 'sont', 'avec', 'pour', 'dans', 'sur', 'que', 'qui', 'pas', 'mais', 'ce', 'cette', 'se', 'ma', 'mon', 'mes', 'ton', 'sa', 'son', 'à', 'où', 'très', 'été'])],
  ['es', new Set(['el', 'la', 'los', 'las', 'un', 'una', 'es', 'son', 'con', 'para', 'en', 'que', 'por', 'del', 'como', 'pero', 'más', 'y', 'muy', 'está', 'yo'])],
  ['de', new Set(['der', 'die', 'das', 'ein', 'eine', 'ist', 'sind', 'mit', 'für', 'und', 'ich', 'nicht', 'auf', 'dem', 'den', 'habe', 'auch'])],
  ['pt', new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'é', 'são', 'com', 'para', 'em', 'que', 'por', 'do', 'da', 'não', 'mas', 'vou', 'sei', 'você'])],
];

const NOT_PROSE = /(?:https?:\/\/|www\.)\S+|[@#]\S+/giu;
const WORD = /\p{L}+/gu;

export function detectContentLanguage(text: string): string {
  if (!text) return 'en';
  const script = SCRIPTS.find(([, pattern]) => pattern.test(text));
  if (script) return script[0];

  const words = (text.replace(NOT_PROSE, ' ').toLowerCase().match(WORD) ?? []);
  const scored = WORDS.map(([lang, vocabulary]) => ({
    lang,
    score: words.filter((word) => vocabulary.has(word)).length,
  }));
  const best = scored.reduce((winner, candidate) => (candidate.score > winner.score ? candidate : winner));
  return best.score > 0 ? best.lang : 'en';
}

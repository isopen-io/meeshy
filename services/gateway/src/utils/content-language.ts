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

/**
 * Les mots-outils de chaque langue — articles, prépositions, pronoms,
 * auxiliaires —, les plus fréquents d'un texte ordinaire. L'anglais y manquait
 * (#12332) : une phrase anglaise contenant l'article « a » se lisait
 * portugaise, et le Prisme la traduisait depuis la mauvaise langue source.
 */
const WORDS: ReadonlyArray<readonly [string, ReadonlySet<string>]> = [
  ['fr', new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'au', 'aux', 'de', 'et', 'je', 'tu', 'il', 'elle', 'nous', 'vous', 'est', 'sont', 'avec', 'pour', 'dans', 'sur', 'que', 'qui', 'pas', 'mais', 'ce', 'cette', 'se', 'ma', 'mon', 'mes', 'ton', 'ta', 'sa', 'son', 'à', 'où', 'très', 'été', 'on', 'parce', 'nos', 'bien', 'jusqu'])],
  ['en', new Set(['the', 'a', 'an', 'and', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'this', 'that', 'it', 'you', 'i', 'we', 'they', 'my', 'your', 'not', 'have', 'has', 'will', 'from', 'but', 'or', 'by', 'see', 'should', 'because', 'can', 'much'])],
  ['es', new Set(['el', 'la', 'los', 'las', 'un', 'una', 'es', 'son', 'con', 'para', 'en', 'que', 'por', 'del', 'como', 'pero', 'más', 'y', 'muy', 'está', 'yo', 'nos', 'tu', 'hasta', 'será', 'porque'])],
  ['de', new Set(['der', 'die', 'das', 'ein', 'eine', 'ist', 'sind', 'mit', 'für', 'und', 'ich', 'nicht', 'auf', 'dem', 'den', 'habe', 'auch', 'wir', 'uns', 'im', 'zu', 'zum', 'weil', 'sein', 'wird', 'viel'])],
  ['pt', new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'é', 'são', 'com', 'para', 'em', 'que', 'por', 'do', 'da', 'não', 'mas', 'vou', 'sei', 'você', 'ao', 'eu', 'nos', 'muito', 'até', 'sua', 'porque'])],
  ['it', new Set(['il', 'lo', 'gli', 'di', 'che', 'è', 'per', 'con', 'non', 'sono', 'una', 'un', 'del', 'della', 'nel', 'mi', 'ti', 'ci', 'perché', 'sarà', 'molto', 'al', 'tua'])],
];

/**
 * Le poids d'un mot dans le décompte : partagé par N langues, il ne vaut que
 * 1/N à chacune. Un mot propre à une langue la prouve ; un mot commun à deux
 * (« a », « la », « que ») ne les départage pas.
 */
const SHARE: ReadonlyMap<string, number> = WORDS.reduce((counts, [, vocabulary]) => {
  vocabulary.forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
  return counts;
}, new Map<string, number>());

const NOT_PROSE = /(?:https?:\/\/|www\.)\S+|[@#]\S+/giu;
const WORD = /\p{L}+/gu;

/**
 * La langue que le texte PROUVE, ou `null` quand il ne prouve rien : aucune
 * écriture reconnue, aucun mot de vocabulaire. « Story recette B 9743 r2 »
 * ne contient pas un seul mot connu ; en tirer « en » inventait une langue,
 * et un français devenait sa propre cible de traduction (#9861). Un appelant
 * qui connaît la langue déclarée de l'auteur la préfère à ce silence.
 */
export function measureContentLanguage(text: string): string | null {
  if (!text) return null;
  const script = SCRIPTS.find(([, pattern]) => pattern.test(text));
  if (script) return script[0];

  const words = (text.replace(NOT_PROSE, ' ').toLowerCase().match(WORD) ?? []);
  const scored = WORDS
    .map(([lang, vocabulary]) => ({
      lang,
      score: words.filter((word) => vocabulary.has(word)).reduce((sum, word) => sum + 1 / (SHARE.get(word) ?? 1), 0),
    }))
    .sort((left, right) => right.score - left.score);
  const [best, runnerUp] = scored;
  // Une égalité en tête ne prouve aucune des deux langues.
  return best.score > 0 && best.score - runnerUp.score > 1e-9 ? best.lang : null;
}

export function detectContentLanguage(text: string): string {
  return measureContentLanguage(text) ?? 'en';
}

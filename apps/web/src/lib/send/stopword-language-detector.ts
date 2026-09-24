import { COMPOSE_CONFIDENCE_FLOOR } from './compose-language';
import type { DetectedLanguage } from './compose-language';

/**
 * L'HEURISTIQUE LOCALE (#5828, Q1) — jamais `tinyld` (33 485 octets gzip -9
 * mesurés, `node_modules/.bun/tinyld@1.3.4/node_modules/tinyld/dist/tinyld.light.browser.js`,
 * rejeté même à la demande) : deux étages, sans dépendance, chargés en chunk
 * À LA DEMANDE (`language-detector.ts` → `import()` au premier appel).
 *
 * ÉTAGE 1 — ÉCRITURE. Une écriture non latine se reconnaît sans mot-outil :
 * arabe → `ar`, hangeul → `ko`, kana (hiragana/katakana, même mêlé à des
 * sinogrammes — le mélange EST le japonais) → `ja`, han SANS kana → `zh`.
 * Confiance 1 dès DEUX caractères de l'écriture — un seul caractère isolé
 * (un emoji mal classé, une puce) ne suffit pas à trancher.
 *
 * ÉTAGE 2 — LATIN. Les SIX langues latines de la liste rapide iOS
 * (`LanguageData.swift:160`, `quickTranslationCodes`) : fr, en, es, de, it,
 * pt. Chaque mot du texte (minuscules, ponctuation retirée) est cherché dans
 * les SIX tables de mots-outils ; un mot qui figure dans PLUS D'UNE table ne
 * discrimine rien — il est retiré de TOUTES au chargement du module (jamais
 * un `'la'` français qui se compterait aussi pour l'italien). Le verdict est
 * la langue au PLUS de coups, à condition d'en compter au moins DEUX ; en
 * dessous, ou en cas d'égalité, ou sous le plancher de confiance
 * (`COMPOSE_CONFIDENCE_FLOOR`), la fonction rend `null` — SILENCIEUSE quand
 * elle doute, jamais un verdict hasardeux qui verrouillerait la pastille sur
 * une langue fausse.
 *
 * LA DISCIPLINE DES TABLES (revue-correction #5828) — **un mot PARTAGÉ se
 * déclare dans CHAQUE langue qui l'emploie.** La déduplication ci-dessous ne
 * protège que des collisions DÉCLARÉES : un mot que deux langues emploient
 * mais qu'une seule table nomme devient une PREUVE pour celle-là. La
 * première forme laissait `'ma'` à l'italien seul (« ma maison »), `'qui'` au
 * français seul (« qui va là » vs l'italien « qui » = ici) et `'lo'` à
 * l'italien seul (« lo siento ») : autant de traces d'une langue comptées pour
 * une autre. Mieux vaut déclarer TROP (le mot disparaît, on perd un indice)
 * que trop peu (on gagne une preuve fausse).
 *
 * SA PORTÉE, MESURÉE, et elle n'est pas la même pour les six (30 phrases
 * ordinaires, 5 par langue, `stopword-language-detector.test.ts`) : fr 5/5,
 * en 5/5, de 5/5, it 4/5, es 3/5, pt 1/5 — **zéro verdict FAUX**. L'espagnol
 * et surtout le portugais partagent l'essentiel de leurs mots-outils avec
 * leurs voisins : ce qui reste pour les distinguer est rare, et une phrase
 * courte n'atteint pas les DEUX coups exigés. Ce plancher est VOULU — abaisser
 * `LATIN_MIN_HITS` achèterait du portugais au prix de verdicts faux, et un
 * message étiqueté d'une langue qu'il ne parle pas corrompt le pipeline NLLB
 * de TOUS ses destinataires (bien pire que le repli sur le rang 1 du Prisme
 * du lecteur, qui est le comportement d'avant #5828). La vraie réponse pour
 * ces deux langues est le détecteur du NAVIGATEUR, dont cette heuristique
 * n'est que le plancher (`language-detector.ts`, la cascade).
 */
type LatinLanguage = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt';

const RAW_STOPWORDS: Readonly<Record<LatinLanguage, readonly string[]>> = {
  fr: [
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'est', 'sont', 'suis', 'je',
    'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'ce', 'cette', 'ces', 'que', 'qui',
    'quoi', 'pour', 'dans', 'avec', 'sans', 'sur', 'sous', 'ne', 'pas', 'plus', 'donc',
    'car', 'très', 'déjà', 'toujours', 'jamais', 'votre', 'notre', 'leur', 'leurs', 'mais',
    'ou', 'où', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'au', 'aux',
    'par', 'comme', 'si', 'tout', 'tous', 'toute', 'toutes', 'peut', 'peux', 'veux', 'veut',
    'alors', 'aussi', 'bien', 'encore', 'avant', 'après', 'ai', 'as', 'avez', 'avons',
    'ont', 'été', 'moi', 'toi', 'lui', 'oui', 'non', 'rien', 'chez', 'vers', 'depuis',
    'quand', 'cela', 'ça', 'on', 'se', 'me', 'te',
    // Les ÉLISIONS, découpées en lettres isolées par `wordsOf` (`j’ai` → `j`,
    // `ai`) : `j` et `qu` ne se rencontrent qu'en français parmi les six.
    'j', 'qu',
  ],
  en: [
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'you', 'do', 'does', 'did',
    'we', 'they', 'he', 'she', 'it', 'and', 'but', 'for', 'with', 'without', 'this', 'that',
    'these', 'those', 'not', 'no', 'yes', 'can', 'cannot', 'will', 'would', 'should',
    'could', 'your', 'his', 'her', 'its', 'our', 'their', 'what', 'who', 'where', 'when',
    'why', 'how', 'there', 'here', 'from', 'about', 'into', 'over', 'under', 'some', 'any',
    'all', 'more', 'most', 'just', 'only', 'also', 'very', 'then', 'than', 'have', 'has',
    'had', 'i', 'me', 'my', 'of', 'in', 'on', 'at', 'to', 'so', 'as', 'before', 'after',
    'because', 'already',
  ],
  es: [
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'de', 'del', 'al',
    'es', 'son', 'estoy', 'está', 'están', 'yo', 'tú', 'él', 'ella', 'nosotros', 'vosotros',
    'ellos', 'ellas', 'que', 'quien', 'quién', 'donde', 'dónde', 'qué', 'cómo', 'cuándo',
    'cuánto', 'cuál', 'para', 'por', 'con', 'sin', 'sobre', 'pero', 'sino', 'porque', 'muy',
    'también', 'ya', 'siempre', 'nunca', 'nuestro', 'vuestro', 'su', 'sus', 'mi', 'mis',
    'tu', 'tus', 'más', 'menos', 'cuando', 'como', 'todo', 'todos', 'hay', 'ha', 'tiene',
    'tengo', 'hacer', 'puede', 'puedes', 'desde', 'hasta', 'aquí', 'allí', 'entonces',
    'pues', 'hola', 'gracias', 'eso', 'esa', 'ese', 'esta', 'este', 'antes', 'después',
    'nada', 'algo', 'otro', 'otra', 'ahora', 'luego', 'se', 'me', 'te', 'no', 'si', 'nos',
    'a', 'en', 'lo', 'era', 'dos', 'casa', 'mismo', 'aún',
  ],
  de: [
    'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
    'und', 'ist', 'sind', 'bin', 'bist', 'war', 'waren', 'ich', 'du', 'er', 'sie', 'es',
    'wir', 'ihr', 'dass', 'wer', 'wo', 'wie', 'warum', 'für', 'auf', 'an', 'in', 'mit',
    'ohne', 'nicht', 'kein', 'keine', 'aber', 'oder', 'weil', 'wenn', 'sehr', 'auch',
    'schon', 'immer', 'nie', 'unser', 'euer', 'mein', 'dein', 'noch', 'nur', 'mehr',
    'dann', 'als', 'habe', 'hat', 'haben', 'hatte', 'kann', 'kannst', 'können', 'muss',
    'soll', 'sein', 'ihre', 'vor', 'nach', 'bei', 'zu', 'zum', 'zur', 'dort', 'hier',
    'so', 'um', 'uns', 'heute', 'morgen', 'wieder', 'etwas', 'nichts', 'man', 'jetzt',
  ],
  it: [
    'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'e', 'è', 'sono', 'sei', 'io',
    'tu', 'lui', 'lei', 'noi', 'voi', 'loro', 'che', 'chi', 'dove', 'per', 'su', 'non',
    'ma', 'però', 'perché', 'se', 'molto', 'anche', 'già', 'sempre', 'mai', 'nostro',
    'vostro', 'suo', 'sua', 'mio', 'tuo', 'tua', 'del', 'della', 'dei', 'delle', 'nel',
    'nella', 'con', 'senza', 'come', 'tutto', 'tutti', 'più', 'meno', 'quando', 'quello',
    'questa', 'questo', 'ho', 'hai', 'ha', 'abbiamo', 'hanno', 'posso', 'puoi', 'prima',
    'dopo', 'niente', 'qualcosa', 'adesso', 'poi', 'bene', 'male', 'ad', 'ci', 'si', 'ne',
    'mi', 'ti', 'da', 'al', 'a', 'o', 'no', 'me', 'te', 'qui', 'era', 'casa', 'ancora',
    'cosa', 'sì',
  ],
  pt: [
    'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'e', 'é', 'são', 'sou', 'és', 'eu',
    'ele', 'ela', 'nós', 'vós', 'eles', 'elas', 'que', 'quem', 'onde', 'para', 'por',
    'com', 'sem', 'sobre', 'não', 'mas', 'porque', 'se', 'muito', 'também', 'já', 'sempre',
    'nunca', 'nosso', 'vosso', 'seu', 'meu', 'teu', 'tua', 'sua', 'da', 'dos', 'das', 'no',
    'na', 'nos', 'nas', 'como', 'tudo', 'todos', 'há', 'tem', 'tenho', 'fazer', 'pode',
    'podes', 'até', 'aqui', 'então', 'pois', 'mais', 'antes', 'depois', 'nada', 'algo',
    'outro', 'outra', 'agora', 'logo', 'isso', 'essa', 'esse', 'esta', 'este', 'estou',
    'está', 'estão', 'fui', 'foi', 'ser', 'em', 'pelo', 'pela', 'ao', 'aos', 'mesmo',
    'ainda', 'me', 'te', 'era', 'dois', 'casa', 'coisa',
  ],
};

/**
 * Un mot qui figure dans plus d'une table brute ne discrimine RIEN — il est
 * retiré de toutes, une fois pour toutes, au chargement du module. Construit
 * ainsi plutôt qu'à la main : ajouter un mot à une table ne peut jamais créer
 * une collision silencieuse qu'aucun témoin ne verrait.
 */
function buildDiscriminatingSets(
  raw: Readonly<Record<LatinLanguage, readonly string[]>>,
): Readonly<Record<LatinLanguage, ReadonlySet<string>>> {
  const languagesByWord = new Map<string, number>();
  for (const words of Object.values(raw)) {
    for (const word of new Set(words)) languagesByWord.set(word, (languagesByWord.get(word) ?? 0) + 1);
  }
  const result = {} as Record<LatinLanguage, ReadonlySet<string>>;
  for (const [language, words] of Object.entries(raw) as [LatinLanguage, readonly string[]][]) {
    result[language] = new Set(words.filter((w) => languagesByWord.get(w) === 1));
  }
  return result;
}

const STOPWORD_SETS = buildDiscriminatingSets(RAW_STOPWORDS);
const LATIN_LANGUAGES = Object.keys(RAW_STOPWORDS) as readonly LatinLanguage[];

/** Compte les caractères d'une plage Unicode — jamais les GRAPHÈMES : une
 * plage de script se teste caractère par caractère (BMP suffit pour arabe,
 * kana, hangeul, han). */
function countInRange(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

const ARABIC = /[؀-ۿ]/g;
const KANA = /[぀-ヿ]/g;
const HANGUL = /[가-힣]/g;
const HAN = /[一-鿿]/g;

/** Minimum de caractères d'une écriture pour trancher — un seul caractère
 * isolé (glyphe mal classé, symbole) ne suffit pas. */
const SCRIPT_MIN_CHARS = 2;

function detectByScript(text: string): DetectedLanguage | null {
  if (countInRange(text, HANGUL) >= SCRIPT_MIN_CHARS) return { language: 'ko', confidence: 1 };
  // Le mélange kana + han EST le japonais — la présence de kana tranche avant
  // tout comptage de sinogrammes.
  if (countInRange(text, KANA) >= SCRIPT_MIN_CHARS) return { language: 'ja', confidence: 1 };
  if (countInRange(text, ARABIC) >= SCRIPT_MIN_CHARS) return { language: 'ar', confidence: 1 };
  if (countInRange(text, HAN) >= SCRIPT_MIN_CHARS) return { language: 'zh', confidence: 1 };
  return null;
}

function wordsOf(text: string): readonly string[] {
  return text.toLowerCase().match(/\p{L}+/gu) ?? [];
}

/** Minimum de coups pour qu'une langue latine soit CRÉDIBLE — un mot-outil
 * isolé (« je vois ») ne suffit pas. */
const LATIN_MIN_HITS = 2;

function detectByStopwordsLatin(text: string): DetectedLanguage | null {
  const scores: Partial<Record<LatinLanguage, number>> = {};
  for (const word of wordsOf(text)) {
    for (const language of LATIN_LANGUAGES) {
      if (STOPWORD_SETS[language].has(word)) {
        scores[language] = (scores[language] ?? 0) + 1;
        break; // un mot ne discrimine jamais deux langues (déjà garanti par buildDiscriminatingSets).
      }
    }
  }
  const ranked = Object.entries(scores) as [LatinLanguage, number][];
  if (ranked.length === 0) return null;

  const total = ranked.reduce((sum, [, count]) => sum + count, 0);
  const [best, bestCount] = ranked.reduce((max, entry) => (entry[1] > max[1] ? entry : max));
  const runnerUp = ranked.filter(([language]) => language !== best).reduce((max, [, c]) => Math.max(max, c), 0);

  if (bestCount < LATIN_MIN_HITS) return null;
  if (runnerUp === bestCount) return null; // égalité ⇒ doute, jamais un verdict au hasard.

  const confidence = bestCount / total;
  if (confidence < COMPOSE_CONFIDENCE_FLOOR) return null;
  return { language: best, confidence };
}

/**
 * LE POINT D'ENTRÉE — écriture d'abord (elle ne peut pas se tromper de
 * famille latine/non-latine), mots-outils ensuite. `synchrone` : aucun appel
 * réseau, aucune promesse — c'est `language-detector.ts` qui l'enveloppe en
 * `Promise` pour respecter le port `LanguageDetector` partagé avec
 * l'adaptateur navigateur.
 */
export function detectByStopwords(text: string): DetectedLanguage | null {
  return detectByScript(text) ?? detectByStopwordsLatin(text);
}

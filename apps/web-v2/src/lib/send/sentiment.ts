/**
 * LA TONALITÉ DU MESSAGE — miroir PUR de `TextAnalyzer.computeSentiment`/
 * `SentimentLevel` (`packages/MeeshySDK/Sources/MeeshyUI/Utilities/TextAnalyzer.swift`) :
 * MÊMES sept niveaux, MÊMES sept emojis, MÊMES seuils, MÊMES dictionnaires
 * (FR/EN/ES/DE). C'est un INDICATEUR PASSIF (§ 1.1 de la spécification
 * #6175 : « c'était un Button dont l'action se limitait à un retour
 * haptique… rendu passif ») — cette loi ne fait QUE calculer un niveau, la
 * rangée haute (`composer-top-row.tsx`) le rend en LECTURE SEULE.
 */
export type SentimentLevel =
  | 'veryNegative'
  | 'negative'
  | 'slightlyNegative'
  | 'neutral'
  | 'slightlyPositive'
  | 'positive'
  | 'veryPositive';

/** `SentimentLevel.emoji` (`TextAnalyzer.swift:11-19`). */
export const SENTIMENT_EMOJI: Readonly<Record<SentimentLevel, string>> = {
  veryNegative: '\u{1F621}',
  negative: '\u{1F620}',
  slightlyNegative: '\u{1F615}',
  neutral: '\u{1F610}',
  slightlyPositive: '\u{1F642}',
  positive: '\u{1F60A}',
  veryPositive: '\u{1F929}',
};

/** `SentimentLevel.from(score:)` (`TextAnalyzer.swift:22-31`) — les SIX bornes,
 * dans l'ordre croissant. */
export function sentimentLevelOf(score: number): SentimentLevel {
  if (score < -0.6) return 'veryNegative';
  if (score < -0.3) return 'negative';
  if (score < -0.1) return 'slightlyNegative';
  if (score <= 0.1) return 'neutral';
  if (score < 0.3) return 'slightlyPositive';
  if (score < 0.6) return 'positive';
  return 'veryPositive';
}

/**
 * LES DEUX DICTIONNAIRES (`TextAnalyzer.swift:194-238`) — recopiés MOT POUR
 * MOT (FR/EN/ES/DE) : c'est de la DONNÉE, pas une logique à réécrire. Toute
 * évolution touche les DEUX fichiers (comme le reste des lois dupliquées de
 * ce dépôt, `packages/shared` mis à part).
 */
const POSITIVE_WORDS: Readonly<Record<string, number>> = {
  love: 0.8, amazing: 0.7, great: 0.6, awesome: 0.7, excellent: 0.7,
  wonderful: 0.7, fantastic: 0.7, beautiful: 0.6, happy: 0.6, good: 0.4,
  nice: 0.4, best: 0.6, perfect: 0.7, thanks: 0.4, thank: 0.4,
  cool: 0.4, brilliant: 0.7, superb: 0.7, glad: 0.5, enjoy: 0.5,
  fun: 0.5, like: 0.3, yes: 0.2, wow: 0.5, bravo: 0.6,
  incredible: 0.7, outstanding: 0.7, delightful: 0.6, pleased: 0.5,
  magnifique: 0.7, super: 0.6, genial: 0.7, adore: 0.8, aime: 0.6,
  merci: 0.4, bien: 0.4, bon: 0.4, bonne: 0.4, parfait: 0.7,
  incroyable: 0.7, formidable: 0.7, heureux: 0.6, heureuse: 0.6,
  contente: 0.5, joie: 0.6, chouette: 0.5, top: 0.5,
  sublime: 0.7, fantastique: 0.7, bisous: 0.5,
  gracias: 0.4, bueno: 0.4, buena: 0.4, excelente: 0.7, maravilloso: 0.7,
  increible: 0.7, perfecto: 0.7, feliz: 0.6, amor: 0.7,
  amigo: 0.4, amiga: 0.4, hermoso: 0.6, hermosa: 0.6, fantastico: 0.7,
  danke: 0.4, gut: 0.4, toll: 0.6, wunderbar: 0.7, fantastisch: 0.7,
  schon: 0.5, liebe: 0.7, freude: 0.6, prima: 0.5, perfekt: 0.7,
  ausgezeichnet: 0.7, herrlich: 0.6,
};

const NEGATIVE_WORDS: Readonly<Record<string, number>> = {
  hate: -0.8, terrible: -0.7, awful: -0.7, horrible: -0.7, bad: -0.5,
  worst: -0.7, ugly: -0.6, stupid: -0.6, angry: -0.5, sad: -0.5,
  annoying: -0.5, boring: -0.4, disgusting: -0.7, pathetic: -0.6,
  useless: -0.6, trash: -0.6, no: -0.2, never: -0.3, wrong: -0.4,
  fail: -0.5, sucks: -0.6, disappointed: -0.5, frustrating: -0.5,
  nul: -0.6, nulle: -0.6, deteste: -0.8, mauvais: -0.5,
  mauvaise: -0.5, moche: -0.5, triste: -0.5, colere: -0.5, ennuyeux: -0.4,
  degoutant: -0.7, pourri: -0.6, pire: -0.6, honte: -0.5, stupide: -0.6,
  imbecile: -0.7, idiot: -0.6, merde: -0.7, chiant: -0.5, galere: -0.4,
  enervant: -0.5, lamentable: -0.6,
  malo: -0.5, mala: -0.5, odio: -0.8,
  feo: -0.5, fea: -0.5, estupido: -0.6, basura: -0.6,
  peor: -0.6, horroroso: -0.7,
  schlecht: -0.5, schrecklich: -0.7, furchtbar: -0.7, hass: -0.8,
  hasslich: -0.6, dumm: -0.6, langweilig: -0.4, ekelhaft: -0.7,
  traurig: -0.5,
};

/**
 * `computeSentiment` (`TextAnalyzer.swift:186-192`) — retire la ponctuation
 * en bordure de mot, minuscules, moyenne des poids × 2, bornée [-1, 1].
 * Texte vide ⇒ 0 (neutre), MÊME repli que côté iOS.
 */
export function computeSentimentScore(text: string): number {
  const words = text
    .toLowerCase()
    .split(/\s+/u)
    .map((w) => w.replace(/^[\p{P}]+|[\p{P}]+$/gu, ''))
    .filter((w) => w.length > 0);
  if (words.length === 0) return 0;

  let score = 0;
  for (const word of words) {
    if (word in POSITIVE_WORDS) score += POSITIVE_WORDS[word]!;
    else if (word in NEGATIVE_WORDS) score += NEGATIVE_WORDS[word]!;
  }
  return Math.max(-1, Math.min(1, (score / words.length) * 2));
}

/** Texte vidé ⇒ `neutral` (`analyze(text:)`, `TextAnalyzer.swift:104-110`
 * — la sortie du texte vidé, PAS le verrou de langue, qui n'a pas d'analogue
 * ici). */
export function sentimentOf(text: string): SentimentLevel {
  if (text.trim() === '') return 'neutral';
  return sentimentLevelOf(computeSentimentScore(text));
}

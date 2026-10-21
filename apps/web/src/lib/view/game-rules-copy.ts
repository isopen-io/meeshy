import { PROGRESSION_CONCEPTS, type ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import { translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

/**
 * LES HUIT RÈGLES DU CARNET (#9379, #9542) — à part du guide de Mee et Meo
 * (`game-guide-copy.ts`) : le guide se lit sur Progression, les règles sur la
 * seule page « Comment ça marche », et leurs textes vivent dans la partie
 * `rules` du catalogue, que Progression ne charge pas. Dans le même fichier, le
 * guide aurait eu l'air de lire des clés que sa route ne télécharge pas.
 */
type Language = InterfaceLanguage;

export type GameRule = { readonly index: number; readonly title: string; readonly body: string };

/** Les huit règles en une page (conception, partie I) — le carnet que le joueur retrouve. */
export function gameRules(language: Language = currentInterfaceLanguage()): readonly GameRule[] {
  return [
    { index: 1, title: translateGame(language, 'game.rules.1.title'), body: translateGame(language, 'game.rules.1.body') },
    { index: 2, title: translateGame(language, 'game.rules.2.title'), body: translateGame(language, 'game.rules.2.body') },
    { index: 3, title: translateGame(language, 'game.rules.3.title'), body: translateGame(language, 'game.rules.3.body') },
    { index: 4, title: translateGame(language, 'game.rules.4.title'), body: translateGame(language, 'game.rules.4.body') },
    { index: 5, title: translateGame(language, 'game.rules.5.title'), body: translateGame(language, 'game.rules.5.body') },
    { index: 6, title: translateGame(language, 'game.rules.6.title'), body: translateGame(language, 'game.rules.6.body') },
    { index: 7, title: translateGame(language, 'game.rules.7.title'), body: translateGame(language, 'game.rules.7.body') },
    { index: 8, title: translateGame(language, 'game.rules.8.title'), body: translateGame(language, 'game.rules.8.body') },
  ];
}

/**
 * « CHAQUE CONCEPT, EN CLAIR » (#10540) — aucun concept que Progression affiche n'est absent du carnet.
 * Les quinze concepts de la liste partagée (`PROGRESSION_CONCEPTS`), et ce que Progression montre sans
 * en faire une fiche : le coffre, le trésor, les étapes des niveaux, le Vent arrière, la mission en duo.
 * Chaque entrée dit ce que c'est, à quoi ça sert, comment ça se gagne et comment s'en servir.
 *
 * Rangés à la suite du concept qu'ils complètent : le coffre après les missions, le duo après la saison.
 * Un concept ajouté à la liste partagée sans entrée ici est une erreur de compilation (`EXTRAS_AFTER`).
 */
const GLOSSARY_EXTRAS = ['chest', 'treasury', 'steps', 'tailwind', 'duo'] as const;

export type RulesGlossaryKey = ProgressionConcept | (typeof GLOSSARY_EXTRAS)[number];

const EXTRAS_AFTER: Readonly<Record<ProgressionConcept, readonly (typeof GLOSSARY_EXTRAS)[number][]>> = {
  level: ['steps'],
  points: [],
  meesh: ['treasury'],
  glory: [],
  flame: [],
  missions: ['chest'],
  league: [],
  season: ['duo'],
  prestige: [],
  elans: ['tailwind'],
  badges: [],
  defis: [],
  succes: [],
  showcase: [],
  atlas: [],
};

export const RULES_GLOSSARY: readonly RulesGlossaryKey[] = PROGRESSION_CONCEPTS.flatMap((concept) => [concept, ...EXTRAS_AFTER[concept]]);

export type RulesGlossaryEntry = { readonly key: RulesGlossaryKey; readonly name: string; readonly body: string };

export const rulesGlossary = (language: Language = currentInterfaceLanguage()): readonly RulesGlossaryEntry[] =>
  RULES_GLOSSARY.map((key) => ({
    key,
    name: translateGame(language, `game.rules.concept.${key}.name`),
    body: translateGame(language, `game.rules.concept.${key}.body`),
  }));

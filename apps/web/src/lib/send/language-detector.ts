import type { DetectedLanguage } from './compose-language';

/**
 * LE PORT (#5828, Q1) — un détecteur de langue, quel qu'il soit. Deux
 * adaptateurs : `browserLanguageDetector` (l'API native, seulement si DÉJÀ
 * disponible) et l'heuristique de secours (`stopword-language-detector.ts`,
 * chargée en chunk à la demande — voir `defaultLanguageDetector` ci-dessous).
 */
export type LanguageDetector = {
  readonly detect: (text: string) => Promise<DetectedLanguage | null>;
};

/** La forme (partielle, la seule qui sert ici) de l'API expérimentale
 * `LanguageDetector` du navigateur (Chrome — Prompt/Translator APIs). */
type BrowserLanguageDetectorApi = {
  availability: () => Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create: () => Promise<{
    detect: (text: string) => Promise<readonly { readonly detectedLanguage: string; readonly confidence: number }[]>;
  }>;
};

function browserApi(): BrowserLanguageDetectorApi | null {
  const api = (globalThis as { readonly LanguageDetector?: BrowserLanguageDetectorApi }).LanguageDetector;
  return api ?? null;
}

/**
 * L'ADAPTATEUR NAVIGATEUR — `null` si l'API est absente, ou si elle existe
 * mais n'est pas DÉJÀ prête (`availability() !== 'available'`) : jamais
 * déclencher un téléchargement de modèle depuis un simple champ de saisie.
 * L'instance créée par `create()` est MÉMOÏSÉE — un seul appel pour toute la
 * durée de vie de la page, pas un par frappe. Toute erreur (création ou
 * détection) est avalée en `null` : un détecteur qui tombe ne casse jamais
 * la frappe (`dispatch`-style, `perform-send.ts`).
 */
export function browserLanguageDetector(): LanguageDetector | null {
  const api = browserApi();
  if (api === null) return null;

  let instance: Promise<{
    detect: (text: string) => Promise<readonly { readonly detectedLanguage: string; readonly confidence: number }[]>;
  }> | null = null;

  return {
    async detect(text: string): Promise<DetectedLanguage | null> {
      try {
        const availability = await api.availability();
        if (availability !== 'available') return null;
        if (instance === null) instance = api.create();
        const detector = await instance;
        const results = await detector.detect(text);
        const best = results[0];
        if (best === undefined || best.detectedLanguage === 'und') return null;
        return { language: best.detectedLanguage, confidence: best.confidence };
      } catch {
        return null;
      }
    },
  };
}

/**
 * LE DÉFAUT — une CASCADE à deux étages, jamais un pari sur le premier.
 *
 * 1. Le navigateur, s'il rend un verdict (API présente ET déjà `available`).
 * 2. L'heuristique locale EN CHUNK À LA DEMANDE (`import()` au premier appel
 *    seulement, jamais au chargement du fil : `budgets.json` compte ce chunk
 *    séparément, § 7 de la spécification #5828), pour TOUT le reste — API
 *    absente, modèle pas encore téléchargé (`'downloadable'`, l'état NOMINAL
 *    de Chrome tant que personne n'a payé le téléchargement), sonde en
 *    erreur, ou verdict `und`. Un seul module chargé pour toute la durée de
 *    vie de la page.
 *
 * POURQUOI LA CASCADE, ET PAS « le navigateur s'il existe » (revue-correction) :
 * l'adaptateur navigateur rend `null` tant que le modèle n'est pas prêt — le
 * rendre SEUL laissait l'app sans AUCUNE détection, en silence, sur le
 * navigateur même de la recette. Un second étage qui coûte 1,16 Ko à la
 * demande vaut mieux qu'une feature muette : c'est le motif « le mécanisme
 * est écrit, testé, et jamais activé » que ce dépôt a déjà payé.
 */
export function defaultLanguageDetector(): LanguageDetector {
  const browser = browserLanguageDetector();

  let heuristic: Promise<typeof import('./stopword-language-detector')> | null = null;
  const byHeuristic = async (text: string): Promise<DetectedLanguage | null> => {
    heuristic ??= import('./stopword-language-detector');
    const { detectByStopwords } = await heuristic;
    return detectByStopwords(text);
  };

  if (browser === null) return { detect: byHeuristic };
  return { detect: async (text: string) => (await browser.detect(text)) ?? byHeuristic(text) };
}

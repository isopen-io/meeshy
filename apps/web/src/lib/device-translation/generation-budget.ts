/**
 * **LE BUDGET DE JETONS D'UNE TRADUCTION** — la borne que le serveur pose
 * depuis #9309 (`services/translator/src/utils/generation_guard.py`),
 * reprise à l'identique sur l'appareil : NLLB part en boucle sur le peul et
 * le wolof, et un téléphone qui génère 256 jetons pour un « merci » chauffe
 * pour rien. `generation-budget.test.ts` relit les constantes du serveur.
 */
export const GENERATION_CEILING = 256;
export const GENERATION_FLOOR = 16;
export const TOKENS_PER_SOURCE_TOKEN = 2.5;
export const TOKEN_MARGIN = 10;

export const generationBudget = (sourceTokens: number, ceiling: number = GENERATION_CEILING): number =>
  Math.min(ceiling, Math.max(GENERATION_FLOOR, Math.ceil(TOKENS_PER_SOURCE_TOKEN * sourceTokens + TOKEN_MARGIN)));

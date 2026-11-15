/**
 * L'ORDRE DES SOURCES DE L'ÉTAT DU JEU (#10900), ISOLÉ DE `game-sync.ts` (#10904) — cette seule fonction est ce
 * qu'un client WEB a besoin d'importer pour ne jamais faire reculer son cache (`game-state-order.ts`,
 * `game-state-live.ts`) ; `game-sync.ts` porte en plus `zod` et le bloc complet du jeu (`game.js`, qui entraîne
 * `utils/game/levels.js` et le reste du chunk « game-law »). Une importer dans `query-client.ts` — sur le chemin
 * CRITIQUE de `main.tsx` — tirait les deux dans le premier pixel (budget `first_paint.kb` dépassé).
 *
 * Faut-il appliquer cet état ? Non seulement s'il est STRICTEMENT plus ancien que celui déjà appliqué : à révision
 * égale, les deux états sont équivalents ; une source sans révision (serveur antérieur) s'applique toujours.
 */
export const shouldApplyGameState = (incoming: number | null | undefined, applied: number | null | undefined): boolean =>
  typeof incoming !== 'number' || typeof applied !== 'number' || incoming >= applied;

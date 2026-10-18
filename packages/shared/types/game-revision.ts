/**
 * L'ORDRE DE L'ÉTAT DU JEU (#10900), sans schéma : la loi que `game-sync.ts` énonce, isolée ici parce que le client web
 * la pose dans son cache de requêtes, donc dans la PREMIÈRE PEINTURE. `game-sync.ts` tire zod et le schéma du bloc
 * `game` ; l'importer pour une comparaison de deux nombres y faisait entrer 33 Ko — 124,06 Ko pour un plafond de 92, revenus à 91,39 (recette du 2026-10-18, #10898).
 */

/**
 * Faut-il appliquer cet état ? Non seulement s'il est STRICTEMENT plus ancien que celui déjà appliqué : à révision
 * égale, les deux états sont équivalents ; une source sans révision (serveur antérieur) s'applique toujours.
 */
export const shouldApplyGameState = (incoming: number | null | undefined, applied: number | null | undefined): boolean =>
  typeof incoming !== 'number' || typeof applied !== 'number' || incoming >= applied;

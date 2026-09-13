import { useMemo } from 'react';

/**
 * **LE SECOND TAP D'UN DOUBLE TAP N'ATTEINT AUCUN GESTE** (#6417).
 *
 * Un geste optimiste REMPLACE ce qu'il touche, dans l'image qui suit : la
 * demande refusée quitte la liste et la suivante remonte sous le doigt,
 * « Ajouter » devient « En attente » (qui annule), « Désactiver » devient
 * « Activer ». Le second tap d'un double tap tombe donc sur un AUTRE geste.
 * Mesuré sur la coque tactile avant ce module : deux personnes refusées d'un
 * double tap, une demande envoyée puis annulée, un lien désactivé puis réactivé.
 *
 * La porte retient tout tap posé moins de {@link DOUBLE_TAP_MS} après le tap
 * PRÉCÉDENT, retenu ou non : un triple tap rapide reste un seul geste. 350 ms
 * couvre le délai de double tap d'Android (300) et d'iOS ; deux gestes VOULUS
 * sur deux lignes demandent de déplacer le doigt, bien au-delà.
 *
 * L'instant du dernier tap est l'état de la porte, enfermé dans sa fermeture
 * comme un `useRef` : il ne sort jamais, et chaque écran a la sienne.
 */
export const DOUBLE_TAP_MS = 350;

export function createTapGate(now: () => number): () => boolean {
  let previousAt: number | null = null;
  return () => {
    const at = now();
    const admitted = previousAt === null || at - previousAt >= DOUBLE_TAP_MS;
    previousAt = at;
    return admitted;
  };
}

/** La porte d'UN écran, stable d'un rendu à l'autre. */
export function useTapGate(): () => boolean {
  return useMemo(() => createTapGate(() => performance.now()), []);
}

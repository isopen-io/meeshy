/**
 * LA CLÉ DE CACHE DES RÉELS, SEULE (#7227, W8) — extraite de `reels.ts` pour
 * une raison de POIDS, pas de sens : `REELS_QUERY_ROOT` est désormais lue par
 * le temps réel (`feed-realtime.ts`, `publication-comments.ts`, tous deux
 * atteints depuis `socket.ts`, le chunk `realtime` chargé en `import()`
 * APRÈS la première peinture) EN PLUS de la route `/reels` (chemin
 * SYNCHRONE, depuis `reel-page.tsx` → `use-post-gesture.ts` →
 * `feed-gestures.ts`). `reels.ts` porte tout le RESTE du port (requête
 * réseau, fixtures, pagination) — dès qu'un second chemin ASYNCHRONE
 * l'atteint, Rollup l'extrait en chunk PARTAGÉ, nommé par défaut d'après le
 * fichier (`reels-<hash>.js`) — IDENTIQUE au motif du chunk de la ROUTE
 * (`budgets.json › on_demand_chunks.reels`, qui SOMME tout fichier
 * correspondant). Les deux chunks distincts se comptaient l'un l'autre :
 * mesuré, 6,13 Ko gzip (une route, un fichier) devenaient 9,31 Ko (deux
 * fichiers de même motif) sans qu'une seule ligne du RÉEL n'ait grossi.
 *
 * Ce fichier ne porte QUE la clé — aucune fonction réseau, aucun import de
 * fixtures — pour ne jamais redevenir la cible d'une extraction du même
 * genre : un module sans poids n'inflate aucun budget qui le nomme.
 */
export const REELS_QUERY_ROOT = ['reels'] as const;

export const reelsQueryKey = (seed?: string) => [...REELS_QUERY_ROOT, seed ?? ''] as const;

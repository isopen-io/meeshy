/**
 * L'ÉTAT PUR DES DEUX GESTES DU FIL SOCIAL (`/feed`, #5031) — aimer et
 * reposter, sans DOM et sans réseau : la peinture (`lib/realtime/feed.ts`) lit
 * l'état AVANT dans le document servi, calcule l'état APRÈS avec ces deux
 * fonctions, peint, envoie, et défait sur refus.
 *
 * SÉPARÉ DE `feed.ts` POUR LA MÊME RAISON QUE `liste-etat.ts` L'EST DE
 * `liste.ts` : un module qui touche le DOM s'auto-exécute à l'import
 * (`demarre()`, en bas de `feed.ts`) et n'a donc pas de témoin unitaire
 * pratique — sa preuve est le rendu réel, au navigateur. Ce module-ci n'a
 * aucun effet de bord : il se teste en jsdom comme en Node, sans construire un
 * seul nœud.
 */

export type EtatDAime = {
  readonly actif: boolean;
  /** `likeCount` — jamais négatif : un décompte qui passerait sous zéro dirait un mensonge. */
  readonly compte: number;
};

/** LA BASCULE — aimer si ce n'était pas le cas, retirer sinon. Symétrique, comme la route qu'elle prépare (POST/DELETE). */
export const basculeAime = (etat: EtatDAime): EtatDAime =>
  etat.actif ? { actif: false, compte: Math.max(0, etat.compte - 1) } : { actif: true, compte: etat.compte + 1 };

export type EtatDeRepost = {
  readonly compte: number;
};

/**
 * LE REPOST — À SENS UNIQUE, comme la route qui le porte (`lib/api/
 * publication.ts` › `reposte`, aucune route pour le défaire). Appelée une
 * seule fois par post : l'appelant (`lib/realtime/feed.ts`) ne rend le
 * formulaire de repost QUE tant qu'il n'a pas encore eu lieu.
 */
export const aposteRepost = (etat: EtatDeRepost): EtatDeRepost => ({ compte: etat.compte + 1 });

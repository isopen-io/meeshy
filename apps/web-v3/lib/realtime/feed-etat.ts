import { doitRattraper } from './reconnect-policy';

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

/**
 * ───────────────────────────────────────────────────────────────────────────
 * LA FRAÎCHEUR DU FIL — la règle, séparée du geste qui l'applique (#5031)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * **CE QUE `/feed` NE FAIT TOUJOURS PAS, ET POURQUOI.** Il n'écoute rien
 * d'entrant : un like d'un tiers, une publication neuve d'un ami, un second
 * onglet du même lecteur ne le rafraîchissent pas EN CONTINU. La passerelle
 * diffuse pourtant `post:liked` / `post:created` / `post:updated` sur la feed
 * room, mais importer `socket.io-client` ici coûterait 12 849 o gzip
 * (`budgets-mesures.json` › `participate`) — plus que le module entier, sur
 * l'écran que la directive du porteur destine à la 3G rurale (§ 12.6), et pour
 * une connexion PERMANENTE.
 *
 * **CE QU'IL FAIT DÉSORMAIS : il se rafraîchit AU RETOUR.** C'est la réponse
 * qui manquait à la question 13 du § 11, et elle ne coûte aucune dépendance.
 * Le cas qu'elle couvre est le dominant, et de loin : on quitte l'onglet, on
 * revient dix minutes plus tard, et le fil qu'on retrouve n'est pas celui de
 * tout à l'heure. `GET /sync` n'était pas une option — ses collections sont
 * `conversations`, `messages`, `reactions`, `participants`
 * (`services/gateway/src/routes/sync/budget.ts`), jamais les publications —,
 * et le document `/feed` LUI-MÊME est la réponse fraîche : le serveur reste
 * l'unique compositeur, Prisme compris.
 *
 * **DEUX CONDITIONS, ET LA SECONDE EST LA PLUS IMPORTANTE.**
 */

/**
 * Jusqu'où le lecteur peut avoir défilé sans qu'un rafraîchissement lui
 * ARRACHE ce qu'il lit.
 *
 * **REMPLACER LA LISTE SOUS QUELQU'UN QUI A DÉFILÉ EST PIRE QUE LA LAISSER
 * PÉRIMÉE.** Un fil qui se réécrit sous le doigt fait sauter la lecture, perd
 * la place et donne l'impression d'un bogue — le défaut EXACT que la dimension
 * 4 (fluidité) proscrit. Une personne qui a défilé a CHOISI un endroit ; une
 * personne en tête n'a rien choisi, et le rafraîchissement lui est invisible.
 *
 * La tolérance n'est pas un « presque en haut » : c'est la marge de l'élastique
 * et des arrondis sous-pixel que les navigateurs mobiles rendent sur
 * `scrollY`. Au-delà, on ne touche à rien — et il n'y a pas d'affordance
 * « nouvelles publications » non plus, parce que ce serait une UI et une copie
 * que la cible ne dessine pas.
 */
export const TOLERANCE_DE_TETE_PX = 4;

/**
 * FAUT-IL RAFRAÎCHIR ? La règle, pure, opposable sans navigateur.
 *
 * `absentDepuis` vient du cycle de vie (masquage, perte du réseau) et vaut
 * `null` tant que rien n'a interrompu la lecture. Le SEUIL est celui du
 * rattrapage des deux surfaces à socket (`doitRattraper`,
 * `lib/realtime/reconnect-policy.ts`) : une absence sous ce seuil n'a rien pu
 * changer qui vaille de recharger, et le fil qui clignote pour un aller-retour
 * de trois secondes serait une nuisance.
 */
export const doitRafraichirLeFil = ({
  absentDepuis,
  maintenant,
  defilement,
}: {
  readonly absentDepuis: number | null;
  readonly maintenant: number;
  /** `window.scrollY` — la position que le lecteur a choisie, ou pas. */
  readonly defilement: number;
}): boolean =>
  doitRattraper({ deconnecteDepuis: absentDepuis, maintenant }) && defilement <= TOLERANCE_DE_TETE_PX;

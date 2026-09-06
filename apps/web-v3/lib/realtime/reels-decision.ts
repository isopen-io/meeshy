/**
 * LE MODULE DE LECTURE DES RÉELS — la DÉCISION, pure (#5388).
 *
 * Même patron que `navigateur-decision.ts` : ce qui peut rougir en jest ne se
 * découvre pas en e2e. Trois questions, aucune touche au DOM :
 *
 *  - `verdictDeLaMolette` : un cumul de `deltaY` sur une fenêtre, avec un
 *    REFROIDISSEMENT après chaque verdict rendu — sans lui, l'inertie d'un
 *    trackpad (des dizaines d'événements pour un seul geste physique) ferait
 *    avancer la file de plusieurs pas pour un seul mouvement de doigt.
 *  - `verdictDuToucher` : un balayage à dominante VERTICALE (|ΔY| > |ΔX|),
 *    au-delà d'un seuil ; horizontal, il ne dit rien — c'est un autre geste.
 *  - `verdictDuClavier` : les flèches et pages, jamais quand la cible est un
 *    champ de saisie — le geste ne doit pas arracher le clavier au formulaire
 *    de réponse.
 *
 * ET UNE QUESTION D'ÉTAT, TROIS FOIS REFUSÉE AVANT D'ÊTRE ACCORDÉE :
 * `doitAutoJouer` refuse `prefers-reduced-motion`, refuse `saveData` (3G
 * rurale, directive du porteur), refuse l'ONGLET CACHÉ (§ 8.5 : un onglet
 * d'arrière-plan ne tire pas un média) et refuse l'absence de vidéo — et
 * n'accorde que si les quatre passent.
 *
 * `peutReculer` est la garde du tap « précédent » qui n'existe pas dans le
 * document (`reels-porte.ts` : « AUCUNE PRÉCÉDENTE, ET CE N'EST PAS UN
 * OUBLI ») : le retour arrière du navigateur ne se déclenche QUE si le module,
 * dans cette session de document, a lui-même fait avancer la file.
 */

export type Verdict = 'suivant' | 'precedent' | null;

export type EtatDeLaMolette = {
  readonly cumul: number;
  readonly refroidiJusqua: number;
};

export const ETAT_INITIAL_DE_LA_MOLETTE: EtatDeLaMolette = { cumul: 0, refroidiJusqua: 0 };

/** Cumul de `deltaY`, en pixels, avant qu'un pas de file soit décidé. */
const SEUIL_MOLETTE = 120;
/** Après un verdict rendu, l'inertie du trackpad est ignorée ce temps-ci. */
const REFROIDISSEMENT_MOLETTE_MS = 400;

export const verdictDeLaMolette = (
  etat: EtatDeLaMolette,
  deltaY: number,
  maintenant: number,
): { readonly verdict: Verdict; readonly etat: EtatDeLaMolette } => {
  if (maintenant < etat.refroidiJusqua) return { verdict: null, etat };

  const cumul = etat.cumul + deltaY;
  if (cumul >= SEUIL_MOLETTE) {
    return { verdict: 'suivant', etat: { cumul: 0, refroidiJusqua: maintenant + REFROIDISSEMENT_MOLETTE_MS } };
  }
  if (cumul <= -SEUIL_MOLETTE) {
    return { verdict: 'precedent', etat: { cumul: 0, refroidiJusqua: maintenant + REFROIDISSEMENT_MOLETTE_MS } };
  }
  return { verdict: null, etat: { ...etat, cumul } };
};

/** Distance minimale, en pixels, d'un balayage tactile pour valoir un pas. */
const SEUIL_TOUCHER = 80;

/**
 * `deltaX`/`deltaY` sont ceux du GESTE (fin moins départ). Un doigt qui monte
 * (l'écran défile vers le contenu suivant) rend un `deltaY` NÉGATIF — la même
 * convention que le geste physique du legacy (`ReelsFeedScreen`).
 */
export const verdictDuToucher = (deltaX: number, deltaY: number): Verdict => {
  if (Math.abs(deltaY) <= Math.abs(deltaX)) return null;
  if (deltaY <= -SEUIL_TOUCHER) return 'suivant';
  if (deltaY >= SEUIL_TOUCHER) return 'precedent';
  return null;
};

export const verdictDuClavier = (touche: string, dansUnChampDeSaisie: boolean): Verdict => {
  if (dansUnChampDeSaisie) return null;
  if (touche === 'ArrowDown' || touche === 'PageDown') return 'suivant';
  if (touche === 'ArrowUp' || touche === 'PageUp') return 'precedent';
  return null;
};

export type ConditionsDeLecture = {
  readonly reduiteMotion: boolean;
  readonly saveData: boolean;
  readonly videoPresente: boolean;
  /**
   * L'ONGLET EST-IL À L'ÉCRAN ? Un réel ouvert dans un onglet d'ARRIÈRE-PLAN
   * (clic du milieu, « ouvrir dans un nouvel onglet ») exécute quand même son
   * chargeur, et `play()` sur une vidéo `preload="none"` DÉCLENCHE le
   * téléchargement du média — des centaines de kilo-octets tirés d'une 3G
   * rurale pour un écran que personne ne regarde, contre le gate « onglet
   * caché ⇒ ZÉRO requête » (§ 8.5). La lecture repart d'elle-même à la
   * `reprise` (`lib/realtime/reels.ts`), qui repasse par ces mêmes refus.
   */
  readonly ongletVisible: boolean;
};

export const doitAutoJouer = (conditions: ConditionsDeLecture): boolean =>
  !conditions.reduiteMotion && !conditions.saveData && conditions.videoPresente && conditions.ongletVisible;

/** `avances` est le compte, dans CETTE session de document, de pas « suivant » réussis. */
export const peutReculer = (avances: number): boolean => avances >= 1;

/**
 * LA TÊTE DE LA FILE — `/feed/reels` SANS curseur (`reels-porte.ts` :
 * `versLeReelSuivant` pose `?cursor=`, et rien d'autre ne le pose).
 *
 * C'est ce qui rend la pile d'`avances` HONNÊTE au lieu d'être un loquet. Le
 * compte vit dans le module, qui survit aux navigations douces (un ES module
 * n'est évalué qu'une fois) : sans remise à zéro, un lecteur qui avance,
 * quitte la file par la croix, puis y revient garderait un compte périmé — et
 * une flèche haut le sortirait de la file qu'il vient d'ouvrir, vers l'écran
 * d'avant. À la tête, il n'y a RIEN à remonter : le compte y est nul par
 * définition, et la fonction le dit depuis l'adresse plutôt que depuis une
 * mémoire.
 */
export const estLaTeteDeLaFile = (recherche: string): boolean =>
  !new URLSearchParams(recherche).has('cursor');

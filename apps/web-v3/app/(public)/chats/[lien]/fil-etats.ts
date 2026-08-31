import type { RefusDeLaPlace } from '@/lib/api/messagerie';

import { ACCES_REFUSE, PLACE_FERMEE, avisDuLienMort, type AvisDeLaPlace } from './etats';

/**
 * CE QUE LE FIL DIT QUAND QUELQUE CHOSE CHANGE SOUS LE LECTEUR — la copie, en
 * un seul endroit, et rien qui la fabrique dans un composant.
 *
 * Les états F et G n'y sont pas réécrits : ils viennent d'`etats.ts`, le même
 * module que l'écran des droits consomme. Deux copies pour un seul fait — « son
 * auteur l'a fermé » — divergeraient au premier ajustement, et l'invité lirait
 * deux phrases différentes pour la même chose selon l'écran où l'événement l'a
 * surpris.
 */

/**
 * Le composeur se ferme pour TROIS raisons, et elles ne se peignent pas pareil.
 *
 *   • un droit RETIRÉ par l'hôte (`canSendMessages: false`) — la place vit, la
 *     lecture continue, et c'est le cas nominal d'un lien en lecture seule ;
 *   • la place FERMÉE (401, état F) — le lecteur peut la reprendre au bouton ;
 *   • le lien MORT (410, état G) — plus rien ne rouvrira ce lien ;
 *   • l'accès REFUSÉ (403) — la place vaut peut-être encore, mais pas ICI.
 *
 * Aucune ne vide l'écran : « ce qui est déjà lu reste lu » (§ 6.3 G). Et aucune
 * ne laisse un champ grisé sans explication — une fermeture DIT sa raison,
 * sinon le visiteur croit à une panne et réessaie indéfiniment.
 */
export const LECTURE_SEULE = 'Ce lien ne permet que la lecture.';

/**
 * L'événement est celui que la PORTE produit (`RefusDeLaPlace`), jamais une
 * union recopiée : deux définitions du même fait se rejoignent toujours par un
 * `as`, c'est-à-dire par une assertion sur la seule chose que le compilateur
 * pouvait garder juste.
 */
export type EvenementDuFil = RefusDeLaPlace;

export const avisDuFil = (evenement: EvenementDuFil): AvisDeLaPlace => {
  if (evenement.type === 'place-fermee') return PLACE_FERMEE;
  if (evenement.type === 'acces-refuse') return ACCES_REFUSE;
  return avisDuLienMort(evenement.cause);
};

/** La raison NOMMÉE qui remplace le champ — la même phrase que l'avis, jamais une seconde. */
export const fermetureDuFil = (evenement: EvenementDuFil): string =>
  avisDuFil(evenement).corps;

/**
 * LE LIBELLÉ D'UN ENVOI ANNULÉ (§ 6.3 G, § 7).
 *
 * « Les envois en file sont annulés et rendus VISIBLES comme non envoyés,
 * jamais perdus en silence. » Le libellé porte la CAUSE, parce qu'un « non
 * envoyé » nu laisse le visiteur croire qu'il suffit de réessayer — ce qui,
 * sur un lien fermé, est faux, et ce qui ferait de la reprise un contrôle
 * inerte (loi 4).
 */
export const libelleDeLAnnulation = (evenement: EvenementDuFil): string =>
  `Non envoyé — ${avisDuFil(evenement).titre.toLowerCase()}`;

/** Le séparateur du § 7, nommé une fois. */
export const SEPARATEUR_DE_LACUNE = 'Des messages manquent ici';

/**
 * LES TROIS FILS VIDES, ET ILS NE SE PEIGNENT PAS PAREIL (dimension 8 : les
 * états vide / chargement / erreur / hors-ligne sont DESSINÉS).
 *
 * L'écran les confondait tous les trois : `lisLeFil` rend un `Verdict`, et le
 * rendu serveur l'aplatissait en `verdict.etat === 'servi' ? valeur : []`. Un
 * 500, un tunnel coupé serveur-à-serveur ou une charge illisible produisaient
 * donc EXACTEMENT le même écran qu'une conversation neuve : une liste vide,
 * sans un mot. Le doc-comment de `lisLeFil` nommait pourtant ce défaut — « un
 * fil VIDE sur l'autre, un vide qui a l'air d'une conversation neuve » — pour
 * justifier d'accepter deux formes de charge, et le laissait intact une ligne
 * plus bas pour tous les autres échecs.
 *
 *   • VIDE — la passerelle a répondu, et il n'y a rien. On INVITE, parce que
 *     c'est le seul des trois où le lecteur peut faire quelque chose ;
 *   • INDISPONIBLE — la passerelle n'a rien pu dire. On ne vide RIEN et on ne
 *     ferme RIEN (« erreur réseau ≠ 401 ») : on DIT, et l'îlot efface la ligne
 *     au premier rattrapage réussi ;
 *   • REFUSÉ (401 / 410) — c'est l'avis de la place, déjà peint par l'îlot.
 *     Le fil muet n'était pas une troisième copie à écrire : c'était le même
 *     événement, qui n'était simplement pas remonté depuis la LECTURE.
 */
export const FIL_VIDE_OUVERT = 'Personne n’a encore écrit — lancez la conversation.';

export const FIL_VIDE_FERME = 'Personne n’a encore écrit dans cette conversation.';

export const LECTURE_INDISPONIBLE =
  'Les messages n’ont pas pu être chargés — nouvelle tentative en cours.';

/** Ce que la bannière hors-ligne dit — sobre, en haut, et rien d'autre (§ 7). */
export const BANNIERE_HORS_LIGNE = 'Hors ligne — vos messages partiront au retour du réseau.';

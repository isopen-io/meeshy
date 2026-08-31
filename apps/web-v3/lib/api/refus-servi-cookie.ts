import { cookies } from 'next/headers';

import { CAUSES_DE_REFUS, type CauseDeRefus } from './adhesion';
import { champ, objet, texte } from './passerelle';

/**
 * LE REFUS QUE LE SERVEUR VIENT DE PRONONCER — et la raison pour laquelle il ne
 * voyage plus dans l'URL.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUE L'URL NE PEUT PAS PORTER : L'AUTORITÉ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le Post/Redirect/Get de `rejoindre.ts` a besoin de faire traverser un verdict
 * d'un POST au GET qui le suit. La première écriture le mettait dans la query
 * (`?refus=lien-desactive`), bornée à l'union FERMÉE des causes — ce qui ferme
 * l'INJECTION et laisse la question de l'AUTORITÉ entière : rien ne distingue
 * alors un refus prononcé par la passerelle d'un refus écrit par un tiers.
 *
 * Or l'écran RETIRE le formulaire dès qu'un refus n'est pas réessayable
 * (`vue.tsx`). Un `/chats/mshy_lagos?refus=lien-desactive` collé dans une
 * conversation WhatsApp affichait donc « Ce lien a été fermé — son auteur l'a
 * désactivé », SANS formulaire, sur une invitation parfaitement ouverte :
 * n'importe qui pouvait faire passer un lien vivant pour un lien mort et
 * supprimer le seul contrôle de l'écran, en ajoutant un paramètre à l'adresse
 * partagée. Le § 5.1 exige que l'écran ne dise rien qu'il n'ait lu sur la
 * passerelle ; le bandeau de refus était le seul endroit où ce principe était
 * rompu.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN COOKIE, ET PAS « SEULS LES REFUS RÉESSAYABLES DANS L'URL »
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Restreindre la query aux causes réessayables ferme bien l'attaque, et perd
 * deux refus que RIEN d'autre ne peut redire. La page relit l'aperçu du lien sur
 * le GET, et l'aperçu ne connaît ni `allowedIpRanges` ni le bannissement :
 * `zone-refusee` et `banni` sont prononcés par l'ADMISSION seule
 * (`admitLinkEntry`), au moment du POST. Les laisser tomber renverrait le
 * visiteur sur un formulaire muet qu'il pourrait soumettre indéfiniment — le
 * cul-de-sac remplacé par une boucle, c'est-à-dire un contrôle inerte (loi 4).
 *
 * Un cookie porte la propriété qui manquait : **seul notre serveur peut
 * l'écrire.** Une adresse partagée ne le transporte pas ; un tiers ne peut pas
 * le poser. Le verdict redevient donc ce que le § 5.1 demande — quelque chose
 * que l'écran a LU sur la passerelle — et les douze causes peuvent voyager sans
 * qu'aucune ne soit falsifiable.
 *
 *   • `httpOnly` : personne côté client n'en a l'usage, contrairement au jeton
 *     de session (`session-invitee-cookie.ts`, qui dit pourquoi il ne l'est
 *     pas).
 *   • `maxAge` COURT : un verdict décrit UNE tentative. Il s'efface tout seul —
 *     un rendu de page ne peut pas écrire de cookie sous Next 15, donc « lu
 *     une fois » ne s'implémente pas ici ; une minute est la fenêtre pendant
 *     laquelle recharger la page redit ce que la dernière tentative a répondu,
 *     ce qui est le comportement juste.
 *   • Indexé par le SEGMENT d'URL, pas par la `CleDeLien` : au moment où un
 *     refus est prononcé, il n'y a précisément pas de place, donc pas de clé
 *     canonique. Deux liens ouverts dans deux onglets ne s'écrasent pas pour
 *     autant — le nom porte le segment.
 */

const RACINE = 'meeshy.refus.';

const PORTEE = '/chats';

/** Une tentative, pas une session : le verdict d'un POST vaut le temps de lire l'écran qui suit. */
const DUREE_S = 60;

/**
 * Ce que le POST a répondu, dans le vocabulaire de l'ÉCRAN.
 *
 * `indisponible` n'est pas une `CauseDeRefus` et ne doit pas le devenir : la
 * passerelle ne dit pas non, elle ne dit rien (§ 7, « erreur réseau ≠ 401 »).
 * L'écran, lui, doit savoir peindre les deux — d'où l'union, qui est exactement
 * le domaine que le paramètre d'URL portait avant.
 */
export type VerdictServi = {
  readonly cause: CauseDeRefus | 'indisponible';
  /** Le pseudo de rechange que la passerelle propose sur un 409 — jamais fabriqué ici. */
  readonly suggestion: string | null;
};

export const nomDuRefus = (segment: string): string => `${RACINE}${encodeURIComponent(segment)}`;

export const poseLeRefusServi = async (segment: string, verdict: VerdictServi): Promise<void> => {
  const boite = await cookies();

  boite.set(nomDuRefus(segment), JSON.stringify(verdict), {
    path: PORTEE,
    maxAge: DUREE_S,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
};

/**
 * La relecture ne fait confiance à rien de ce qu'elle trouve : un cookie reste
 * une chaîne, et une version antérieure a pu en écrire une autre forme. La cause
 * est comparée à l'union FERMÉE, la suggestion n'est retenue que si c'est un
 * texte — tout le reste ne peint rien.
 */
const CAUSES_SERVIES: readonly (CauseDeRefus | 'indisponible')[] = [...CAUSES_DE_REFUS, 'indisponible'];

export const refusServiDepuisLaValeur = (valeur: string | null): VerdictServi | null => {
  if (valeur === null) return null;

  const lu = ((): object | null => {
    try {
      return objet(JSON.parse(valeur));
    } catch {
      return null;
    }
  })();

  if (lu === null) return null;

  const brute = texte(champ(lu, 'cause'));
  const cause = CAUSES_SERVIES.find((connue) => connue === brute);

  return cause === undefined ? null : { cause, suggestion: texte(champ(lu, 'suggestion')) };
};

export const lisLeRefusServi = async (segment: string): Promise<VerdictServi | null> => {
  const boite = await cookies();
  return refusServiDepuisLaValeur(boite.get(nomDuRefus(segment))?.value ?? null);
};

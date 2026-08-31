import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { type CauseDeRefus, type LienDadhesion } from '@/lib/api/adhesion';
import type { DroitsDeLaPlace } from '@/lib/api/guest-session';
import type { VerdictServi } from '@/lib/api/refus-servi-cookie';

/**
 * CE QUE L'ÉCRAN DIT — la copie, séparée de ce qui la RÉSOUT (`vue.tsx`) et de ce
 * qui la SERT (`page.tsx`).
 *
 * Trois tables vivent ici, et une seule règle les gouverne : **rien n'est affirmé
 * qui ne soit lu sur la réponse de la passerelle.**
 *
 * **C'est le module UNIQUE des listes de `/chats/:lien`, et c'est le critère de
 * fin de l'écran `rights`.** L'accordéon d'AVANT l'entrée (`pointsDuLien`) et les
 * quatre droits d'APRÈS (`droitsDeLaPlace`) rendent le même type — `PointDuLien`
 * —, se peignent par le même rendu de ligne (`vue.tsx`), et n'existent qu'ici.
 * Une seconde liste écrite dans une vue serait juste le jour où on l'écrit puis
 * fausse à la première correction de copie ; deux témoins la refusent
 * (`__tests__/droits.test.tsx`), l'un par le comportement, l'autre par la source.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 1. LES POINTS DU LIEN — l'accordéon « Ce que ce lien vous ouvre »
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La planche y dessine quatre DROITS : historique, écrire et répondre, envoyer
 * des fichiers, pas d'appel. Aucune porte d'aperçu ne les sert (voir le doc-tête
 * de `lib/api/adhesion.ts` : `GET /links/:identifier` les porte mais répond 403
 * à un visiteur sans compte dès que l'hôte a masqué l'historique — le cas
 * nominal d'une invitation). Les servir quand même reviendrait à ÉCRIRE quatre
 * booléens qu'on ne connaît pas : « Écrire et répondre » au-dessus d'un lien qui
 * interdit les messages anonymes est une promesse que l'écran suivant dément.
 *
 * Les quatre points ci-dessous sont donc ceux que la porte d'aperçu CONNAÎT —
 * compte, échéance, places, langues. Même disposition, même hiérarchie, mêmes
 * gestes, quatre lignes, un état ✓/✗ par ligne : la conformité porte là-dessus.
 * Les huit droits réels arrivent avec le 201 du join (`entry.rights`), c'est-à-
 * dire sur l'écran `rights` de la planche — « Bienvenue Tolu ! · Voilà ce que ce
 * lien vous ouvre » —, qui est bien un écran d'APRÈS l'entrée.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 2. LES REFUS — un état peint par cause, jamais un message d'erreur générique
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Chaque cause dit TROIS choses : ce qui s'est passé, ce que le visiteur peut y
 * faire, et si le formulaire a encore un sens. Un refus qui laisse le formulaire
 * ouvert alors que rien ne le fera passer est un contrôle inerte (loi 4) ; un
 * refus qui le ferme alors qu'un autre pseudo suffirait enferme le visiteur.
 */

export type PointDuLien = {
  readonly cle: string;
  readonly accorde: boolean;
  readonly titre: string;
  readonly detail: string;
};

const DATE = new Intl.DateTimeFormat(DOCUMENT_LANGUAGE, {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * Le nom d'une langue dans la langue du document — jamais son code.
 *
 * `yo` ne dit rien à personne ; « yoruba » dit au visiteur ce qu'il va lire.
 * `Intl.DisplayNames` jette sur un code mal formé (une valeur qui a traversé un
 * formulaire puis un cookie) : le repli est le code lui-même, jamais une
 * exception au milieu d'un rendu serveur.
 */
const nomDeLangue = (code: string): string => {
  try {
    return new Intl.DisplayNames([DOCUMENT_LANGUAGE], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
};

const langues = (codes: readonly string[]): string => {
  try {
    return new Intl.ListFormat(DOCUMENT_LANGUAGE, { type: 'conjunction' }).format(
      codes.map((code) => new Intl.DisplayNames([DOCUMENT_LANGUAGE], { type: 'language' }).of(code) ?? code),
    );
  } catch {
    return codes.join(', ');
  }
};

const pointDuCompte = (lien: LienDadhesion): PointDuLien =>
  lien.exigeCompte
    ? {
        cle: 'compte',
        accorde: false,
        titre: 'Un compte est demandé',
        detail: 'Ce lien n’accepte pas les visiteurs sans compte.',
      }
    : {
        cle: 'compte',
        accorde: true,
        titre: 'Entrer sans compte',
        detail: 'Aucune inscription, aucun mot de passe.',
      };

const pointDeLEcheance = (lien: LienDadhesion): PointDuLien =>
  lien.echeance === null
    ? {
        cle: 'echeance',
        accorde: true,
        titre: 'Sans date de fin',
        detail: 'Ce lien reste ouvert tant que son auteur le laisse ouvert.',
      }
    : {
        cle: 'echeance',
        accorde: true,
        titre: `Ouvert jusqu’au ${DATE.format(lien.echeance)}`,
        detail: 'Passé cette date, le lien ne laisse plus entrer personne.',
      };

const pointDesPlaces = (lien: LienDadhesion): PointDuLien =>
  lien.placesRestantes === null
    ? {
        cle: 'places',
        accorde: true,
        titre: 'Places non comptées',
        detail: 'Ce lien n’a pas de limite d’entrées.',
      }
    : {
        cle: 'places',
        accorde: lien.placesRestantes > 0,
        titre:
          lien.placesRestantes > 0
            ? `${lien.placesRestantes} place${lien.placesRestantes > 1 ? 's' : ''} restante${lien.placesRestantes > 1 ? 's' : ''}`
            : 'Plus aucune place',
        detail: 'Le compte descend d’une unité à chaque entrée.',
      };

/**
 * La langue est le seul point qui parle des DEUX faces du Prisme : ce que le
 * lien accepte d'écrire, et ce qui est déjà lu ici. Un lien qui n'impose rien ne
 * fait pas taire l'autre moitié — c'est elle qui dit au visiteur pourquoi il
 * peut écrire dans SA langue.
 */
const pointDesLangues = (lien: LienDadhesion): PointDuLien => {
  const parlees =
    lien.languesParlees.length === 0
      ? 'Vos messages sont traduits vers les langues des participants.'
      : `Vos messages sont traduits vers ${langues(lien.languesParlees)}.`;

  return lien.languesDuLien.length === 0
    ? { cle: 'langues', accorde: true, titre: 'Écrire dans votre langue', detail: parlees }
    : {
        cle: 'langues',
        accorde: true,
        titre: `Langues acceptées : ${langues(lien.languesDuLien)}`,
        detail: parlees,
      };
};

export const pointsDuLien = (lien: LienDadhesion): readonly PointDuLien[] => [
  pointDuCompte(lien),
  pointDeLEcheance(lien),
  pointDesPlaces(lien),
  pointDesLangues(lien),
];

/**
 * ────────────────────────────────────────────────────────────────────────────
 * 3. LES QUATRE DROITS D'UNE PLACE OUVERTE — l'écran `rights`
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Ce que l'accordéon d'avant l'entrée ne pouvait pas dire, la réponse de
 * jonction le dit : `canSendMessages`, `canSendFiles`, `canSendImages`,
 * `allowViewHistory` (projetés en `DroitsDeLaPlace` par `lib/api/adhesion.ts`).
 * Quatre lignes, comme la planche les dessine — mais leur DÉCOUPAGE ne suit pas
 * les booléens un pour un, et il faut dire pourquoi :
 *
 *   • la planche pose « Envoyer photos et fichiers » sur UNE ligne pour DEUX
 *     booléens. Les servir séparément ajouterait une cinquième ligne que la
 *     cible ne porte pas ; écrire le titre des deux quand un seul est ouvert
 *     serait la promesse que le composeur dément. La ligne dit donc ce qui est
 *     vrai des deux, dans les quatre combinaisons ;
 *   • la quatrième ligne ne vient d'AUCUN droit servi, et c'est une propriété de
 *     l'IDENTITÉ, pas du lien : `/calls/*` est monté `allowAnonymous: false`
 *     (`services/gateway/src/routes/calls.ts`) et
 *     `POST /conversations/:id/invite` exige `authContext.registeredUser`
 *     (`routes/conversations/sharing.ts`). Aucun réglage d'hôte ne l'ouvre à un
 *     visiteur sans compte ; la ligne est donc constante, et elle est VRAIE.
 *
 * Ce que la planche écrit et qui n'est PAS repris : « Historique depuis le
 * 12 août » et « Jusqu'à 10 Mo par envoi ». La date suppose un octroi par DATE
 * (`historyVisibleFrom`) que la réponse de jonction ne sert pas, et le plafond
 * de 10 Mo n'a été mesuré nulle part. Écart de copie assumé — une valeur non
 * mesurée dans un écran de droits est une promesse que rien ne tient.
 */

const droitDeLHistorique = (droits: DroitsDeLaPlace): PointDuLien =>
  droits.historique
    ? {
        cle: 'historique',
        accorde: true,
        titre: 'Lire tout l’historique',
        detail: 'Les messages écrits avant votre arrivée sont visibles.',
      }
    : {
        cle: 'historique',
        accorde: false,
        titre: 'L’historique reste masqué',
        detail: 'Vous lisez la conversation à partir de votre arrivée.',
      };

/**
 * LE SEUL ENDROIT DU PRODUIT OÙ UN LECTEUR ANONYME LIT SON RANG 1.
 *
 * Le Prisme dit que « par défaut, l'utilisateur consomme tout le contenu dans sa
 * langue principale configurée ». Un invité n'a rien configuré : sa langue
 * principale est celle qu'il vient de déclarer au formulaire, et la passerelle
 * la lui rend sur la réponse de la place (`participant.language`). L'écran qui
 * CONFIRME l'entrée est celui qui a cette valeur sous la main, et c'est aussi
 * celui qui parle de traduction — se taire ici, c'est laisser le visiteur entrer
 * sans savoir dans quelle langue il va lire.
 *
 * `null` — la réponse ne l'a pas dite — ne fabrique aucune langue : la phrase
 * générique reste, et elle est vraie.
 */
const detailDEcrire = (langue: string | null): string =>
  langue === null
    ? 'Vos messages sont traduits vers les langues des participants.'
    : `Vos messages sont traduits, et tout vous revient en ${nomDeLangue(langue)}.`;

const droitDEcrire = (droits: DroitsDeLaPlace, langue: string | null): PointDuLien =>
  droits.ecrire
    ? {
        cle: 'ecrire',
        accorde: true,
        titre: 'Écrire et répondre',
        detail: detailDEcrire(langue),
      }
    : {
        cle: 'ecrire',
        accorde: false,
        titre: 'Lecture seule',
        detail: 'Ce lien n’ouvre pas l’écriture aux visiteurs sans compte.',
      };

const droitDenvoyer = (droits: DroitsDeLaPlace): PointDuLien => {
  const titre = droits.images
    ? droits.fichiers
      ? 'Envoyer photos et fichiers'
      : 'Envoyer des photos'
    : droits.fichiers
      ? 'Envoyer des fichiers'
      : 'Ni photo ni fichier';

  const detail = droits.images
    ? droits.fichiers
      ? 'Images et documents partent depuis le composeur.'
      : 'Les autres fichiers ne passent pas.'
    : droits.fichiers
      ? 'Les photos ne passent pas.'
      : 'Ce lien n’ouvre que le texte.';

  return { cle: 'envois', accorde: droits.images || droits.fichiers, titre, detail };
};

const DROIT_DES_APPELS: PointDuLien = {
  cle: 'appels',
  accorde: false,
  titre: 'Pas d’appel, pas d’invitation',
  detail: 'Réservé aux membres qui ont un compte.',
};

export const droitsDeLaPlace = (
  droits: DroitsDeLaPlace,
  /** La langue SERVIE au lecteur — rang 1 de son Prisme. `null` quand la place ne la porte pas. */
  langue: string | null = null,
): readonly PointDuLien[] => [
  droitDeLHistorique(droits),
  droitDEcrire(droits, langue),
  droitDenvoyer(droits),
  DROIT_DES_APPELS,
];

export type EtatDeRefus = {
  readonly titre: string;
  readonly corps: string;
  /** Le formulaire reste-t-il utile ? `false` ⇒ rien de ce que le visiteur tape ne changera la réponse. */
  readonly reessayable: boolean;
  /** Le champ à replacer sous le curseur — `null` quand aucun champ n'est en cause. */
  readonly champ: 'pseudo' | 'langue' | null;
};

const REFUS: Readonly<Record<CauseDeRefus, EtatDeRefus>> = {
  'champ-requis': {
    titre: 'Il manque quelque chose',
    corps: 'Renseignez les champs marqués comme obligatoires, puis réessayez.',
    reessayable: true,
    champ: 'pseudo',
  },
  'pseudo-pris': {
    titre: 'Ce pseudo est déjà pris ici',
    corps: 'Quelqu’un porte déjà ce nom dans cette conversation. En voici un de libre.',
    reessayable: true,
    champ: 'pseudo',
  },
  'langue-refusee': {
    titre: 'Cette langue n’est pas acceptée',
    corps: 'L’auteur du lien a restreint les langues admises. Choisissez-en une autre.',
    reessayable: true,
    champ: 'langue',
  },
  /**
   * La copie dit ce que CHAQUE porte fait, et pas ce qu'on aimerait qu'elles
   * fassent. Mesuré : `/login` honore `?returnUrl=` et ramène ici ;
   * `/signup` ouvre `/dashboard` sans condition
   * (`apps/web/hooks/use-registration-submit.ts`). Promettre le retour aux deux
   * était une phrase que la seconde dément — voir `PortesDuCompte` (`vue.tsx`).
   */
  'compte-requis': {
    titre: 'Ce lien demande un compte',
    corps:
      'Connectez-vous : vous reviendrez ici tout de suite après. Une inscription vous ouvre d’abord votre accueil.',
    reessayable: false,
    champ: null,
  },
  'zone-refusee': {
    titre: 'Entrée non autorisée depuis ici',
    corps: 'L’auteur du lien a restreint les adresses depuis lesquelles on peut entrer.',
    reessayable: false,
    champ: null,
  },
  banni: {
    titre: 'Vous n’avez plus accès à cette conversation',
    corps: 'Un responsable de la conversation a retiré cet accès.',
    reessayable: false,
    champ: null,
  },
  'lien-epuise': {
    titre: 'Ce lien a atteint sa limite',
    corps: 'Toutes les places ouvertes par ce lien sont prises. Demandez-en un nouveau à son auteur.',
    reessayable: false,
    champ: null,
  },
  'lien-expire': {
    titre: 'Ce lien a expiré',
    corps: 'Sa date de fin est passée. Son auteur peut en ouvrir un nouveau.',
    reessayable: false,
    champ: null,
  },
  'lien-desactive': {
    titre: 'Ce lien a été fermé',
    corps: 'Son auteur l’a désactivé. Rien de ce qui a été écrit n’est perdu pour ses membres.',
    reessayable: false,
    champ: null,
  },
  'conversation-terminee': {
    titre: 'Cette conversation est terminée',
    corps: 'Elle a été clôturée : on n’y entre plus, et plus personne n’y écrit.',
    reessayable: false,
    champ: null,
  },
  introuvable: {
    titre: 'Ce lien ne mène nulle part',
    corps: 'Vérifiez l’adresse : elle a pu être tronquée en chemin.',
    reessayable: false,
    champ: null,
  },
  indetermine: {
    titre: 'L’entrée a été refusée',
    corps: 'La conversation n’a pas dit pourquoi. Réessayez dans un instant.',
    reessayable: true,
    champ: null,
  },
};

export const etatDeRefus = (cause: CauseDeRefus): EtatDeRefus => REFUS[cause];

/**
 * L'INDISPONIBILITÉ n'est pas un refus (§ 7, « erreur réseau ≠ 401 ») : la
 * passerelle ne dit pas non, elle ne dit rien. Le formulaire reste donc ouvert —
 * c'est la seule situation où réessayer le même geste mène ailleurs.
 */
export const INDISPONIBLE: EtatDeRefus = {
  titre: 'Impossible de joindre la conversation',
  corps: 'La connexion n’a pas abouti. Rien n’est perdu : réessayez.',
  reessayable: true,
  champ: null,
};

/**
 * QUEL PSEUDO le champ porte au retour d'un refus.
 *
 * La suggestion de la passerelle passe DEVANT ce que le visiteur a tapé, et
 * c'est le seul ordre qui marche : sur un 409
 * `USERNAME_TAKEN_IN_CONVERSATION`, le pseudo tapé est précisément celui qui ne
 * peut PAS passer. Le laisser en place ferait recommencer le même refus au
 * premier appui ; le vider ferait tout retaper. La suggestion est libre, et
 * c'est la passerelle qui l'a calculée — jamais cet écran.
 */
export const pseudoARemplir = ({
  suggestion,
  tape,
}: {
  readonly suggestion: string | null;
  readonly tape: string | null;
}): string => suggestion ?? tape ?? '';

/**
 * Le refus tel que le SERVEUR vient de le prononcer — la seule porte par
 * laquelle un verdict entre dans l'écran.
 *
 * Il ne vient plus de l'URL, et c'est une question d'AUTORITÉ, pas d'injection :
 * `?refus=` était borné à l'union fermée des causes (donc inattaquable par
 * injection) et restait indistinguable d'un `?refus=` écrit par un tiers, alors
 * que l'écran RETIRE son formulaire sur un refus définitif. Le verdict voyage
 * désormais dans un cookie que seul ce serveur peut écrire
 * (`lib/api/refus-servi-cookie.ts`) ; cette fonction n'en fait que la copie.
 *
 * Elle reste défensive parce que la valeur a traversé un stockage : la cause est
 * comparée à la table, et une cause inconnue ne peint rien — jamais un message
 * composé depuis la chaîne reçue.
 */
export const etatDuVerdictServi = (verdict: VerdictServi | null): EtatDeRefus | null => {
  if (verdict === null) return null;
  return verdict.cause === 'indisponible' ? INDISPONIBLE : REFUS[verdict.cause];
};

/**
 * ────────────────────────────────────────────────────────────────────────────
 * 4. CE QUI EST ARRIVÉ À LA PLACE DEPUIS QU'ELLE A ÉTÉ OUVERTE — états F et G
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Un écran dont le rôle est de dire ce qu'on a le droit de faire doit savoir
 * dire qu'on ne l'a plus. Les deux états existent dans la conception, ils sont
 * DISTINCTS, et les confondre serait mentir dans les deux sens :
 *
 *   • **F — la place est fermée** (401 au refresh) : `isActive:false`, c'est-à-
 *     dire un départ, un bannissement ou la purge. Le lien, lui, est peut-être
 *     parfaitement vivant. Les quatre droits ne valent plus rien, et le § 6.3 F
 *     interdit le re-join SILENCIEUX en le mesurant : identité neuve, pseudo
 *     suffixé, trois compteurs, et une boucle qui épuiserait le `maxUses` du
 *     créateur. D'où un BOUTON, et le pseudo précédent pré-rempli ;
 *   • **G — le lien est mort** (410) pendant que la place, elle, tient. Rien
 *     n'est retiré au lecteur : ce qui est lu reste lu, la raison est NOMMÉE, et
 *     il n'y a AUCUNE redirection automatique.
 *
 * `reessayable` n'a pas de sens ici — aucun de ces deux états ne se corrige en
 * retapant un champ —, et `EtatDeRefus` n'est donc pas réemployé : un type qui
 * porterait un drapeau toujours faux inviterait à le lire.
 */
export type AvisDeLaPlace = {
  readonly titre: string;
  readonly corps: string;
  /** Le libellé du bouton, quand il y a quelque chose à faire. `null` ⇒ rien à faire ici. */
  readonly reprise: string | null;
};

/**
 * LE LIBELLÉ DU CONTRÔLE quand rien n'est arrivé à la place.
 *
 * Il est ici, avec les avis, parce que c'est de la COPIE : le libellé de la
 * reprise vit sur `AvisDeLaPlace.reprise`, et celui du geste nominal n'aurait
 * aucune raison d'être ailleurs. Deux modules de copie pour un même bouton
 * seraient justes le jour où on les écrit.
 */
export const SORTIE_DE_LA_PLACE = 'Quitter cette place';

/**
 * Le libellé du CTA de la cible `rights`. Il est ici, avec le reste de la copie,
 * pour la même raison que les deux autres : deux modules de copie pour un même
 * bouton sont justes le jour où on les écrit.
 */
export const ENTRER_DANS_LE_FIL = 'Entrer dans la conversation';

export const PLACE_FERMEE: AvisDeLaPlace = {
  titre: 'Votre place a été fermée',
  corps:
    'Cette place ne vous ouvre plus rien : elle a été rendue, ou un responsable l’a retirée. Vous pouvez en redemander une.',
  reprise: 'Reprendre ma place',
};

/**
 * H — L'ACCÈS EST REFUSÉ (403), et ce n'est ni F, ni G, ni une coupure.
 *
 * Le voisin sémantique de `PLACE_FERMEE`, dont il se distingue par ce que le
 * lecteur peut y faire : sur un 401 la place elle-même est tombée et se
 * REDEMANDE ; sur un 403 la place peut être parfaitement valide — c'est CETTE
 * conversation qui ne s'ouvre plus (participant introuvable, place purgée,
 * place rattachée ailleurs).
 *
 * Il est écrit ici et pas dans la galerie pour la raison qui gouverne tout ce
 * module : deux copies du même fait divergent au premier mot changé d'un seul
 * côté. Le fil et la galerie disent la même phrase.
 *
 * `reprise` renvoie à la CONVERSATION, jamais à un « réessayez plus tard » :
 * réessayer le même appel rendra le même 403, et un contrôle sans effet n'a pas
 * sa place (loi 4).
 */
export const ACCES_REFUSE: AvisDeLaPlace = {
  titre: 'Cette conversation ne vous est plus ouverte',
  corps:
    'Votre accès a été retiré, ou cette place appartient à une autre conversation. Réessayer n’y changera rien.',
  reprise: 'Revenir à la conversation',
};

/**
 * La raison du 410, dite avec les mots des refus d'entrée — même vocabulaire
 * pour le même fait, qu'il tombe avant ou après l'entrée. Un état inconnu ne
 * compose rien depuis le code reçu : il dit ce qu'il sait, c'est-à-dire que le
 * lien ne mène plus ici.
 */
const LIEN_MORT: Readonly<Partial<Record<CauseDeRefus, string>>> = {
  'lien-desactive': 'Son auteur l’a fermé. Ce que vous avez lu reste lisible ici.',
  'lien-expire': 'Sa date de fin est passée. Ce que vous avez lu reste lisible ici.',
  'conversation-terminee': 'Elle a été clôturée : plus personne n’y écrit.',
  'lien-epuise': 'Toutes ses places sont prises. La vôtre, elle, vous reste.',
};

export const avisDuLienMort = (cause: CauseDeRefus): AvisDeLaPlace => ({
  titre: REFUS[cause].titre,
  corps: LIEN_MORT[cause] ?? 'Ce lien ne laisse plus entrer personne. Ce que vous avez lu reste lisible ici.',
  reprise: null,
});

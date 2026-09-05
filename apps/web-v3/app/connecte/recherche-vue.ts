import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import { adresseDuFil, adresseDuPlein } from '@/lib/api/adresses-du-fil';
import type { Conversation, LienDePartage } from '@/lib/api/compte';
import { formeDePiece } from '@/lib/api/formes';
import type { MediaTrouve, PersonneTrouvee } from '@/lib/api/recherche';
import { GLYPHE_LIEN, LIENS } from '@/lib/contenu/liens';
import { MEDIAS } from '@/lib/contenu/medias';
import {
  GLYPHE_CONVERSATION,
  GLYPHE_PERSONNE,
  GLYPHE_RECHERCHE,
  PARAMETRE_DE_RECHERCHE,
  RECHERCHE,
} from '@/lib/contenu/recherche';

import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { CHARGEUR_DE_PARTICIPATION } from './chargeur';
import { documentPleinEcran } from './fil-vue';
import { FEUILLE_DE_LA_RECHERCHE } from './recherche-feuille';
import { carteVide, versLeFil } from './vue';

/**
 * L'ÉCRAN DE RECHERCHE (`cible/search.png`, issue #4897) — ses QUATRE groupes,
 * depuis #5174/#5171.
 *
 * UN `GET` DE FORMULAIRE, ET L'ADRESSE PORTE LA REQUÊTE. Pas de `POST` : une
 * recherche est une LECTURE, et son résultat doit être rechargeable, mis en
 * favori, partagé, retrouvé par le bouton « précédent ». `?q=` fait tout cela
 * sans une ligne de JavaScript. C'est aussi ce qui tient, par CONSTRUCTION, le
 * critère « au plus une requête en vol par saisie » : il n'y a jamais de
 * requête pendant la frappe. La frappe incrémentale (`lib/realtime/recherche.ts`)
 * échange `#resultats` EN BLOC — elle porte les quatre groupes sans en
 * connaître un seul, puisqu'elle ne compose rien : le serveur compose, le
 * module échange.
 *
 * QUATRE GROUPES, DÉSORMAIS. La cible dessine Conversations, Personnes, Médias
 * et Liens ; les deux derniers n'avaient AUCUNE route — c'est désormais réglé
 * (`GET /attachments/search`, `attachments/search.ts:187` ; `GET /links?q=`,
 * `links/user.ts:315`).
 *
 * ET LES GROUPES MONTRENT LEURS RÉSULTATS, plutôt que de mener à un écran de
 * détail par groupe : la cible dessine des rangées cliquables, mais cet écran
 * de détail n'existe pas. Un chevron vers rien est un contrôle qui ment
 * (règle 7) ; la liste, elle, répond tout de suite — une rangée Médias mène
 * DIRECTEMENT au plein écran de la pièce, dans le fil qui la porte
 * (`adresseDuPlein`, `lib/api/adresses-du-fil.ts`) ; une rangée Liens mène à sa
 * conversation, ou à `/links` quand la passerelle ne l'a pas étendue.
 *
 * LE COMPTE DIT CE QU'IL COMPTE. « 3 affichées », jamais « 3 résultats » :
 * aucune des quatre routes ne sert de total qu'on puisse honnêtement afficher,
 * et le nombre de lignes rapatriées est plafonné par la limite. `hasMore` — la
 * seule chose de plus que la passerelle autorise à dire — devient une phrase,
 * pas un chiffre.
 *
 * AUCUN `lang=` N'EST POSÉ SUR CES RANGÉES : un nom de fichier et un nom de
 * lien ne portent pas de traductions (`Attachment`/`ConversationShareLink` ne
 * déclarent aucune carte de traductions) — `resolvePrismTranslation` n'a donc
 * aucune matière ici, à la différence de l'aperçu d'une conversation.
 */

export type EtatDeLaRecherche = {
  /** Ce que le lecteur a tapé, tel quel — pour le re-servir dans le champ. */
  readonly requete: string;
  readonly conversations: readonly Conversation[];
  /** Vrai quand SEULE cette route a échoué (correctif 2026-09-05) — le groupe se dessine « Indisponible », jamais confondu avec « aucun résultat ». */
  readonly conversationsIndisponibles: boolean;
  readonly personnes: readonly PersonneTrouvee[];
  readonly encoreDesPersonnes: boolean;
  readonly personnesIndisponibles: boolean;
  readonly medias: readonly MediaTrouve[];
  readonly encoreDesMedias: boolean;
  readonly mediasIndisponibles: boolean;
  readonly liens: readonly LienDePartage[];
  readonly encoreDesLiens: boolean;
  readonly liensIndisponibles: boolean;
  /** Ce que le document porte pour son module (§ 12.4, #4897) — le module échange `#resultats`, il n'appelle aucune passerelle. */
  readonly tempsReel: { readonly module: string } | null;
};

const CHAMP = 'recherche-q';

/**
 * LE FORMULAIRE. Le libellé est VISIBLE et lié au champ : un `placeholder`
 * seul disparaît dès la première lettre, et ce qu'il disait avec lui.
 *
 * `value` re-sert ce que le lecteur a tapé — sans quoi, au retour des
 * résultats, le champ serait vide et l'écran aurait oublié la question qu'il
 * répond.
 */
const formulaire = (requete: string): string =>
  '<form class="chercher" method="get" role="search">' +
  `<label for="${CHAMP}">${echappe(RECHERCHE.champ)}</label>` +
  '<span class="ligne">' +
  `<input id="${CHAMP}" type="search" name="${PARAMETRE_DE_RECHERCHE}" value="${echappe(requete)}" placeholder="${echappe(RECHERCHE.placeholder)}" autocomplete="off" enterkeyhint="search">` +
  `<button type="submit" class="action primaire">${svgDuSprite(GLYPHE_RECHERCHE)}${echappe(RECHERCHE.lancer)}</button>` +
  '</span>' +
  '</form>';

const ligneDeConversation = (fil: Conversation): string =>
  `<li><a class="trouvaille" href="${echappe(versLeFil(fil))}">` +
  `<span class="vignette" aria-hidden="true">${svgDuSprite(GLYPHE_CONVERSATION)}</span>` +
  '<span class="dit">' +
  `<span class="primaire">${echappe(fil.titre)}</span>` +
  `<span class="secondaire">${fil.membres} ${echappe(RECHERCHE.groupePersonnes.toLowerCase())}</span>` +
  '</span>' +
  '</a></li>';

/**
 * UNE PERSONNE TROUVÉE, SANS DESTINATION — et c'est la règle 7, pas un oubli.
 *
 * Ouvrir une personne demanderait une fiche de profil (`/u/:pseudonyme`), que
 * la v3 ne sert pas ; lui écrire demanderait de créer une conversation, ce
 * qu'aucune route de la v3 n'expose encore (c'est `sheet:conv`). La ligne est
 * donc une ligne d'INFORMATION : elle dit qui existe sous ce nom, avec son
 * pseudonyme pour distinguer deux homonymes. Le jour où l'une des deux
 * surfaces existe, elle devient un lien.
 *
 * AUCUNE PASTILLE DE PRÉSENCE. `?expand=presence` n'est pas demandé : l'écran
 * n'en dessine pas, et réclamer une donnée qu'on n'affiche pas la fait voyager
 * pour rien — sur un chemin où la directive du 2026-08-25 dit justement qu'elle
 * ne doit voyager qu'à qui y a droit.
 */
const ligneDePersonne = (personne: PersonneTrouvee): string =>
  '<li class="trouvaille">' +
  `<span class="vignette" aria-hidden="true">${svgDuSprite(GLYPHE_PERSONNE)}</span>` +
  '<span class="dit">' +
  `<span class="primaire">${echappe(personne.nom)}</span>` +
  `<span class="secondaire">@${echappe(personne.pseudonyme)}</span>` +
  '</span>' +
  '</li>';

/**
 * UN MÉDIA TROUVÉ — SA DESTINATION EST LE PLEIN ÉCRAN, DANS LE FIL QUI LE
 * PORTE. `adresseDuPlein` compose `?autour=<message>&media=<pièce>` : la
 * tranche AUTOUR du message, jamais les 40 derniers — sans quoi la pièce d'un
 * média ancien ouvrirait sur un fil vide (`adresses-du-fil.ts`, doc-comment).
 * L'icône vient de `formeDePiece` (`lib/api/formes.ts`, la table mime→genre
 * unique) — jamais une seconde table par genre.
 */
const ligneDeMedia = (m: MediaTrouve): string =>
  `<li><a class="trouvaille" href="${echappe(adresseDuPlein(adresseDuFil(m.conversationId), m.messageId, m.id))}">` +
  `<span class="vignette" aria-hidden="true">${svgDuSprite(formeDePiece(m.genre).glyphe)}</span>` +
  '<span class="dit">' +
  `<span class="primaire">${echappe(m.nom)}</span>` +
  `<span class="secondaire">${echappe(MEDIAS.parGenre[m.genre])}</span>` +
  '</span>' +
  '</a></li>';

/**
 * UN LIEN TROUVÉ — mène à sa conversation quand la passerelle l'a étendue
 * (`?expand=conversation`, toujours demandé par `liensTrouves`), sinon à
 * `/links` : jamais une rangée sans destination (règle 7). Un lien FERMÉ le
 * DIT, comme `liens-vue.ts` le fait déjà pour le carnet.
 */
const ligneDeLien = (l: LienDePartage): string =>
  `<li><a class="trouvaille" href="${echappe(l.conversation === null ? '/links' : adresseDuFil(l.conversation))}">` +
  `<span class="vignette" aria-hidden="true">${svgDuSprite(GLYPHE_LIEN)}</span>` +
  '<span class="dit">' +
  `<span class="primaire">${echappe(l.nom)}</span>` +
  `<span class="secondaire">@${echappe(l.identifiant)}${l.actif ? '' : ` · ${echappe(LIENS.ferme)}`}</span>` +
  '</span>' +
  '</a></li>';

/**
 * UN GROUPE — ET SON ÉTAT `INDISPONIBLE` (correctif 2026-09-05). Une route qui
 * a échoué DIT-le, dans le `.combien` ET à la place de ses rangées : rendre un
 * `<ul>` vide sous un compte normal laisserait croire à un « aucun résultat »
 * qui n'est pas ce qui s'est passé — l'écran n'a pas cherché en vain, il n'a
 * pas pu joindre CE service.
 */
const groupe = ({
  titre,
  compte,
  lignes,
  encore,
  indisponible = false,
}: {
  readonly titre: string;
  readonly compte: string;
  readonly lignes: string;
  readonly encore: boolean;
  readonly indisponible?: boolean;
}): string =>
  `<section class="groupe${indisponible ? ' indisponible' : ''}">` +
  '<header class="entete">' +
  `<h2>${echappe(titre)}</h2>` +
  `<span class="combien">${echappe(indisponible ? RECHERCHE.groupeIndisponible : compte)}</span>` +
  '</header>' +
  (indisponible
    ? `<p class="panne-groupe">${echappe(RECHERCHE.groupeIndisponiblePrecision)}</p>`
    : `<ul>${lignes}</ul>` + (encore ? `<p class="encore">${echappe(RECHERCHE.encore)}</p>` : '')) +
  '</section>';

const enTete = (): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/" aria-label="${echappe(RECHERCHE.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(RECHERCHE.titre)}</h1>` +
  `<p class="sous">${echappe(RECHERCHE.portee)}</p>` +
  '</div>' +
  '</header>';

const resultats = (etat: EtatDeLaRecherche): string => {
  // RIEN DE DEMANDÉ, RIEN À DIRE. L'état initial est une invitation à chercher,
  // pas un « aucun résultat » qui accuserait le lecteur de n'avoir rien trouvé
  // alors qu'il n'a rien demandé.
  if (etat.requete.trim() === '') {
    return carteVide({
      glyphe: GLYPHE_RECHERCHE,
      titre: RECHERCHE.invite,
      phrase: RECHERCHE.invitePrecision,
    });
  }

  // « AUCUN RÉSULTAT » NE SE DIT QUE SI LES QUATRE ROUTES ONT RÉPONDU vides —
  // un groupe INDISPONIBLE n'est pas un groupe vide (correctif 2026-09-05) :
  // le confondre dirait au lecteur « rien ne correspond » quand la vérité est
  // « ce service n'a pas répondu, réessayez ».
  if (
    etat.conversations.length === 0 &&
    !etat.conversationsIndisponibles &&
    etat.personnes.length === 0 &&
    !etat.personnesIndisponibles &&
    etat.medias.length === 0 &&
    !etat.mediasIndisponibles &&
    etat.liens.length === 0 &&
    !etat.liensIndisponibles
  ) {
    return carteVide({
      glyphe: GLYPHE_RECHERCHE,
      titre: RECHERCHE.vide,
      phrase: RECHERCHE.videPrecision,
    });
  }

  return (
    '<div class="trouvailles">' +
    (etat.conversations.length === 0 && !etat.conversationsIndisponibles
      ? ''
      : groupe({
          titre: RECHERCHE.groupeConversations,
          compte: RECHERCHE.affichees(etat.conversations.length),
          lignes: etat.conversations.map(ligneDeConversation).join(''),
          encore: false,
          indisponible: etat.conversationsIndisponibles,
        })) +
    (etat.personnes.length === 0 && !etat.personnesIndisponibles
      ? ''
      : groupe({
          titre: RECHERCHE.groupePersonnes,
          compte: RECHERCHE.affichees(etat.personnes.length),
          lignes: etat.personnes.map(ligneDePersonne).join(''),
          encore: etat.encoreDesPersonnes,
          indisponible: etat.personnesIndisponibles,
        })) +
    (etat.medias.length === 0 && !etat.mediasIndisponibles
      ? ''
      : groupe({
          titre: RECHERCHE.groupeMedias,
          compte: RECHERCHE.affiches(etat.medias.length),
          lignes: etat.medias.map(ligneDeMedia).join(''),
          encore: etat.encoreDesMedias,
          indisponible: etat.mediasIndisponibles,
        })) +
    (etat.liens.length === 0 && !etat.liensIndisponibles
      ? ''
      : groupe({
          titre: RECHERCHE.groupeLiens,
          compte: RECHERCHE.affiches(etat.liens.length),
          lignes: etat.liens.map(ligneDeLien).join(''),
          encore: etat.encoreDesLiens,
          indisponible: etat.liensIndisponibles,
        })) +
    '</div>'
  );
};

/**
 * LA RÉGION QUE LE MODULE ÉCHANGE (#4897). Le direct de cet écran ne compose
 * RIEN côté client : il redemande CE document au serveur (`/search?q=…`),
 * en extrait `#resultats` — composé par le MÊME code, Prisme et gardes de
 * présence compris — et le pose ici. Un identifiant, deux lecteurs : la vue
 * qui le sert, le module qui l'échange.
 */
const corps = (etat: EtatDeLaRecherche, participation: string): string =>
  `<main id="main-content" class="recherche-ecran"${participation}>` +
  enTete() +
  formulaire(etat.requete) +
  `<div id="resultats">${resultats(etat)}</div>` +
  '</main>';

export const documentDeLaRecherche = (etat: EtatDeLaRecherche): string =>
  documentPleinEcran({
    titre: RECHERCHE.titre,
    description: RECHERCHE.portee,
    corps: corps(
      etat,
      etat.tempsReel === null
        ? ''
        : ` data-participation="recherche" data-module="${echappe(etat.tempsReel.module)}"`,
    ),
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DE_LA_RECHERCHE,
    script: etat.tempsReel === null ? '' : CHARGEUR_DE_PARTICIPATION,
  });

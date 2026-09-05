import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import type { Contact, Demande, Personne } from '@/lib/api/contacts';
import {
  CONTACTS,
  GLYPHE_CONTACT,
  GLYPHE_ENVOYEE,
  GLYPHE_RECUE,
} from '@/lib/contenu/contacts';
import { getUserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DES_CONTACTS } from './contacts-feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { CHARGEUR_DE_PARTICIPATION } from './chargeur';
import { documentPleinEcran } from './fil-vue';
import { carteVide, quand } from './vue';

/**
 * L'ÉCRAN DES CONTACTS (`cible/contacts.png`, issue #4932).
 *
 * UNE SEULE LISTE, TROIS SORTES DE LIGNES. La cible ne dessine ni onglets ni
 * sections : les demandes reçues d'abord — ce sont les seules sur lesquelles on
 * peut agir —, puis les demandes envoyées, puis le carnet. L'ordre EST
 * l'information : ce qui attend le lecteur est en haut.
 *
 * « ACCEPTER » ET « REFUSER » ONT UN EFFET SANS UNE LIGNE DE JAVASCRIPT. Ce
 * sont deux `<form method="post">` vers la MÊME adresse, que la route traite en
 * Post/Redirect/Get — le chemin qui marche partout, y compris quand le module
 * de temps réel n'est jamais arrivé. Le direct viendra l'AMÉLIORER (mise à jour
 * optimiste, retrait de la ligne sans rechargement), il ne le remplacera pas :
 * c'est la loi 4 de la charte — un contrôle existe s'il a un effet — tenue par
 * le moyen le plus pauvre, donc le plus sûr.
 *
 * « EN ATTENTE » N'EST PAS UN BOUTON. Une demande envoyée ne se répond pas
 * par son auteur ; la passerelle la refuserait. C'est un CONSTAT, rendu en
 * texte, et il ne se touche pas.
 *
 * LA PRÉSENCE VIENT DE LA LOI PARTAGÉE, ET `offline` NE SE DESSINE PAS.
 * `getUserPresenceStatus` (`packages/shared/utils/user-presence.ts`) est la
 * source de vérité des quatre états — la réécrire ici ferait une quatrième
 * jumelle à côté d'iOS et d'Android. Un `offline` ne rend AUCUNE pastille : la
 * règle produit l'interdit sur un avatar, et c'est aussi ce qui rend une
 * présence MASQUÉE indiscernable d'une absence — ce qu'elle doit être.
 */

export type EtatDesContacts = {
  readonly demandesRecues: readonly Demande[];
  readonly demandesEnvoyees: readonly Demande[];
  readonly contacts: readonly Contact[];
  readonly maintenant: number;
  /** Ce que le POST vient de faire, dit au retour de la redirection. */
  readonly avis: 'acceptee' | 'refusee' | 'echouee' | null;
  /** Ce que le document porte pour son module de participation (§ 12.4, #4921) — sans socket, comme `/feed`. */
  readonly tempsReel: { readonly module: string; readonly passerelle: string } | null;
};

const CLASSE_DE_PRESENCE: Readonly<Record<string, string>> = {
  online: 'en-ligne',
  away: 'absent',
  idle: 'inactif',
};

/**
 * LA PASTILLE — rendue seulement quand la loi partagée rend autre chose
 * qu'`offline`. Elle est `aria-hidden` : ce qu'elle dit, la ligne le dit déjà
 * en toutes lettres pour qui ne voit pas la couleur.
 */
const pastille = (personne: Personne, maintenant: number): string => {
  const etat = getUserPresenceStatus(
    { isOnline: personne.enLigne, lastActiveAt: personne.vuA },
    maintenant,
  );
  const classe = CLASSE_DE_PRESENCE[etat];
  return classe === undefined ? '' : `<span class="pastille ${classe}" aria-hidden="true"></span>`;
};

const vignette = (glyphe: string, dessous: string): string =>
  `<span class="vignette" aria-hidden="true">${svgDuSprite(glyphe)}${dessous}</span>`;

/**
 * LES DEUX GESTES D'UNE DEMANDE REÇUE. Le formulaire poste vers la MÊME adresse
 * — pas d'attribut `action` : le défaut du navigateur EST l'adresse courante, et
 * il suit la route quoi qu'il arrive.
 *
 * L'identifiant de la demande voyage en champ CACHÉ plutôt que dans l'URL : un
 * POST dont la cible est dans le corps ne laisse pas d'identifiant dans
 * l'historique ni dans les journaux d'un intermédiaire.
 *
 * « REFUSER » N'EST PAS SUR LA CIBLE, ET IL EST LÀ QUAND MÊME. La planche
 * dessine « Accepter » puis un chevron vers un écran de détail que la v3 ne
 * rend pas ; sans second geste, une demande non désirée resterait dans la liste
 * pour toujours — la dimension 13 (complétude) manque un état que rien d'autre
 * ne sert. Le silence de la cible n'est pas une prescription (directive
 * 2026-09-02) : ce qui la COMPLÈTE s'agrège. Il reste secondaire — un glyphe et
 * son libellé pour les lecteurs d'écran, jamais un second bouton plein à côté
 * du premier.
 *
 * DEUX FORMULAIRES PLUTÔT QU'UN. Un seul formulaire avec deux boutons
 * `name="geste"` marcherait dans tous les navigateurs modernes, et se casse
 * exactement là où la v3 promet de tenir : un client qui soumet sans bouton
 * (« Entrée » dans un champ, un mode de navigation ancien) n'envoie AUCUN
 * `geste`. Deux formulaires rendent le geste indissociable de sa soumission.
 */
const gestes = (demande: Demande): string =>
  '<span class="gestes">' +
  `<form method="post">` +
  `<input type="hidden" name="demande" value="${echappe(demande.id)}">` +
  `<button type="submit" name="geste" value="accepter" class="action discrete">${svgDuSprite('ph-check')}${echappe(CONTACTS.accepter)}</button>` +
  '</form>' +
  `<form method="post">` +
  `<input type="hidden" name="demande" value="${echappe(demande.id)}">` +
  `<button type="submit" name="geste" value="refuser" class="action discrete" aria-label="${echappe(`${CONTACTS.refuser} — ${demande.personne.nom}`)}">${svgDuSprite('ph-x-circle')}</button>` +
  '</form>' +
  '</span>' +
  // LA FENTE DU GESTE FAIT — servie CACHÉE, remplie et révélée par le module
  // du direct (`lib/realtime/contacts.ts`) : il ne fabrique aucun nœud.
  '<span class="etat-du-geste" hidden></span>';

const ligneDeDemande = (demande: Demande, maintenant: number): string => {
  const recue = demande.sens === 'recue';
  const instant = quand(demande.creeeA, maintenant);
  const libelle = recue ? CONTACTS.demandeRecue : CONTACTS.demandeEnvoyee;

  return (
    `<li class="contact" data-sorte="${recue ? 'recue' : 'envoyee'}"${recue ? ` data-demande="${echappe(demande.id)}"` : ''}>` +
    vignette(recue ? GLYPHE_RECUE : GLYPHE_ENVOYEE, pastille(demande.personne, maintenant)) +
    '<span class="dit">' +
    `<span class="primaire">${echappe(demande.personne.nom)}</span>` +
    `<span class="secondaire">${echappe(instant === '' ? libelle : `${libelle} ${instant}`)}</span>` +
    '</span>' +
    (recue
      ? gestes(demande)
      : `<span class="etat">${echappe(CONTACTS.enAttenteDeReponse)}</span>`) +
    '</li>'
  );
};

/**
 * UNE LIGNE DE CARNET. La seconde ligne porte le pseudonyme quand il existe —
 * c'est ce qui distingue deux homonymes. La cible y ajoute la langue ; aucune
 * des deux routes ne la sert, et l'inventer serait une promesse de Prisme que
 * rien ne tient (`lib/api/contacts.ts`).
 */
const ligneDeContact = (contact: Contact, maintenant: number): string =>
  '<li class="contact" data-sorte="contact">' +
  vignette(GLYPHE_CONTACT, pastille(contact.personne, maintenant)) +
  '<span class="dit">' +
  `<span class="primaire">${echappe(contact.nom)}</span>` +
  (contact.personne.pseudonyme === null
    ? ''
    : `<span class="secondaire">@${echappe(contact.personne.pseudonyme)}</span>`) +
  '</span>' +
  '</li>';

const enTete = (enAttente: number): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/chats" aria-label="${echappe(CONTACTS.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(CONTACTS.titre)}</h1>` +
  (enAttente === 0 ? '' : `<p class="sous">${echappe(CONTACTS.enAttente(enAttente))}</p>`) +
  '</div>' +
  '</header>';

const PHRASE_DE_L_AVIS: Readonly<Record<string, string>> = {
  acceptee: CONTACTS.acceptee,
  refusee: CONTACTS.refusee,
  echouee: CONTACTS.echouee,
};

const avis = (lequel: EtatDesContacts['avis']): string => {
  if (lequel === null) return '';
  const glyphe = lequel === 'echouee' ? 'ph-x-circle' : 'ph-check-circle';
  return `<p class="avis" role="status">${svgDuSprite(glyphe)}${echappe(PHRASE_DE_L_AVIS[lequel] ?? '')}</p>`;
};

const corps = (etat: EtatDesContacts): string => {
  const lignes =
    etat.demandesRecues.map((d) => ligneDeDemande(d, etat.maintenant)).join('') +
    etat.demandesEnvoyees.map((d) => ligneDeDemande(d, etat.maintenant)).join('') +
    etat.contacts.map((c) => ligneDeContact(c, etat.maintenant)).join('');

  const participation =
    etat.tempsReel === null
      ? ''
      : ` data-participation="contacts" data-module="${echappe(etat.tempsReel.module)}" data-passerelle="${echappe(etat.tempsReel.passerelle)}"`;

  return (
    `<main id="main-content" class="contacts-ecran"${participation}>` +
    enTete(etat.demandesRecues.length) +
    avis(etat.avis) +
    // LA VOIX DE L'ÉCRAN — servie même muette, comme sur `/chats` : une région
    // créée après coup n'est annoncée par aucun lecteur d'écran. Le module y
    // dit le geste optimiste, son annulation possible et son éventuel refus.
    '<p class="defaite" id="journal-des-gestes" role="status" aria-live="polite"></p>' +
    (lignes === ''
      ? carteVide({
          glyphe: GLYPHE_CONTACT,
          titre: CONTACTS.vide,
          phrase: CONTACTS.videPrecision,
        })
      : `<ul class="contacts" aria-label="${echappe(CONTACTS.liste)}">${lignes}</ul>`) +
    '</main>'
  );
};

export const documentDesContacts = (etat: EtatDesContacts): string =>
  documentPleinEcran({
    titre: CONTACTS.titre,
    description:
      etat.demandesRecues.length === 0
        ? CONTACTS.titre
        : CONTACTS.enAttente(etat.demandesRecues.length),
    corps: corps(etat),
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_CONTACTS,
    script: etat.tempsReel === null ? '' : CHARGEUR_DE_PARTICIPATION,
  });

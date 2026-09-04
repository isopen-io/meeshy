import { svgDuSprite } from '@/app/actifs-inlines';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { documentDuSite } from '@/app/enveloppe/vue';
import { echappe } from '@/app/socle';

import { apercuServi, homologueDe, type Conversation, type Lecteur } from '@/lib/api/compte';
import { compteDeParticipants, enUneLigne } from '@/lib/contenu/fil';
import {
  ACTIONS,
  CHATS,
  CONFIRMATIONS,
  GESTES,
  NOUVELLE_CONVERSATION,
  libelleDuGeste,
  type ConfirmationDeGeste,
  type GesteDeLigne,
} from '@/lib/contenu/liste';
import type { Contact } from '@/lib/api/contacts';

import { CHARGEUR_DE_PARTICIPATION, blocDuNavigateur, type TempsReel } from './chargeur';
import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DE_LA_BANNIERE } from './banniere-feuille';
import { REGION_DE_LA_BANNIERE } from './banniere-vue';
import { FEUILLE_DES_FLOTTANTES, FEUILLE_DE_L_ESPACE } from './espace-feuille';
import { actionsFlottantes, feuilleDeLEspace } from './espace-vue';
import { FEUILLE_DE_LA_LISTE, FEUILLE_DE_LA_NOUVELLE_CONV } from './liste-feuille';
import { FEUILLE_DU_PROFIL } from './profil-feuille';
import { adresseDuProfil, surimpressionDuProfil, type ProfilDeLaSurimpression } from './profil-vue';
import { apercuAuPrisme, avatar, carteVide, quand, versLeFil } from './vue';

/**
 * `/chats` — LA LISTE DES CONVERSATIONS, rendue par le SERVEUR, et la surface
 * sur laquelle le module de participation se greffe (§ 12.4).
 *
 * Tout ce que le module fait, ce document le fait déjà sans lui : la ligne
 * porte son aperçu au Prisme, son compte de non-lus, son heure et ses trois
 * gestes, et un rechargement suffit à la remettre à jour. Le module ne fait que
 * SUPPRIMER le rechargement — c'est une amélioration progressive, jamais une
 * condition.
 *
 * LA LIGNE EST UNE MACHINE, PAS UNE CHAÎNE. Elle porte dans ses `data-` tout ce
 * dont le module a besoin pour la déplacer, la repeindre et la défaire —
 * l'identifiant, le titre, l'instant de son dernier message, l'état de sourdine
 * — parce qu'un module qui relirait ces valeurs dans le TEXTE affiché
 * dépendrait de la mise en forme : « il y a 30 min » ne se compare pas.
 *
 * LES TROIS GESTES ONT TROIS CHEMINS, ET UN SEUL VOCABULAIRE (§ 12.10.4). Le
 * `<form method="post">` de chaque ligne est le chemin qui marche partout ; le
 * `<details>` qui le porte est le chemin CLAVIER et LECTEUR D'ÉCRAN ; le
 * balayage, posé par le module, ne fait que SOUMETTRE ce même formulaire. Il
 * n'existe donc aucun chemin réservé au doigt — la dimension 5 est tenue par
 * construction, pas par une duplication d'intention.
 */

const glyphe = (nom: string): string => `<span class="glyphe" aria-hidden="true">${svgDuSprite(nom)}</span>`;

/**
 * L'APERÇU D'UNE LIGNE — composé par `apercuAuPrisme` (`app/connecte/vue.ts`),
 * le site UNIQUE que cette liste partage avec la carte du tableau de bord : la
 * même donnée, dite de la même façon sur les deux écrans qu'un tap sépare.
 *
 * `reserve: true` est ce que cette liste demande en propre — les fentes sont
 * servies MÊME VIDES parce que le module de participation y écrit le premier
 * message reçu sans avoir à créer de nœud (il n'a pas de disque d'où tirer le
 * glyphe du sprite, et créer un nœud recalculerait la mise en page de la ligne
 * au moment où elle bouge). Le tableau de bord, qui n'a pas de module, ne paie
 * pas ces fentes.
 */
const apercu = (conversation: Conversation, langues: readonly string[]): string =>
  apercuAuPrisme({ servi: apercuServi(conversation, langues), reserve: true });

/**
 * LE MENU D'UNE LIGNE — un `<details>` natif, un `<form method="post">`, trois
 * `<button>` qui SOUMETTENT (§ 12.10.4). Aucun `role`, aucun `aria-expanded`
 * posé à la main : `<details>` les porte déjà, et un `div` déguisé en menu est
 * exactement ce que la charte règle 5 interdit.
 *
 * Les trois valeurs de `geste` sont celles de `lib/contenu/liste.ts` : la porte
 * les relit avec le MÊME prédicat (`estUnGeste`), si bien qu'un geste ajouté ne
 * peut pas exister d'un seul côté.
 */
const bouton = (geste: GesteDeLigne, sourdine: boolean): string =>
  `<button type="submit" name="geste" value="${geste}"${geste === 'supprimer' ? ' class="grave"' : ''}>` +
  `${echappe(libelleDuGeste({ geste, sourdine }))}</button>`;

const menu = (conversation: Conversation, adresse: string): string =>
  '<details class="actions">' +
  `<summary>${glyphe('ph-caret-down')}<span class="hors-ecran">${echappe(ACTIONS.menu(conversation.titre))}</span></summary>` +
  `<form method="post" action="${echappe(adresse)}">` +
  `<input type="hidden" name="conversation" value="${echappe(conversation.id)}"/>` +
  // L'état d'AVANT voyage avec le formulaire : c'est lui qui décide du sens de
  // la bascule, et le relire côté serveur coûterait un `GET /conversations` de
  // plus sur le geste le plus courant.
  `<input type="hidden" name="sourdine" value="${conversation.sourdine ? '1' : '0'}"/>` +
  GESTES.map((geste) => bouton(geste, conversation.sourdine)).join('') +
  '</form>' +
  '</details>';

/**
 * LES DEUX PISTES du balayage — révélées SOUS la ligne, jamais peintes par le
 * module : ce qui est servi n'a pas à être fabriqué, et un fond coloré sans son
 * mot ne dirait rien à qui ne distingue pas les couleurs (charte règle 23).
 *
 * Elles sont `aria-hidden` : le lecteur d'écran a le MENU, qui dit les mêmes
 * trois gestes avec leurs vrais contrôles. Les lui annoncer deux fois ferait
 * lire chaque ligne cinq fois.
 */
const pistes = (): string =>
  `<span class="piste avant" aria-hidden="true">${echappe(ACTIONS.archiver)}</span>` +
  `<span class="piste apres" aria-hidden="true">${echappe(ACTIONS.supprimer)}</span>`;

/**
 * LA PASTILLE DE NON-LUS — un nombre NU à l'œil, et son MOT à la voix.
 *
 * Le nombre a sa PROPRE fente (`.valeur`), et ce n'est pas de la décoration :
 * le module repeint ce compte à chaque `conversation:unread-updated`, et
 * écrire le nombre dans la pastille elle-même EFFACERAIT le libellé hors écran
 * qu'elle porte — « 3 » cesserait de se dire « 3 non lus » dès la première
 * mise à jour, sans qu'aucun rendu ne change à l'œil.
 */
const compte = (nonLus: number): string =>
  '<span class="compte">' +
  `<span class="valeur">${nonLus}</span>` +
  `<span class="hors-ecran"> ${echappe(CHATS.nonLus)}</span>` +
  '</span>';

/**
 * LA MÉTA D'UNE LIGNE — le compte de participants (qui se TAIT à deux,
 * § 12.10.2, seuil unique dans `lib/contenu/fil.ts`) et la sourdine, quand elle
 * est posée. La sourdine se dit en TEXTE et non par un glyphe : le sprite n'a
 * pas de cloche barrée, et une cloche pleine dirait le contraire de ce qu'elle
 * annonce.
 */
const meta = (conversation: Conversation): string => {
  const morceaux = enUneLigne([
    compteDeParticipants({ membres: conversation.membres, mot: CHATS.participants }),
    conversation.sourdine ? CHATS.sourdine : '',
  ]);
  // SERVIE MÊME VIDE, et CACHÉE : la sourdine se bascule en direct, et une
  // ligne qui n'a rien à dire aujourd'hui doit pouvoir le dire demain sans
  // qu'un nœud n'apparaisse sous le doigt du lecteur. `data-membres` porte le
  // compte pour que la recomposition n'ait pas à relire la phrase affichée.
  return (
    `<span class="meta" data-membres="${conversation.membres}"${morceaux === '' ? ' hidden' : ''}>` +
    `${echappe(morceaux)}</span>`
  );
};

/**
 * L'AVATAR D'UNE LIGNE — un cliquable VERS LE PROFIL de l'autre personne d'un
 * tête-à-tête (§ 12.10.3), séparé du `<a class="ligne">` qui mène au fil :
 * deux destinations, deux `<a>`, jamais un lien dans un lien. Un GROUPE, ou un
 * tête-à-tête dont le pair est un invité sans compte, n'a personne à montrer —
 * l'avatar reste alors DANS la ligne, comme avant (`homologueDe` rend `null`).
 */
const avatarDeLaLigne = ({
  conversation,
  moi,
  adresse,
}: {
  readonly conversation: Conversation;
  readonly moi: string | null;
  readonly adresse: string;
}): { readonly horsDeLaLigne: string; readonly dansLaLigne: string } => {
  const cible = homologueDe(conversation, moi);
  if (cible === null) return { horsDeLaLigne: '', dansLaLigne: avatar(conversation.titre) };
  return {
    horsDeLaLigne: `<a class="avatar-lien" href="${echappe(adresseDuProfil(adresse, cible.id))}" aria-label="${echappe(CHATS.voirLeProfil(cible.nom))}">${avatar(conversation.titre)}</a>`,
    dansLaLigne: '',
  };
};

export const ligne = ({
  conversation,
  langues,
  maintenant,
  adresse,
  moi,
}: {
  readonly conversation: Conversation;
  readonly langues: readonly string[];
  readonly maintenant: number;
  readonly adresse: string;
  /** Pour élire l'AUTRE personne d'un tête-à-tête (`homologueDe`) — `null` sans identité connue. */
  readonly moi: string | null;
}): string => {
  const { horsDeLaLigne, dansLaLigne } = avatarDeLaLigne({ conversation, moi, adresse });
  return (
    `<li data-conversation="${echappe(conversation.id)}"` +
    ` data-titre="${echappe(conversation.titre)}"` +
    ` data-quand="${echappe(conversation.dernierMessageA ?? '')}"` +
    ` data-nonlus="${conversation.nonLus}"` +
    ` data-sourdine="${conversation.sourdine ? '1' : '0'}">` +
    pistes() +
    '<div class="glissiere">' +
    horsDeLaLigne +
    // `draggable="false"` : un `<a href>` est GLISSABLE par défaut, et Chromium
    // ouvre un glisser-déposer natif dès que le pointeur bouge — ce qui ANNULE le
    // balayage (`pointercancel`) sous la souris et le stylet. Une ligne de
    // conversation n'est pas un lien qu'on dépose ailleurs : le dire ici est ce
    // qui rend le geste du § 12.10.4 possible hors du doigt.
    `<a class="ligne" draggable="false" href="${echappe(versLeFil(conversation))}">` +
    dansLaLigne +
    '<span class="corps">' +
    '<span class="tete">' +
    `<span class="nom">${echappe(conversation.titre)}</span>` +
    `<span class="quand">${echappe(quand(conversation.dernierMessageA, maintenant))}</span>` +
    '</span>' +
    meta(conversation) +
    apercu(conversation, langues) +
    `<span class="frappe" hidden></span>` +
    '</span>' +
    compte(conversation.nonLus) +
    '</a>' +
    menu(conversation, adresse) +
    '</div>' +
    '</li>'
  );
};

export type EtatDesChats = {
  readonly conversations: readonly Conversation[];
  readonly maintenant: number;
  /** Le prisme du lecteur, ORDONNÉ (`resolveUserLanguagesOrdered`) — jamais une liste recomposée ici. */
  readonly langues: readonly string[];
  /** L'identité du lecteur, pour que le module ignore SA propre frappe. */
  readonly moi: string | null;
  readonly tempsReel: TempsReel | null;
  /**
   * CE QUE LA PORTE VIENT DE FAIRE, dit au lecteur — un geste sans JavaScript
   * n'a pas d'autre voix que celle-ci (Post/Redirect/Get). C'est une CLÉ d'un
   * vocabulaire clos, jamais une phrase : rien de ce qu'un tiers écrirait dans
   * l'adresse n'atteint le document.
   */
  readonly fait?: ConfirmationDeGeste | null;
  /** Le geste a été refusé par la passerelle — une phrase, la même pour les trois. */
  readonly echoue?: boolean;
  /**
   * LE PROFIL D'UN PARTICIPANT OUVERT DEPUIS CETTE LISTE (`?profil=`,
   * § 12.10.3) — un ÉTAT de cette adresse, comme sur le fil, et pour les MÊMES
   * raisons (`app/connecte/profil-vue.ts`). `null` — le cas nominal — ne rend
   * rien : aucune requête de plus sur une lecture ordinaire.
   */
  readonly profil?: ProfilDeLaSurimpression | null;
  /**
   * LA FEUILLE « NOUVELLE CONVERSATION » (`?nouvelle`, `sheet:conv` #5072) —
   * un ÉTAT de cette adresse, comme `?profil=`. `undefined` — le cas nominal —
   * ne rend rien et ne coûte aucune requête : le carnet de contacts n'est
   * demandé que dans cet état.
   */
  readonly nouvelle?: EtatDeLaNouvelleConv;
  /**
   * LA FEUILLE « ESPACE MEMBRE » (`?espace`, `sheet:member`) — le troisième
   * état de cette adresse. Elle remplace la barre d'onglets que la planche n'a
   * pas (conception § 11, question 6) et ne coûte AUCUNE requête : tout ce
   * qu'elle rend, la porte le tient déjà.
   */
  readonly espace?: boolean;
  /** Le lecteur, pour NOMMER l'espace membre sous son titre. Rien d'autre ne le lit ici. */
  readonly lecteur?: Lecteur | null;
};

/** Ce que la feuille de création connaît — son carnet, sa saisie, son refus. */
export type EtatDeLaNouvelleConv = {
  readonly contacts: readonly Contact[];
  readonly nom: string;
  readonly description: string;
  readonly invites: ReadonlySet<string>;
  readonly motif: string | null;
};

export const CHAMPS_DE_LA_NOUVELLE_CONV = {
  /**
   * LE MARQUEUR EXPLICITE. `/chats` reçoit DEUX familles de POST — les gestes
   * d'une ligne et les actions du panneau de profil — et la porte les
   * distingue aujourd'hui par ce qu'elles PORTENT. Une troisième famille
   * reconnue « parce qu'elle a un champ `nom` » se ferait voler par la
   * première qui en gagnerait un. Le marqueur dit ce que le formulaire EST.
   */
  quoi: 'quoi',
  marque: 'nouvelle-conversation',
  nom: 'nom',
  description: 'description',
  invite: 'invite',
} as const;

export const NOUVELLE_CONV_NEUVE = (contacts: readonly Contact[]): EtatDeLaNouvelleConv => ({
  contacts,
  nom: '',
  description: '',
  invites: new Set<string>(),
  motif: null,
});

export const ADRESSE_DE_LA_LISTE = '/chats';

/**
 * CE QUE LE DOCUMENT PORTE POUR SON MODULE. Rien de plus que ce qu'il lui faut
 * pour parler à la passerelle au nom du lecteur : l'origine joignable, les deux
 * actifs à leur adresse hachée, l'identité et le prisme. Le jeton, lui, n'est
 * PAS servi dans le document — le module le lit dans le cookie que la remise a
 * posé, comme celui du fil (`lib/api/cookies.ts`).
 */
const attributsDeParticipation = (etat: EtatDesChats): string => {
  if (etat.tempsReel === null) return '';
  const { actifs, passerelle } = etat.tempsReel;
  return (
    ' data-participation="liste"' +
    ` data-module="${echappe(actifs.liste.url)}"` +
    ` data-socket="${echappe(actifs.socket.url)}"` +
    ` data-passerelle="${echappe(passerelle)}"` +
    ` data-adresse="${echappe(ADRESSE_DE_LA_LISTE)}"` +
    (etat.moi === null ? '' : ` data-moi="${echappe(etat.moi)}"`) +
    ` data-langues="${echappe(etat.langues.join(','))}"`
  );
};

/**
 * LA RÉGION QUI DIT CE QUI VIENT D'ARRIVER — un geste réussi, un geste refusé.
 *
 * Elle est SERVIE (et non fabriquée par le module) pour deux raisons : sans
 * JavaScript, la redirection qui suit un `POST` n'a aucune autre façon de dire
 * ce qui a eu lieu ; et une région `aria-live` créée après coup n'est pas
 * annoncée par tous les lecteurs d'écran — elle doit être là AVANT que son
 * contenu ne change.
 */
const journal = (etat: EtatDesChats): string =>
  '<p class="defaite" id="journal-des-gestes" role="status" aria-live="polite">' +
  (etat.fait === null || etat.fait === undefined ? '' : `<span class="quoi">${echappe(CONFIRMATIONS[etat.fait])}</span>`) +
  '</p>' +
  (etat.echoue === true ? `<p class="alerte" role="alert">${echappe(ACTIONS.echec)}</p>` : '');

const corps = (etat: EtatDesChats): string =>
  '<div class="bonjour">' +
  `<h1>${echappe(CHATS.titre)}</h1>` +
  `<p>${echappe(CHATS.accroche)}</p>` +
  `<a class="action primaire" href="${ADRESSE_DE_LA_LISTE}?nouvelle">${echappe(NOUVELLE_CONVERSATION.ouvrir)}</a>` +
  '</div>' +
  journal(etat) +
  `<section class="liste" aria-label="${echappe(CHATS.titre)}">` +
  (etat.conversations.length === 0
    ? carteVide({ glyphe: 'ph-chats-circle', titre: CHATS.vide, phrase: CHATS.videPrecision })
    : `<ul>${etat.conversations
        .map((conversation) =>
          ligne({ conversation, langues: etat.langues, maintenant: etat.maintenant, adresse: ADRESSE_DE_LA_LISTE, moi: etat.moi }),
        )
        .join('')}</ul>`) +
  '</section>' +
  // LES DEUX RONDS, aux mêmes coins qu'au tableau de bord (planche `:868`).
  // Dans le FLUX : leur conteneur réserve la bande, sinon ils couvriraient la
  // dernière ligne de la liste au repos (charte règle 7 b/c).
  actionsFlottantes(ADRESSE_DE_LA_LISTE);


/**
 * LA FEUILLE « NOUVELLE CONVERSATION » — servie par le SERVEUR dans l'état
 * `/chats?nouvelle`, en `<dialog open data-retour>`.
 *
 * DEUX GESTES, ET C'EST LE CRITÈRE DE FIN : ouvrir, soumettre. Le nom suffit ;
 * cocher des contacts est facultatif, et une conversation qui naît vide se
 * remplit ensuite par un lien de partage.
 *
 * ÉCHAP LA FERME ICI, contrairement à la feuille des liens — et la différence
 * n'est pas un choix de plus, c'est un FAIT : `/chats` sert déjà son module de
 * participation (le temps réel de la liste), donc `plein-ecran.ts` y court, et
 * l'élévation est GRATUITE. `/links` n'expédie aucun script, et n'en charge pas
 * un pour une touche. La même surimpression, deux écrans, deux niveaux
 * d'amélioration — le socle, lui, est le même : trois liens de fermeture.
 *
 * LE CARNET DÉFILE DANS LA FEUILLE. Quarante contacts pousseraient sinon le
 * bouton « Créer » hors de vue, et le lecteur ne saurait pas qu'il existe.
 */
const nouvelleConversation = (etat: EtatDeLaNouvelleConv): string => {
  const carnet =
    etat.contacts.length === 0
      ? `<p class="aide">${echappe(NOUVELLE_CONVERSATION.sansContact)}</p>`
      : `<ul class="carnet">${etat.contacts
          .map(
            (contact) =>
              `<li><label class="coche"><input type="checkbox" name="${CHAMPS_DE_LA_NOUVELLE_CONV.invite}" value="${echappe(contact.personne.id)}"${etat.invites.has(contact.personne.id) ? ' checked' : ''}>${echappe(contact.nom)}</label></li>`,
          )
          .join('')}</ul>`;

  return (
    `<a class="voile" href="${ADRESSE_DE_LA_LISTE}" aria-label="${echappe(NOUVELLE_CONVERSATION.fermer)}"></a>` +
    '<dialog class="nouvelle-conv" open aria-modal="true" aria-labelledby="titre-de-la-conv" ' +
    `data-retour="${ADRESSE_DE_LA_LISTE}">` +
    `<a class="poignee" href="${ADRESSE_DE_LA_LISTE}" aria-label="${echappe(NOUVELLE_CONVERSATION.fermer)}"></a>` +
    '<div class="tete">' +
    `<div class="dit"><h2 id="titre-de-la-conv">${echappe(NOUVELLE_CONVERSATION.titre)}</h2></div>` +
    `<a class="fermer" href="${ADRESSE_DE_LA_LISTE}" aria-label="${echappe(NOUVELLE_CONVERSATION.fermer)}">${svgDuSprite('ph-x')}</a>` +
    '</div>' +
    (etat.motif === null
      ? ''
      : `<p class="alerte" role="alert">${echappe(etat.motif === '' ? NOUVELLE_CONVERSATION.refuse : `${NOUVELLE_CONVERSATION.refuse} ${etat.motif}`)}</p>`) +
    '<form method="post">' +
    `<input type="hidden" name="${CHAMPS_DE_LA_NOUVELLE_CONV.quoi}" value="${CHAMPS_DE_LA_NOUVELLE_CONV.marque}">` +
    '<p class="champ">' +
    `<label for="c-nom">${echappe(NOUVELLE_CONVERSATION.nom)}</label>` +
    `<input id="c-nom" name="${CHAMPS_DE_LA_NOUVELLE_CONV.nom}" type="text" required value="${echappe(etat.nom)}" autocomplete="off">` +
    `<span class="aide">${echappe(NOUVELLE_CONVERSATION.nomAide)}</span>` +
    '</p>' +
    '<p class="champ">' +
    `<label for="c-description">${echappe(NOUVELLE_CONVERSATION.description)}</label>` +
    `<input id="c-description" name="${CHAMPS_DE_LA_NOUVELLE_CONV.description}" type="text" value="${echappe(etat.description)}" autocomplete="off">` +
    `<span class="aide">${echappe(NOUVELLE_CONVERSATION.descriptionAide)}</span>` +
    '</p>' +
    '<fieldset class="groupe">' +
    `<legend>${echappe(NOUVELLE_CONVERSATION.contacts)}</legend>` +
    `<span class="aide">${echappe(NOUVELLE_CONVERSATION.contactsAide)}</span>` +
    carnet +
    '</fieldset>' +
    `<p class="pied"><button type="submit" class="action primaire">${echappe(NOUVELLE_CONVERSATION.creer)}</button></p>` +
    '</form>' +
    '</dialog>'
  );
};

/**
 * LA SURIMPRESSION — le profil d'un participant, ouvert depuis une ligne de
 * cette liste (§ 12.10.3). Le titre de la conversation EN COMMUN est connu
 * LOCALEMENT : la ligne dont l'avatar a été touché est celle dont
 * `homologueDe` désigne CE handle — jamais une donnée que la route du profil
 * ne sert pas.
 */
const surimpression = (etat: EtatDesChats): string => {
  const { profil } = etat;
  if (profil === null || profil === undefined) return '';
  const conversationEnCommun =
    etat.conversations.find((conversation) => homologueDe(conversation, etat.moi)?.id === profil.handle)?.titre ?? null;
  return surimpressionDuProfil({
    servi: profil.servi,
    handle: profil.handle,
    adresseHote: ADRESSE_DE_LA_LISTE,
    // Aucun message n'est chargé sur cette liste : le fil, lui, connaît la
    // langue d'un auteur (`langueDeLAuteurDansLeFil`) — cette adresse-ci n'en
    // sait rien, et ne fabrique rien.
    langue: null,
    conversationEnCommun,
    confirmerBlocage: profil.confirmerBlocage,
    // Une liste est un écran du MEMBRE : `peutAgir` vaut toujours vrai ici
    // (la porte l'a déjà exigé pour servir `/chats` du tout).
    peutAgir: true,
    langueDuDocument: DOCUMENT_LANGUAGE,
  });
};

export const documentDesChats = (etat: EtatDesChats): string => {
  const dessus = surimpression(etat);
  // TROIS SURIMPRESSIONS, JAMAIS DEUX EN MÊME TEMPS : `?profil=`, `?nouvelle`
  // et `?espace` sont trois états de la même adresse, et le document n'en
  // empile aucun. L'ORDRE est celui de ce qu'on vient d'ouvrir : la création
  // l'emporte sur le profil, l'espace membre sur les deux — c'est la dernière
  // porte touchée, et un `<dialog open>` sous un autre serait un piège à focus
  // sans sortie.
  const creation = etat.nouvelle === undefined ? '' : nouvelleConversation(etat.nouvelle);
  const espace = etat.espace === true ? feuilleDeLEspace({ lecteur: etat.lecteur ?? null, hote: ADRESSE_DE_LA_LISTE }) : '';
  const surimpose = espace !== '' ? espace : creation === '' ? dessus : creation;

  return documentDuSite({
    titre: `${CHATS.titre} — Meeshy`,
    description: CHATS.accroche,
    feuille:
      FEUILLE_CONNECTEE +
      FEUILLE_DE_LA_LISTE +
      FEUILLE_DES_FLOTTANTES +
      (etat.tempsReel === null ? '' : FEUILLE_DE_LA_BANNIERE) +
      (surimpose === dessus && dessus !== '' ? FEUILLE_DU_PROFIL : '') +
      (surimpose === creation && creation !== '' ? FEUILLE_DE_LA_NOUVELLE_CONV : '') +
      (espace === '' ? '' : FEUILLE_DE_L_ESPACE),
    corps: corps(etat),
    retour: true,
    surimpression: surimpose,
    // Voir `documentDuFil` : la région suit le module, jamais l'écran.
    banniere: etat.tempsReel === null ? '' : REGION_DE_LA_BANNIERE,
    attributsDuMain: attributsDeParticipation(etat),
    script: (etat.tempsReel === null ? '' : CHARGEUR_DE_PARTICIPATION) + blocDuNavigateur(),
  });
};

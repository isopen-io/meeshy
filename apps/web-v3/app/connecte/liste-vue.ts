import { svgDuSprite } from '@/app/actifs-inlines';
import { documentDuSite } from '@/app/enveloppe/vue';
import { echappe } from '@/app/socle';

import { apercuServi, type Conversation } from '@/lib/api/compte';
import { compteDeParticipants, enUneLigne } from '@/lib/contenu/fil';
import {
  ACTIONS,
  CHATS,
  CONFIRMATIONS,
  GESTES,
  libelleDuGeste,
  type ConfirmationDeGeste,
  type GesteDeLigne,
} from '@/lib/contenu/liste';

import { CHARGEUR_DE_PARTICIPATION, type TempsReel } from './chargeur';
import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DE_LA_LISTE } from './liste-feuille';
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

export const ligne = ({
  conversation,
  langues,
  maintenant,
  adresse,
}: {
  readonly conversation: Conversation;
  readonly langues: readonly string[];
  readonly maintenant: number;
  readonly adresse: string;
}): string =>
  `<li data-conversation="${echappe(conversation.id)}"` +
  ` data-titre="${echappe(conversation.titre)}"` +
  ` data-quand="${echappe(conversation.dernierMessageA ?? '')}"` +
  ` data-nonlus="${conversation.nonLus}"` +
  ` data-sourdine="${conversation.sourdine ? '1' : '0'}">` +
  pistes() +
  '<div class="glissiere">' +
  // `draggable="false"` : un `<a href>` est GLISSABLE par défaut, et Chromium
  // ouvre un glisser-déposer natif dès que le pointeur bouge — ce qui ANNULE le
  // balayage (`pointercancel`) sous la souris et le stylet. Une ligne de
  // conversation n'est pas un lien qu'on dépose ailleurs : le dire ici est ce
  // qui rend le geste du § 12.10.4 possible hors du doigt.
  `<a class="ligne" draggable="false" href="${echappe(versLeFil(conversation))}">` +
  avatar(conversation.titre) +
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
  '</li>';

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
};

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
  '</div>' +
  journal(etat) +
  `<section class="liste" aria-label="${echappe(CHATS.titre)}">` +
  (etat.conversations.length === 0
    ? carteVide({ glyphe: 'ph-chats-circle', titre: CHATS.vide, phrase: CHATS.videPrecision })
    : `<ul>${etat.conversations
        .map((conversation) =>
          ligne({ conversation, langues: etat.langues, maintenant: etat.maintenant, adresse: ADRESSE_DE_LA_LISTE }),
        )
        .join('')}</ul>`) +
  '</section>';

export const documentDesChats = (etat: EtatDesChats): string =>
  documentDuSite({
    titre: `${CHATS.titre} — Meeshy`,
    description: CHATS.accroche,
    feuille: FEUILLE_CONNECTEE + FEUILLE_DE_LA_LISTE,
    corps: corps(etat),
    retour: true,
    attributsDuMain: attributsDeParticipation(etat),
    script: etat.tempsReel === null ? '' : CHARGEUR_DE_PARTICIPATION,
  });

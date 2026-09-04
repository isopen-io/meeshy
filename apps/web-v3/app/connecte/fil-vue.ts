
import { svgDuSprite } from '@/app/actifs-inlines';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { documentDuSite, teteDuDocument } from '@/app/enveloppe/vue';
import { echappe } from '@/app/socle';
import { THEME_PAR_DEFAUT } from '@/app/theme-script';
/**
 * `TempsReel` et le CHARGEUR vivent dans `app/connecte/chargeur.ts` depuis
 * qu'ils ont DEUX lecteurs — le fil et la liste (§ 12.4). Réexportés ici pour
 * leurs lecteurs historiques.
 */
export { type TempsReel } from './chargeur';
import { CHARGEUR_DE_PARTICIPATION, REGLES_DE_SPECULATION, SCRIPT_DU_TRAVAILLEUR, blocDuNavigateur, type TempsReel } from './chargeur';
import { porteesDuTravailleur } from '@/lib/sw/portees';
export { CHARGEUR_DE_PARTICIPATION };
import { LONGUEUR_MAX_DU_MESSAGE, type Fil } from '@/lib/api/fil';
import type { CleDeLien } from '@/lib/api/guest-session';
import { adresseDesMedias } from '@/lib/api/medias';
import type { Droits } from '@/lib/api/invite';
import { langueDeLAuteurDansLeFil } from '@/lib/api/profil';
import { BANDEAU_DES_DROITS, droitsRendus, type DroitRendu } from '@/lib/contenu/droits';
import { BANDEAUX, compteDeParticipants, ETATS_DU_TEMPS_REEL, FIL, INTROUVABLE, presenceServie } from '@/lib/contenu/fil';
import { nomDeLangue } from '@/lib/contenu/langues';
import { MEDIAS } from '@/lib/contenu/medias';

import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DE_LA_BANNIERE } from './banniere-feuille';
import { REGION_DE_LA_BANNIERE } from './banniere-vue';
import { FEUILLE_DU_FIL, REVELE_LA_DERNIERE_LIGNE } from './fil-feuille';
import { gabaritDeLigne, lignes } from './fil-lignes';
import { FEUILLE_DU_PLEIN } from './plein-feuille';
import { pieceEnPlein, pleinEcran } from './plein-vue';
import { FEUILLE_DU_PROFIL } from './profil-feuille';
import { surimpressionDuProfil, type ProfilDeLaSurimpression } from './profil-vue';
import { carteVide } from './vue';

export type { ProfilDeLaSurimpression } from './profil-vue';

/**
 * LE FIL D'UNE CONVERSATION, rendu par le SERVEUR — Prisme compris — et par UN
 * seul module pour ses DEUX portes : `/chats/:cle` (le membre) et `/chat/:lien`
 * (l'invité). Deux portes, une vue, jamais une jumelle (conception § 12.3).
 *
 * Le texte affiché est celui que `resolvePrismTranslation` a élu ; l'indicateur
 * de traduction est DISCRET, comme le § Prisme du `CLAUDE.md` le demande
 * (« le contenu traduit s'affiche comme du contenu natif ; un indicateur subtil
 * signale qu'une traduction est active, sans distraire »). Il dit la langue
 * d'ORIGINE, en deux lettres, à côté de l'heure, et l'original se DÉPLIE.
 *
 * LE FIL EST ANCRÉ EN BAS PAR SA MISE EN PAGE, PAS PAR UN SCRIPT. La zone des
 * messages est un conteneur à défilement propre en `column-reverse` (feuille
 * du fil) : son origine de défilement est le BAS, donc le document arrive sur
 * le dernier message — sans JavaScript, et sans le saut de page entière qu'un
 * `scrollTo` posé par le module produisait 1,1 s après le premier pixel en
 * 3G (mesuré : premier pixel à 732 ms, saut à 1 855 ms). Le DOM reste dans
 * l'ordre de lecture (`.pile`, un seul enfant) ; l'en-tête, les bandeaux, la
 * ligne « X écrit… » et le composeur sont HORS du défilement, donc toujours
 * visibles. Après un envoi, le 303 vise `#m-<id>` : la bulle envoyée est
 * cadrée par le navigateur.
 *
 * ÉCRIRE SE FAIT PAR UN `<form method="post">`. Sans JavaScript, sans socket :
 * on écrit, on joint une pièce si la porte le permet (multipart, relayé par la
 * route vers `POST /attachments/upload`), on envoie, la page revient avec le
 * message. C'est ce qui marche, et ce qui marche partout. Le temps réel est une
 * AMÉLIORATION PROGRESSIVE (§ 12.4) : le document porte un chargeur de quelques
 * lignes qui attend le PREMIER PIXEL — `load`, puis l'entrée
 * `first-contentful-paint`, puis l'oisiveté — avant de faire venir le module
 * de participation, lequel ne fait venir `socket.io-client` que s'il trouve
 * `<main data-participation="fil">`. Sur une lecture PURE (état CHOIX, cadre
 * inerte), il n'y a ni attribut ni chargeur : rien ne part.
 *
 * L'HEURE EST RENDUE EN RELATIF par le serveur (`quand`, la raison est écrite
 * chez lui : il ne connaît pas le fuseau du lecteur) dans un `<time datetime>` ;
 * les JOURS sont posés par le serveur dans son fuseau (`lib/temps.ts`) ; le
 * module, qui connaît l'horloge du lecteur, remonte les heures en heure locale
 * et recalcule les jours dans le sien.
 */

export type Porte =
  | { readonly genre: 'membre'; readonly cle: string }
  | {
      readonly genre: 'invite';
      readonly lien: CleDeLien;
      /** Le segment que le lecteur a en main — l'adresse de la page, pas la clé de la place. */
      readonly segment: string;
      /** Le pseudo que la passerelle a SERVI — `null` quand aucune porte ne l'a nommé (état G au rechargement) : rien ne s'invente. */
      readonly pseudo: string | null;
      /**
       * Les droits SERVIS — `entry.rights` de la jonction, puis l'instantané que
       * le battement rend au montage (`link-admission.ts:554-577`). `null` quand
       * aucune porte n'en a servi (un battement 410) : aucun verdict n'est
       * rendu, jamais un refus fabriqué.
       */
      readonly droits: Droits | null;
      /** Vrai juste après la jonction : le bandeau des droits s'ouvre de lui-même (vue `rights`). */
      readonly jonctionFraiche: boolean;
    };

/**
 * POURQUOI un composeur est fermé décide de ce qui est servi derrière la raison.
 * `lien` — le lien est clos, échu, plein, la conversation terminée : rien ne le
 * rouvrira sans recharger, aucun champ n'est servi. `droit` — l'hôte a retiré
 * le droit d'écrire, et il peut le RENDRE sans que le lecteur recharge
 * (`participant:rights-updated`) : là où un module viendra, le formulaire est
 * servi CACHÉ derrière la raison, pour que le module n'ait qu'à le révéler.
 */
export type Composeur =
  | { readonly genre: 'ouvert' }
  | { readonly genre: 'ferme'; readonly raison: string; readonly cause: 'lien' | 'droit' };


export type EtatDuFil = {
  readonly porte: Porte;
  readonly fil: Fil;
  readonly lecteur: { readonly id: string | null; readonly nom: string; readonly langues: readonly string[] };
  readonly erreur: string | null;
  readonly brouillon: string;
  readonly maintenant: number;
  readonly composeur: Composeur;
  /** `null` ⇒ aucun module ne se charge : une lecture pure (§ 12.4, jamais sur une surface de lecture). */
  readonly tempsReel: TempsReel | null;
  /**
   * LA PIÈCE QUE L'ADRESSE OUVRE EN PLEIN ÉCRAN (`?media=`, § 12.10.1) — un
   * ÉTAT de cette adresse, pas une adresse à elle (`app/connecte/plein-vue.ts`).
   * `null` — le cas nominal — ne rend ni surimpression ni média : la règle de
   * l'écran ne bouge pas, zéro octet de média avant le geste.
   */
  readonly plein: string | null;
  /**
   * LE PROFIL D'UN PARTICIPANT OUVERT SUR CE FIL (`?profil=`, § 12.10.3) — un
   * ÉTAT de cette adresse, comme `plein` ci-dessus, et pour les MÊMES raisons
   * (`app/connecte/profil-vue.ts`). `null` — le cas nominal — ne rend rien :
   * aucune requête de plus sur une lecture ordinaire.
   */
  readonly profil: ProfilDeLaSurimpression | null;
};

export const CHAMP_DU_MESSAGE = 'texte';
export const CHAMP_DE_LA_PIECE = 'piece';

const FEUILLE = FEUILLE_CONNECTEE + FEUILLE_DU_FIL;

/**
 * L'ADRESSE DE LA PORTE — NUE : ni curseur, ni état. C'est elle que les
 * formulaires postent, elle que le Post/Redirect/Get vise, et elle que les états
 * de l'adresse préfixent (`?autour=`, `?media=`, `?avant=`).
 *
 * Le curseur de la tranche ne l'habite PAS : ce qu'un lien de média porte, c'est
 * le MESSAGE qu'il faut servir (`adresseDuPlein`, `lib/api/adresses-du-fil.ts`),
 * jamais la tranche d'où l'on part — sans quoi une pièce que le module a peinte
 * EN PLACE, laquelle n'appartient à aucune tranche nommée, resterait
 * inatteignable.
 */
export const adresseDeLaPorte = (porte: Porte): string =>
  porte.genre === 'membre'
    ? `/chats/${encodeURIComponent(porte.cle)}`
    : `/chat/${encodeURIComponent(porte.segment)}`;

/**
 * CE QUE LA PORTE LAISSE JOINDRE. Un membre joint photos et fichiers
 * (`POST /attachments/upload`, `authOptional`) ; un invité selon les DEUX droits
 * SERVIS (`canSendFiles` / `canSendImages` — l'instantané du join que le
 * battement rend, puis ce que `participant:rights-updated` change en direct) ;
 * la passerelle, elle, juge un téléversement sur le LIEN vivant
 * (`allowAnonymousFiles` / `allowAnonymousImages`, `routes/attachments/
 * upload.ts:287-311`) — et un refus se peint avec sa phrase. Sans droit servi
 * (état G), rien ne se joint.
 */
export type DroitsDePiece = { readonly fichiers: boolean; readonly images: boolean };

export const droitsDePiece = (porte: Porte): DroitsDePiece =>
  porte.genre === 'membre'
    ? { fichiers: true, images: true }
    : { fichiers: porte.droits?.canSendFiles ?? false, images: porte.droits?.canSendImages ?? false };

const retour = (porte: Porte): string =>
  porte.genre === 'membre'
    ? `<a class="retour" href="/chats" aria-label="${echappe(FIL.retour)}">${svgDuSprite('ph-caret-left')}</a>`
    : `<a class="retour" href="/" aria-label="${echappe(FIL.retourAccueil)}">${svgDuSprite('ph-caret-left')}</a>`;

/**
 * LA GALERIE DES MÉDIAS EST À UN TAP DU FIL — et seulement chez le MEMBRE.
 * `/chats/:cle/medias` est servie ; `/chat/:lien/medias` ne l'est pas, la
 * directive du porteur fermant tout `/chat/:lien/…`. La charte règle 7 tranche
 * le reste : chez l'invité, le contrôle n'est pas rendu plutôt que rendu inerte.
 */
const versLesMedias = (porte: Porte): string =>
  porte.genre !== 'membre'
    ? ''
    : `<a class="medias" href="${echappe(adresseDesMedias(porte.cle))}" aria-label="${echappe(MEDIAS.titre)}">${svgDuSprite('ph-stack')}</a>`;

const enLigne = (fil: Fil): number => fil.presence.presents.length;

/**
 * LE SOUS-TITRE A UNE SEULE COMPOSITION, DEUX PROJECTIONS. Le TEXTE (la
 * description du document) et le HTML (la ligne visible, avec sa fente de
 * présence) partaient de deux calculs voisins, et le lot précédent les a fait
 * DIVERGER : le texte se repliait sur le titre de la conversation là où le
 * HTML rendait une ligne vide, si bien qu'un tête-à-tête affichait « Ibrahim
 * Diallo » en description et RIEN à l'écran — puis, dès la première présence
 * reçue, une description devenue « 1 en ligne », le nom de la conversation
 * perdu. Deux composeurs de la même phrase divergent : celle-ci est composée
 * ici, et projetée deux fois.
 *
 * Le REPLI a quitté la phrase : il appartient à la DESCRIPTION du document
 * (`documentDuFil`), pas à la ligne de l'en-tête — y replier le titre le
 * rendrait deux fois, sous le `<h1>` qui le porte déjà.
 */
type SousTitre = { readonly compte: string; readonly presents: number };

const sousTitreDuMembre = (fil: Fil): SousTitre => ({
  compte: compteDeParticipants({ membres: fil.membres, mot: FIL.participants }),
  presents: enLigne(fil),
});

/** Le sous-titre en TEXTE — la description du document, et la ligne de l'invité. */
const sousTitre = ({ porte, fil }: EtatDuFil): string => {
  if (porte.genre === 'invite') {
    return porte.pseudo === null ? FIL.entreEnAnonyme : `${FIL.entreComme} ${porte.pseudo} · ${FIL.anonyme}`;
  }
  const { compte, presents } = sousTitreDuMembre(fil);
  return compte + (presents === 0 ? '' : presenceServie({ presents, avecSeparateur: compte !== '' }));
};

/**
 * Le sous-titre du MEMBRE porte « N en ligne » dans une FENTE : un compte SERVI
 * (directive 2026-08-25 — la passerelle ne sert la présence qu'aux amis
 * acceptés), que le module repeint sur `user:status` pour les seuls
 * participants que le document a nommés (`fil-peinture.ts`, `peinsLaPresence`),
 * et qui se tait à zéro. L'invité n'a pas cette fente : la passerelle ne lui
 * pousse aucune présence (`presence-audience.ts`).
 *
 * La fente RÉSERVE sa hauteur (`.fil-tete .sous`, `min-height` de la feuille) :
 * révélée par un `user:status` reçu, elle faisait autrement grandir l'en-tête
 * d'une ligne et pousser tout le fil — un décalage sur l'écran dont le budget
 * est CLS ≤ 0,05.
 */
const sousTitreHtml = (etat: EtatDuFil): string => {
  if (etat.porte.genre === 'invite') return echappe(sousTitre(etat));
  const { compte, presents } = sousTitreDuMembre(etat.fil);
  // La fente garde son séparateur AVEC elle — sans compte, « · 1 en ligne »
  // ouvrirait le sous-titre sur un point médian orphelin — et le DÉCLARE
  // (`data-sep`), parce que le module qui la repeint doit composer la MÊME
  // phrase sans connaître ce qui la précède.
  const avecSeparateur = compte !== '';
  return (
    echappe(compte) +
    `<span class="en-ligne" data-sep="${avecSeparateur ? '1' : '0'}"${presents === 0 ? ' hidden' : ''}>` +
    `${echappe(presenceServie({ presents, avecSeparateur }))}</span>`
  );
};

const enTete = (etat: EtatDuFil): string =>
  '<header class="fil-tete">' +
  retour(etat.porte) +
  `<div class="titre"><h1>${echappe(etat.fil.titre)}</h1><p class="sous">${sousTitreHtml(etat)}</p></div>` +
  versLesMedias(etat.porte) +
  // Le point d'ÉTAT du § 7 : plein quand le socket est là, creux sinon. Sans
  // JavaScript il n'y a pas de socket, et le point reste creux — ce qui est vrai.
  //
  // IL NAÎT NOMMÉ. Le libellé partait VIDE et le module ne l'écrivait jamais :
  // un `aria-live` sans texte n'annonce rien, et `inconnu` partageait le rendu
  // de `creux`, donc « le temps réel n'est jamais arrivé » ressemblait trait
  // pour trait à « il respire ». Servir le nom de l'état de DÉPART est la
  // seule façon de le dire quand le module, précisément, n'arrive pas.
  `<span class="etat" data-etat="inconnu" aria-live="polite"><span class="point"></span><span class="hors-ecran">${echappe(ETATS_DU_TEMPS_REEL.inconnu)}</span></span>` +
  '</header>';

/**
 * La puce du Prisme — `AUTO · <langue>` (charte règle 12). Elle n'a pas de
 * chevron : la feuille des langues (`sheet:lang`) n'est pas servie, et un
 * chevron qui n'ouvre rien mentirait (règle 7). Elle DIT ce qui est servi.
 */
const puces = (etat: EtatDuFil): string => {
  const langue = etat.lecteur.langues[0] ?? DOCUMENT_LANGUAGE;
  return (
    '<nav class="puces" aria-label="Affichage">' +
    `<p class="puce prisme" title="${echappe(FIL.prismeTitre)}">${svgDuSprite('ph-translate')}${echappe(FIL.prisme)} · ${echappe(nomDeLangue(langue))}</p>` +
    '</nav>'
  );
};

/**
 * Une ligne du bandeau porte ses DEUX glyphes de verdict ; la feuille montre
 * celui de sa classe. Le module de participation, qui reçoit ce que l'hôte
 * change par `participant:rights-updated` (`lib/realtime/droits-peinture.ts`),
 * retourne la classe et réécrit le texte — il n'a aucun tracé à inliner, et
 * aucune ligne à fabriquer.
 */
const ligneDeDroit = (droit: DroitRendu): string =>
  `<li class="${droit.accorde ? 'accorde' : 'refuse'}" data-droit="${droit.cle}">` +
  `<span class="verdict">${svgDuSprite('ph-check-circle')}${svgDuSprite('ph-x-circle')}</span>` +
  `<div><b>${echappe(droit.titre)}</b><p>${echappe(droit.sous)}</p></div></li>`;

/**
 * LE BANDEAU DES DROITS — la vue `rights` de la planche, devenue un ÉTAT du
 * fil (§ 12.3 point 3) : un `<details>` ouvert juste après la jonction, replié
 * d'un tap, rendu depuis ce que la passerelle a SERVI — jamais une liste
 * recopiée : les quatre droits viennent de `lib/contenu/droits.ts`, la source
 * que l'accordéon de la modale lit aussi (#4523). Sans droit servi ni pseudo
 * servi (un battement 410, état G), il n'y a rien à annoncer : ni verdict
 * fabriqué, ni bienvenue à un nom vide.
 */
const bandeauDesDroits = (porte: Porte, titre: string): string => {
  if (porte.genre !== 'invite' || porte.droits === null || porte.pseudo === null) return '';
  return (
    `<details class="bandeau bien"${porte.jonctionFraiche ? ' open' : ''}>` +
    `<summary>${svgDuSprite('ph-check-circle')}<div><b>${echappe(BANDEAU_DES_DROITS.bienvenue(porte.pseudo))}</b><p>${echappe(BANDEAU_DES_DROITS.ouvre(titre))}</p></div>` +
    `<span class="caret">${svgDuSprite('ph-caret-down')}</span></summary>` +
    `<ul>${droitsRendus(porte.droits).map(ligneDeDroit).join('')}</ul>` +
    '</details>'
  );
};

const bandeau = ({
  classe,
  identifiant,
  role,
  glyphe,
  titre,
  corps,
  action,
  cache,
}: {
  readonly classe: string;
  readonly identifiant: string;
  readonly role: 'status' | 'alert';
  readonly glyphe: string;
  readonly titre: string;
  readonly corps: string;
  readonly action: { readonly libelle: string; readonly href: string };
  readonly cache: boolean;
}): string =>
  `<div class="bandeau ${classe}" id="${identifiant}" role="${role}"${cache ? ' hidden' : ''}>` +
  `<div class="entete">${svgDuSprite(glyphe)}<div><b>${echappe(titre)}</b><p>${echappe(corps)}</p></div></div>` +
  `<a class="action discrete" href="${echappe(action.href)}">${echappe(action.libelle)}</a>` +
  '</div>';

/**
 * Les bandeaux que seul le TEMPS RÉEL déclenche — hors ligne, place fermée
 * (401 de l'état F), session expirée — sont servis CACHÉS : le module les
 * révèle, sans réécrire une ligne de balisage. Sans JavaScript ils n'existent
 * pas à l'écran, et c'est juste : rien ne peut survenir après le premier pixel.
 * Chacun porte son BOUTON (charte règle 17) — un rechargement, jamais un
 * `type="button"` sans effet.
 */
const bandeauxDifferes = (etat: EtatDuFil): string => {
  if (etat.tempsReel === null) return '';
  const ici = adresseDeLaPorte(etat.porte);
  return (
    bandeau({
      classe: 'attention',
      identifiant: 'bandeau-hors-ligne',
      role: 'status',
      glyphe: 'ph-warning-circle',
      titre: BANDEAUX.horsLigne.titre,
      corps: BANDEAUX.horsLigne.corps,
      action: { libelle: BANDEAUX.horsLigne.action, href: ici },
      cache: true,
    }) +
    (etat.porte.genre === 'invite'
      ? bandeau({
          classe: 'attention',
          identifiant: 'bandeau-place-fermee',
          role: 'status',
          glyphe: 'ph-warning-circle',
          titre: BANDEAUX.placeFermee.titre,
          corps: BANDEAUX.placeFermee.corps,
          // Le bouton refait le CHOIX avec le pseudo précédent pré-rempli (§ 6.3 état F) — quand il est connu.
          action: {
            libelle: BANDEAUX.placeFermee.action,
            href: etat.porte.pseudo === null ? ici : `${ici}?pseudo=${encodeURIComponent(etat.porte.pseudo)}`,
          },
          cache: true,
        })
      : bandeau({
          classe: 'attention',
          identifiant: 'bandeau-session-expiree',
          role: 'status',
          glyphe: 'ph-warning-circle',
          titre: BANDEAUX.sessionExpiree.titre,
          corps: BANDEAUX.sessionExpiree.corps,
          action: { libelle: BANDEAUX.sessionExpiree.action, href: `/login?returnUrl=${encodeURIComponent(ici)}` },
          cache: true,
        }))
  );
};

/**
 * La zone des messages : un conteneur à défilement propre, dont `.pile` est
 * l'unique enfant — c'est ce qui permet le `column-reverse` de la feuille sans
 * inverser l'ordre de lecture du DOM. Le lien vers la page plus ancienne, la
 * carte vide et la liste vivent dans la pile ; le gabarit vit hors du
 * défilement.
 */
const listeDesMessages = (etat: EtatDuFil, inerte: boolean): string => {
  const { fil } = etat;
  const adresse = adresseDeLaPorte(etat.porte);
  const plusAncien =
    fil.plusAncien === null
      ? ''
      : `<a class="plus-ancien action discrete" href="${echappe(adresse)}?avant=${echappe(encodeURIComponent(fil.plusAncien))}">${echappe(FIL.plusAnciens)}</a>`;

  return (
    `<section class="messages" aria-label="${echappe(FIL.messages)}">` +
    '<div class="pile">' +
    plusAncien +
    // Le cadre inerte de l'état CHOIX est VIDE par contrat — une carte « aucun
    // message » sous le flou ne dirait rien de vrai, et un bloc qui se déplace
    // pendant que le document arrive coûterait un décalage (§ 12.6, CLS). Un
    // composeur FERMÉ (lien clos, lecture refusée, droit retiré) la retire
    // aussi : « démarrez la conversation » ment à qui ne peut pas écrire, et
    // une liste que la passerelle REFUSE n'est pas une liste vide.
    (fil.messages.length === 0 && !inerte && etat.composeur.genre === 'ouvert'
      ? carteVide({ glyphe: 'ph-chat-circle', titre: FIL.vide, phrase: FIL.videPrecision })
      : '') +
    `<ol class="lignes" id="lignes" aria-label="${echappe(FIL.messagesOrdre)}">${lignes({ messages: fil.messages, maintenant: etat.maintenant, langueDuDocument: DOCUMENT_LANGUAGE, adresse })}</ol>` +
    // La liste est close : sa dernière ligne, complète, se montre (feuille du fil, CLS).
    `<style>${REVELE_LA_DERNIERE_LIGNE}</style>` +
    '</div>' +
    '</section>' +
    `<a class="nouveaux action contour" id="nouveaux" href="#lignes" hidden>${echappe(FIL.nouveaux(1))}</a>`
  );
};

/**
 * « X écrit… » vit HORS du défilement, juste au-dessus du composeur : il est
 * visible quand le lecteur est en bas — le cas nominal —, et sa zone RÉSERVE
 * sa hauteur pour que son apparition ne déplace rien. Il précède la liste dans
 * le DOM, comme le composeur (`order` de la feuille) : leur hauteur est connue
 * avant que le premier message n'arrive, donc la liste ne bouge pas quand ils
 * sont analysés.
 */
const zoneDeFrappe = (): string =>
  '<div class="frappe-zone"><p class="frappe" id="frappe" aria-live="polite" hidden></p></div>';

const composeurFerme = (raison: string, cache: boolean): string =>
  `<p class="composeur ferme" id="composeur-ferme"${cache ? ' hidden' : ''}>${svgDuSprite('ph-lock')}<span class="raison">${echappe(raison)}</span></p>`;

/**
 * LE TROMBONE — rendu si la porte laisse joindre quelque chose (charte règle 7 :
 * un trombone qui n'ouvre rien mentirait), ou CACHÉ — champ désactivé, rien à
 * soumettre — là où un module viendra le révéler le jour où l'hôte rend le
 * droit (`participant:rights-updated`, `lib/realtime/droits-peinture.ts`) :
 * le module ne fabrique aucune balise. Sur une lecture pure, il n'existe pas.
 * Le `<label>` est la cible de 44 px ; l'`<input type="file">` reste
 * focalisable au clavier, hors écran. `accept="image/*"` quand seules les
 * images sont admises. Le poids est ANNONCÉ par le module avant tout envoi
 * (`.piece-choisie`) ; sans JavaScript, le navigateur affiche le nom du
 * fichier choisi.
 *
 * Le libellé est un TEXTE hors écran dans le `<label>`, jamais un `aria-label`
 * dessus : un `<label>` n'a pas de rôle qui l'admette (`aria-prohibited-attr`,
 * serious — mesuré par axe sur la page vivante du membre), et c'est son texte
 * qui nomme le champ.
 */
const trombone = (droits: DroitsDePiece, revelable: boolean): string => {
  const admis = droits.fichiers || droits.images;
  if (!admis && !revelable) return '';
  const libelle = droits.fichiers || !admis ? FIL.joindre : FIL.joindreImage;
  return (
    `<label class="joindre" for="champ-piece"${admis ? '' : ' hidden'} title="${echappe(libelle)}">${svgDuSprite('ph-paperclip')}<span class="hors-ecran">${echappe(libelle)}</span></label>` +
    // Caché ET désactivé : un champ hors écran sans son libellé visible serait un contrôle sans nom pour un lecteur d'écran (axe `label`, serious).
    `<input type="file" id="champ-piece" name="${CHAMP_DE_LA_PIECE}" class="hors-ecran"${admis && !droits.fichiers ? ' accept="image/*"' : ''}${admis ? '' : ' disabled hidden'}/>`
  );
};

/**
 * LE FORMULAIRE D'ENVOI — un `<form method="post">` vers la porte, un
 * `<textarea>`, un trombone selon les droits, un envoi de 56 px. `cache` le
 * sert derrière une fermeture par DROIT, pour que le module le révèle.
 */
const formulaire = (etat: EtatDuFil, cache: boolean): string => {
  const langue = nomDeLangue(etat.lecteur.langues[0] ?? DOCUMENT_LANGUAGE);
  const droits = droitsDePiece(etat.porte);
  const avecPiece = droits.fichiers || droits.images;
  const revelable = etat.tempsReel !== null && etat.porte.genre === 'invite';
  const pieceServie = avecPiece || revelable;
  return (
    `<form class="composeur" id="composeur" method="post" action="${echappe(adresseDeLaPorte(etat.porte))}"${pieceServie ? ' enctype="multipart/form-data"' : ''}${cache ? ' hidden' : ''}>` +
    `<label class="hors-ecran" for="champ-texte">${echappe(FIL.ecrire)}</label>` +
    trombone(droits, revelable) +
    // `required` n'est posé que sans pièce jointe possible : une pièce seule
    // est un message, et c'est la route qui juge un envoi vide.
    // `maxlength` porte le plafond de la passerelle SANS JavaScript (`LONGUEUR_MAX_DU_MESSAGE`) ; le
    // compteur et le refus sont deux `<output>` que le module révèle — dès 90 %, et sur un 400.
    `<textarea id="champ-texte" name="${CHAMP_DU_MESSAGE}" rows="1"${avecPiece ? '' : ' required'} maxlength="${LONGUEUR_MAX_DU_MESSAGE}" autocomplete="off" enterkeyhint="send" aria-describedby="aide-composeur" placeholder="${echappe(FIL.ecrireEn(langue))}">${echappe(etat.brouillon)}</textarea>` +
    `<button class="envoyer" type="submit" aria-label="${echappe(FIL.envoyer)}">${svgDuSprite('ph-arrow-up')}</button>` +
    `<span class="hors-ecran" id="aide-composeur">${echappe(FIL.aideDuClavier)}</span>` +
    `<output class="compteur" id="compteur" for="champ-texte" aria-live="polite" hidden></output>` +
    `<output class="refus" id="refus-du-composeur" for="champ-texte" role="alert" hidden></output>` +
    (pieceServie ? '<output class="piece-choisie" id="piece-choisie" for="champ-piece" hidden></output>' : '') +
    '</form>'
  );
};

/**
 * LE COMPOSEUR — 100 % fonctionnel sans JavaScript. Avec JavaScript, le module
 * le prend en main (Entrée envoie, Maj + Entrée passe à la ligne, envoi
 * optimiste, brouillon, poids annoncé) sans en changer une balise. Ouvert, il
 * sert la raison CACHÉE à côté du formulaire ; fermé par un DROIT là où un
 * module viendra, il sert le formulaire CACHÉ à côté de la raison — deux
 * symétriques, pour qu'un droit retiré puis rendu ne demande jamais un
 * rechargement. Fermé par le LIEN, rien n'est servi que la raison.
 */
const composeur = (etat: EtatDuFil): string => {
  if (etat.composeur.genre === 'ouvert') return formulaire(etat, false) + (etat.tempsReel === null ? '' : composeurFerme('', true));
  const rouvrable = etat.composeur.cause === 'droit' && etat.tempsReel !== null;
  return (rouvrable ? formulaire(etat, true) : '') + composeurFerme(etat.composeur.raison, false);
};

const attributsDeParticipation = (etat: EtatDuFil): string => {
  if (etat.tempsReel === null) return '';
  const { porte, fil, lecteur, tempsReel } = etat;
  const droits = droitsDePiece(porte);
  const ecrire = porte.genre === 'invite' ? (porte.droits?.canSendMessages ?? false) : true;
  // Les droits SERVIS, tels que le module les tient avant tout changement reçu — l'historique compris,
  // que seule la charge PERSONNELLE de `participant:rights-updated` porte (#4009).
  const historique = porte.genre === 'invite' ? ` data-historique="${porte.droits?.canViewHistory === true ? '1' : '0'}"` : '';
  // Les participants NOMMÉS et ceux SERVIS en ligne — ce que `user:status` peut faire bouger, et rien
  // d'autre. Au membre seul : la passerelle ne pousse aucune présence à un invité.
  const presence =
    porte.genre === 'membre' && fil.presence.participants.length > 0
      ? ` data-participants="${echappe(fil.presence.participants.join(','))}" data-presents="${echappe(fil.presence.presents.join(','))}"`
      : '';
  return (
    ' data-participation="fil"' +
    ` data-module="${echappe(tempsReel.actifs.participate.url)}"` +
    ` data-socket="${echappe(tempsReel.actifs.socket.url)}"` +
    ` data-passerelle="${echappe(tempsReel.passerelle)}"` +
    ` data-conversation="${echappe(fil.id)}"` +
    ` data-porte="${porte.genre}"` +
    (porte.genre === 'invite' ? ` data-lien="${echappe(porte.lien)}"` : ` data-cle="${echappe(porte.cle)}"`) +
    (lecteur.id === null ? '' : ` data-moi="${echappe(lecteur.id)}"`) +
    ` data-nom="${echappe(lecteur.nom)}"` +
    ` data-langues="${echappe(lecteur.langues.join(','))}"` +
    ` data-adresse="${echappe(adresseDeLaPorte(porte))}"` +
    ` data-ecrire="${ecrire ? '1' : '0'}"` +
    ` data-fichiers="${droits.fichiers ? '1' : '0'}"` +
    ` data-images="${droits.images ? '1' : '0'}"` +
    historique +
    presence
  );
};


/**
 * Le corps du fil, et ses DEUX options — qui ne disent pas la même chose, et
 * que le lot précédent confondait en une seule :
 *
 *   • `cadre` est l'état CHOIX (`/chat/:lien`) : un fil VIDÉ de tout ce qu'un
 *     module ferait vivre — ni gabarits, ni bandeaux différés, ni carte
 *     « aucun message » —, ce qui allège le document que le visiteur rural
 *     reçoit avant d'avoir choisi ;
 *   • `inerte` ne pose QUE l'attribut. C'est ce dont la surimpression du plein
 *     écran a besoin : le fil reste servi ENTIER — le module vit, ses gabarits
 *     sont là —, mais rien derrière la surimpression ne prend le focus ni ne
 *     s'annonce au lecteur d'écran. Sans lui, et SANS JAVASCRIPT (le chemin qui
 *     marche partout), le clavier traversait vingt-et-un contrôles invisibles —
 *     retour, médias, composeur, sauts de citation — avant d'atteindre la
 *     croix, et pouvait poster un message qu'il ne voyait pas.
 *
 * `inerte` vaut `cadre` par défaut : un cadre est toujours inerte, l'inverse
 * n'est pas vrai.
 *
 * L'ordre est celui de la planche (`cible/rights.png`) : l'en-tête, le bandeau
 * des droits, PUIS les puces.
 */
export const corpsDuFil = (
  etat: EtatDuFil,
  { cadre = false, inerte = cadre }: { readonly cadre?: boolean; readonly inerte?: boolean } = {},
): string =>
  `<main id="main-content" class="fil-ecran"${inerte ? ' inert' : ''}${attributsDeParticipation(etat)}>` +
  enTete(etat) +
  bandeauDesDroits(etat.porte, etat.fil.titre) +
  puces(etat) +
  (cadre ? '' : bandeauxDifferes(etat)) +
  (etat.erreur === null ? '' : `<p class="alerte" role="alert">${echappe(etat.erreur)}</p>`) +
  zoneDeFrappe() +
  composeur(etat) +
  listeDesMessages(etat, cadre) +
  (cadre ? '' : gabaritDeLigne(adresseDeLaPorte(etat.porte))) +
  '</main>';

/**
 * Le document PLEIN ÉCRAN — sans marque ni pied, avec la tête que tout le site
 * partage. `feuille` vaut celle du fil par défaut ; la galerie des médias
 * (`app/connecte/medias-vue.ts`) y ajoute la sienne, parce qu'elle est le
 * SECOND écran plein de la zone connectée et qu'elle réemploie l'en-tête, les
 * puces et le lecteur du fil. Un second squelette recopié ici aurait fait deux
 * `<head>` qui dérivent au premier `<meta>` ajouté — la raison même pour
 * laquelle `teteDuDocument` a été remontée.
 */
export const documentPleinEcran = ({
  titre,
  description,
  corps,
  script = '',
  feuille = FEUILLE,
  banniere = '',
  hubs = true,
}: {
  readonly titre: string;
  readonly description: string;
  readonly corps: string;
  readonly script?: string;
  readonly feuille?: string;
  /**
   * LA RÉGION DE LA BANNIÈRE (#4454) — servie VIDE, AVANT le corps, donc hors
   * du `<main>` que toute surimpression rend `inert`. Voir la même raison, plus
   * longuement, dans `ParametresDuDocument` (`app/enveloppe/vue.ts`) : une
   * croix inerte est un contrôle sans effet (charte règle 7).
   *
   * Seul le FIL la sert parmi les écrans pleins : c'est le seul dont le module
   * tient un socket. Les neuf autres (`/notifications`, `/search`, `/contacts`,
   * `/links`, `/post/:id`, `/feed`, `/composer`, `/stories/new`, la galerie) ne
   * la portent pas.
   */
  readonly banniere?: string;
  /**
   * Les règles de spéculation (#5104) — servies par défaut aux écrans
   * CONNECTÉS. La LECTURE PARTAGÉE les refuse (`hubs: false`) : son budget dit
   * « aucun script applicatif » et un lecteur ANONYME n'a rien à précharger
   * des hubs d'un compte qu'il n'a pas.
   */
  readonly hubs?: boolean;
}): string =>
  '<!doctype html>' +
  `<html lang="${DOCUMENT_LANGUAGE}" class="${THEME_PAR_DEFAUT}">` +
  teteDuDocument({ titre, description, feuille, robots: 'noindex, nofollow' }) +
  // LA BANNIÈRE OUVRE LE CORPS, tout le reste le ferme, et l'ordre porte une
  // raison par pièce. La bannière est une région `aria-live` qui doit EXISTER
  // quand le navigateur construit son arbre d'accessibilité (#4454) — créée
  // après coup, elle n'est annoncée par personne. Les hubs se préchargent au
  // survol (#5104) et le travailleur de zone (#4472/#4473) s'enregistre — pour
  // TOUT document plein écran, la lecture partagée comprise : c'est elle, `/l/`,
  // que son cache sert en premier. Sans `V3_SW_PORTEES` dans l'environnement, le
  // script n'existe pas. Aucun des quatre n'est dans le `<main>` qu'une
  // surimpression rend `inert` : une croix inerte serait un contrôle sans effet.
  `<body>${banniere}${corps}${script}${hubs ? REGLES_DE_SPECULATION : ''}${SCRIPT_DU_TRAVAILLEUR(porteesDuTravailleur(process.env['V3_SW_PORTEES']))}${blocDuNavigateur()}</body>` +
  '</html>';

/**
 * LA SURIMPRESSION — plein écran d'un média OU profil d'un participant, hors
 * du `<main>`, comme la modale de l'état CHOIX : une surimpression n'est pas
 * un morceau du contenu qu'elle recouvre. Sa FEUILLE ne part QUE dans son
 * état (`documentDuFil`) : ce que le fil n'affiche pas, il ne le paie pas
 * (charte règle 7).
 *
 * LE PROFIL PASSE AVANT LE PLEIN ÉCRAN quand les deux adresses sont posées à
 * la fois — un cas que ni l'une ni l'autre ne produit (`?media=` et
 * `?profil=` viennent de deux gestes distincts), mais qu'une adresse composée
 * à la main peut présenter : une seule surimpression à la fois, jamais deux
 * `<dialog open>` empilés.
 */
type Surimpression = { readonly genre: 'aucune' } | { readonly genre: 'plein'; readonly html: string } | { readonly genre: 'profil'; readonly html: string };

const surimpression = (etat: EtatDuFil): Surimpression => {
  if (etat.profil !== null) {
    const { handle, servi, confirmerBlocage } = etat.profil;
    return {
      genre: 'profil',
      html: surimpressionDuProfil({
        servi,
        handle,
        adresseHote: adresseDeLaPorte(etat.porte),
        langue: langueDeLAuteurDansLeFil(etat.fil, handle),
        conversationEnCommun: etat.fil.titre,
        confirmerBlocage,
        peutAgir: etat.porte.genre === 'membre',
        langueDuDocument: DOCUMENT_LANGUAGE,
      }),
    };
  }
  const plein = pieceEnPlein(etat.fil, etat.plein);
  return plein === null ? { genre: 'aucune' } : { genre: 'plein', html: pleinEcran({ plein, adresse: adresseDeLaPorte(etat.porte), langueDuDocument: DOCUMENT_LANGUAGE }) };
};

export const documentDuFil = (etat: EtatDuFil): string => {
  const dessus = surimpression(etat);
  const html = dessus.genre === 'aucune' ? '' : dessus.html;
  const decrit = sousTitre(etat);
  return documentPleinEcran({
    titre: `${etat.fil.titre} — Meeshy`,
    // Le REPLI de la DESCRIPTION, et de rien d'autre : un tête-à-tête sans
    // personne en ligne n'a pas de sous-titre, et un document sans description
    // ne dit rien de lui.
    description: decrit === '' ? etat.fil.titre : decrit,
    // LA SURIMPRESSION AVANT LE FIL, et le fil INERTE derrière elle — la même
    // règle que la modale de l'état CHOIX, pour les deux mêmes raisons. L'ORDRE
    // d'abord : rendue après un corps de 30 Ko, une surimpression est peinte
    // courte puis grandit pendant que le document arrive (CLS 0,347 mesuré en
    // 3G chez sa voisine, contre le gate 0,05). L'ACCÈS ensuite : sans
    // JavaScript il n'y a ni Échap ni piège à focus, et `inert` est ce que le
    // navigateur donne gratuitement — la première tabulation atteint la croix,
    // et le lecteur d'écran n'annonce plus un fil que rien ne montre.
    corps: html + corpsDuFil(etat, { inerte: html !== '' }),
    // LA BANNIÈRE NE PART QU'AVEC SON MODULE (#4454) — même condition que le
    // chargeur, et pour la même raison : sans socket, rien n'y sera jamais
    // peint. Une région servie qu'aucun code ne remplit est du poids sans usage,
    // et un `<output>` vide qu'un lecteur d'écran surveille pour rien.
    banniere: etat.tempsReel === null ? '' : REGION_DE_LA_BANNIERE,
    script: etat.tempsReel === null ? '' : CHARGEUR_DE_PARTICIPATION,
    feuille:
      FEUILLE +
      (etat.tempsReel === null ? '' : FEUILLE_DE_LA_BANNIERE) +
      (dessus.genre === 'plein' ? FEUILLE_DU_PLEIN : '') +
      (dessus.genre === 'profil' ? FEUILLE_DU_PROFIL : ''),
  });
};

export const documentIntrouvable = (): string =>
  documentDuSite({
    titre: `${INTROUVABLE.titre} — Meeshy`,
    description: INTROUVABLE.corps,
    feuille: FEUILLE,
    corps:
      '<div class="bonjour">' +
      `<h1>${echappe(INTROUVABLE.titre)}</h1>` +
      `<p>${echappe(INTROUVABLE.corps)}</p>` +
      '</div>' +
      '<section class="acces" aria-label="' +
      echappe(INTROUVABLE.action) +
      '"><nav>' +
      `<a class="action primaire" href="/chats">${echappe(INTROUVABLE.action)}</a>` +
      '</nav></section>',
    retour: true,
  });

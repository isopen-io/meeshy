
import { svgDuSprite } from '@/app/actifs-inlines';
import { choixDeLangue } from '@/app/choix-de-langue';
import { FEUILLE_CONNECTEE } from '@/app/connecte/feuille';
import { documentPleinEcran } from '@/app/connecte/fil-vue';
import { langAttribut } from '@/app/connecte/transcrit';
import { quand } from '@/app/connecte/vue';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { documentDeMessage } from '@/app/enveloppe/vue';
import { mediaHtml } from '@/app/media-html';
import { echappe } from '@/app/socle';
import { initiales, teinteDeLAvatar } from '@/lib/avatar';
import type { Story, Voisinage } from '@/lib/api/publication';
import { adresseDuPartage, type GenreServi } from '@/lib/contenu/partage';
import { LONGUEUR_MAX_DE_LA_REPONSE } from '@/lib/contenu/story';
import { nomDeLangue } from '@/lib/contenu/langues';

import { FEUILLE_DE_LA_STORY } from './partage-feuille';

/**
 * LA STORY, RENDUE PAR LE SERVEUR — texte servi au Prisme compris (issue
 * #4895, `cible/story.png`).
 *
 * TROIS DÉCISIONS PORTENT CET ÉCRAN.
 *
 * 1. **Ce que la puce des langues ANNONCE, elle le SERT** (cycle 123 : une
 *    surface qui affirme une langue sans la rendre est pire qu'une surface
 *    muette). Sans JavaScript il n'y a pas de `onDisplayedChange` à câbler :
 *    chaque langue offerte est un LIEN vers `?lang=xx`, et c'est le SERVEUR qui
 *    rend l'autre texte. « Cliquer une langue change le texte lu » est donc
 *    vrai par construction, et le retour à l'original est le même lien pointé
 *    sur la langue d'origine — jamais une mention sans effet.
 * 2. **Ce qui NAVIGUE est le tap, jamais la barre.** Les barres du haut disent
 *    où l'on est dans la file de l'auteur ; elles font 3 px et ne peuvent pas
 *    être des cibles de 44 px. Les deux zones de tap tiennent les BORDS de la
 *    scène : le centre reste au texte, donc l'appui LONG y sélectionne et copie
 *    au lieu de tourner la page. Et rien n'est rendu quand il n'y a nulle part
 *    où aller (charte règle 7).
 * 3. **Le visiteur sans session reçoit une INVITATION, pas une erreur**
 *    (décision du porteur, 2026-09-02). `GET /posts/:postId` est en
 *    `requiredAuth` : la v3 s'y conforme, ne demande RIEN à la passerelle sans
 *    créance, et n'invente donc aucune métadonnée — ni titre de story, ni
 *    aperçu, ni nom d'auteur. Ce qu'elle sait, elle le tient de l'adresse ; ce
 *    qu'elle ne sait pas, elle se tait.
 *
 * `noindex` est CONSERVÉ (§ 5.4) : une story est éphémère et restreignable, et
 * un extrait indexé lui survivrait. C'est ce que `documentPleinEcran` pose.
 */

export type EtatDeLaStory = {
  /**
   * LE GENRE SERVI — story, réel ou humeur. Il porte le vocabulaire, le
   * préfixe d'adresse et le fait que le contenu se PARCOURE ou non. C'est la
   * seule chose qui sépare les trois écrans : le lecteur, lui, est un
   * (#4929).
   */
  readonly genre: GenreServi;
  readonly story: Story;
  readonly voisinage: Voisinage;
  /**
   * L'ADRESSE DE CE DOCUMENT — celle sur laquelle les liens de LECTURE se
   * recomposent. Absente, c'est l'adresse de partage (`/reels/:id`), donc
   * `/stories/:id`, `/reels/:id` et `/moods/:id` ne changent pas d'un octet.
   *
   * ELLE EXISTE PARCE QUE LE LECTEUR A DEUX HÔTES DEPUIS #5032, et le témoin
   * en navigateur l'a montré avant que quiconque y pense : sur `/feed/reels`,
   * la puce des langues et le « voir l'original » composaient `?lang=` sur
   * l'adresse de PARTAGE — changer de langue éjectait le lecteur du fil vers
   * `/reels/<id>`. Le lien n'était pas mort ; il quittait l'écran. C'est la
   * famille du `tap` corrigé dans le même lot : un composant partagé qui
   * SUPPOSE l'adresse à laquelle il est servi.
   *
   * LES GESTES, EUX, GARDENT L'ADRESSE DE PARTAGE — voir `repondre`.
   */
  readonly adresseDeLEcran?: string;
  /**
   * OÙ MÈNE LA CROIX — l'écran d'où l'on vient. Absente, c'est l'accueil (`/`),
   * ce que les trois adresses de partage servent depuis toujours : un lien reçu
   * s'ouvre hors de tout parcours, et le fermer ramène au début.
   *
   * `/feed/reels` en a un, lui : le fil. La planche le dit
   * (`MeeshyWebV3.dc.html:871` — « reels → feed, Retour, chevron »), et une
   * croix qui renverrait à l'accueil ferait sortir de la pile au lieu d'y
   * remonter d'un cran.
   */
  readonly retourDeLEcran?: string;
  readonly maintenant: number;
  /** Le retour d'un envoi (Post/Redirect/Get) : la réponse est partie. */
  readonly confirmation: boolean;
  readonly erreur: string | null;
  readonly brouillon: string;
};

export const CHAMP_DE_LA_REPONSE = 'reponse';
export const CHAMP_DE_L_AIME = 'aime';

const FEUILLE = FEUILLE_CONNECTEE + FEUILLE_DE_LA_STORY;

/**
 * LES DEUX CONSTRUCTEURS D'ADRESSE vivent dans `lib/contenu/partage.ts`, avec
 * le `base` dont ils sont composés, depuis que `voisinage()` en a besoin
 * (#5032) : `lib/` ne peut pas importer `app/`. Ce module les ré-exporte pour
 * ses lecteurs historiques.
 */
export { adresseDuPartage, adresseDeLaStory } from '@/lib/contenu/partage';

/**
 * `?lang=` POSÉ SUR UNE ADRESSE QUI PORTE DÉJÀ UNE QUESTION. `/feed/reels`
 * arrive avec `?cursor=…` : concaténer un second `?` produirait une adresse que
 * le serveur lit à moitié — le curseur serait perdu et le lecteur renvoyé au
 * premier réel du fil en changeant simplement de langue.
 */
const avecLangue = (adresse: string, langue: string): string =>
  `${adresse}${adresse.includes('?') ? '&' : '?'}lang=${encodeURIComponent(langue)}`;

/** L'adresse des liens de LECTURE de ce document — l'écran courant, ou le partage. */
const ecranDe = (etat: EtatDeLaStory): string =>
  etat.adresseDeLEcran ?? adresseDuPartage(etat.genre, etat.story.id);

/** La langue effectivement LUE — celle que le Prisme a élue, ou celle d'origine. */
const langueLue = (story: Story): string | null => story.langueServie ?? story.langueOriginale;

const segments = ({ voisinage, genre: { copie } }: EtatDeLaStory): string =>
  `<ol class="segments" aria-label="${echappe(copie.segments(voisinage.segments.length))}">` +
  voisinage.segments
    .map(
      (segment, index) =>
        `<li${segment.courant ? ' aria-current="step"' : ''}>` +
        `<span class="hors-ecran">${echappe(copie.segment(index + 1, voisinage.segments.length))}</span></li>`,
    )
    .join('') +
  `</ol>`;

/**
 * L'AVATAR est celui de la zone connectée — quatre teintes de la table,
 * dérivées du nom (charte règle 11). La passerelle sert bien `author.avatar`,
 * mais une image ici coûterait une requête AVANT le premier pixel sur un écran
 * que le § 8.3 gate à trois, pour dire ce que deux lettres disent déjà.
 */
const avatar = (nom: string): string =>
  `<span class="avatar ${teinteDeLAvatar(nom)}" aria-hidden="true">${echappe(initiales(nom))}</span>`;


const enTete = (etat: EtatDeLaStory): string => {
  const { story, genre } = etat;
  const { copie } = genre;
  return (
    '<header class="story-tete">' +
    avatar(story.auteur) +
    '<div class="qui">' +
    `<h1 class="nom">${echappe(story.auteur)}</h1>` +
    (story.publieeA === null
      ? ''
      : `<time datetime="${echappe(story.publieeA)}">${echappe(quand(story.publieeA, etat.maintenant))}</time>`) +
    '</div>' +
    choixDeLangue({
      languesOffertes: story.languesOffertes,
      langueLue: langueLue(story),
      // L'ÉCRAN COURANT, pas l'adresse de partage : changer de langue ne doit
      // pas changer d'écran (voir `adresseDeLEcran`).
      adresse: (langue) => avecLangue(ecranDe(etat), langue),
      libelle: copie.langues,
    }) +
    `<a class="fermer" href="${echappe(etat.retourDeLEcran ?? '/')}" aria-label="${echappe(copie.fermer)}">${svgDuSprite('ph-x')}</a>` +
    '</header>'
  );
};

/**
 * LE MÉDIA D'UNE PUBLICATION — le site UNIQUE `@/app/media-html` (partagé
 * avec `app/connecte/social-vue.ts`, #5031) : une définition locale a déjà
 * fait planter `next start` en production quand un AUTRE segment d'App
 * Router l'importait (voir le doc-comment de ce module). Ne pas la redupliquer
 * ici — c'est exactement la jumelle que ce module existe pour éviter.
 */

const scene = (etat: EtatDeLaStory): string => {
  const { copie } = etat.genre;
  const { story, voisinage } = etat;
  const langue = langAttribut(langueLue(story), DOCUMENT_LANGUAGE);
  const premier = story.medias[0];
  const contenu =
    premier === undefined
      ? `<p class="texte"${langue}>${echappe(story.texte === '' ? copie.sansContenu : story.texte)}</p>`
      : '<figure>' +
        mediaHtml(premier, story.texte) +
        (story.texte === '' ? '' : `<figcaption${langue}>${echappe(story.texte)}</figcaption>`) +
        '</figure>';

  // `cible` EST une adresse (`Voisinage`, #5032), plus un identifiant : ce site
  // composait `adresseDeLaStory(cible)` EN DUR, donc un voisinage de réels
  // aurait envoyé vers `/stories/<id>`. Défaut DORMANT — aucun genre sans
  // segments ne demandait de voisinage — et réveillé par la première file de
  // réels. Le tap ne compose plus rien : il pose ce qu'on lui donne.
  const tap = (classe: string, cible: string | null, libelle: string): string =>
    cible === null
      ? ''
      : `<a class="tap ${classe}" href="${echappe(cible)}"><span class="hors-ecran">${echappe(libelle)}</span></a>`;

  return (
    `<section class="scene" aria-label="${echappe(copie.scene)}">` +
    contenu +
    tap('precedente', voisinage.precedente, copie.precedente) +
    tap('suivante', voisinage.suivante, copie.suivante) +
    '</section>'
  );
};

/**
 * L'ANNONCE DU PRISME — rendue SEULEMENT quand une traduction est servie : sur
 * une story déjà écrite dans la langue du lecteur, elle n'apprendrait rien. Le
 * « voir l'original » est un LIEN, donc un EFFET (charte règle 7).
 */
const prisme = (etat: EtatDeLaStory): string => {
  const { genre, story } = etat;
  const { copie } = genre;
  // Une TRADUCTION, pas simplement une langue connue : `langueServie` porte
  // celle de l'original quand c'est lui qui est servi.
  if (
    story.langueServie === null ||
    story.langueOriginale === null ||
    story.langueServie === story.langueOriginale
  ) {
    return '';
  }
  return (
    '<p class="story-prisme">' +
    svgDuSprite('ph-translate') +
    `<span>${echappe(copie.traduitDe(nomDeLangue(story.langueOriginale)))}</span>` +
    `<a href="${echappe(avecLangue(ecranDe(etat), story.langueOriginale))}">${echappe(copie.original)}</a>` +
    '</p>'
  );
};

/**
 * RÉPONDRE ET AIMER — deux gestes, deux portes de la passerelle, et AUCUN
 * JavaScript. Le champ poste un COMMENTAIRE (`POST /posts/:postId/comments`),
 * le cœur pose ou retire l'aime (`POST` / `DELETE /posts/:postId/like`) : le
 * bouton porte l'état que la passerelle a servi (`isLikedByMe`), donc il SAIT
 * lequel des deux gestes il fait. La cible dessine les deux ; les rendre
 * inertes aurait été le défaut que la charte règle 7 nomme.
 */
/**
 * LES GESTES POSTENT VERS L'ADRESSE DE PARTAGE, jamais vers l'écran courant, et
 * c'est délibéré : `/reels/:id` porte le gestionnaire de POST — garde
 * d'origine, aime, réponse, Post/Redirect/Get. Aimer depuis `/feed/reels`
 * dépose donc bien l'aime, puis atterrit sur l'adresse de partage du MÊME réel.
 * Le geste a son effet (charte règle 7) ; ce qu'il perd est la place dans le
 * fil. La tenir demanderait un second gestionnaire de POST — un lot à part,
 * suivi par son issue, plutôt qu'une jumelle écrite au passage.
 */
const repondre = (etat: EtatDeLaStory): string => {
  const { copie } = etat.genre;
  return (
  `<form class="story-repondre" method="post" action="${echappe(adresseDuPartage(etat.genre, etat.story.id))}">` +
  `<label class="hors-ecran" for="champ-reponse">${echappe(copie.repondre)}</label>` +
  `<textarea id="champ-reponse" name="${CHAMP_DE_LA_REPONSE}" rows="1" maxlength="${LONGUEUR_MAX_DE_LA_REPONSE}" autocomplete="off" enterkeyhint="send" placeholder="${echappe(copie.repondreA(etat.story.auteur))}">${echappe(etat.brouillon)}</textarea>` +
  `<button class="aimer" type="submit" name="${CHAMP_DE_L_AIME}" value="${etat.story.aimee ? '0' : '1'}" aria-pressed="${etat.story.aimee ? 'true' : 'false'}" aria-label="${echappe(copie.aimer)}">${svgDuSprite('ph-heart')}</button>` +
  `<button class="envoyer" type="submit" aria-label="${echappe(copie.envoyer)}">${svgDuSprite('ph-arrow-up')}</button>` +
  '</form>'
  );
};

const corps = (etat: EtatDeLaStory): string => {
  const { copie } = etat.genre;
  return (
  '<main id="main-content" class="story-ecran">' +
  // La barre de segments n'existe QUE pour un genre qui se parcourt. Un réel
  // et une humeur se lisent seuls : une barre à un seul segment serait un
  // repère qui n'oriente vers rien (charte règle 7).
  (etat.genre.avecSegments ? segments(etat) : '') +
  enTete(etat) +
  scene(etat) +
  prisme(etat) +
  (etat.confirmation ? `<p class="story-etat" role="status">${echappe(copie.repondu)}</p>` : '') +
  (etat.erreur === null ? '' : `<p class="alerte" role="alert"><b>${echappe(copie.refuse)}</b> ${echappe(etat.erreur)}</p>`) +
  repondre(etat) +
  '</main>'
  );
};

export const documentDuPartage = (etat: EtatDeLaStory): string =>
  documentPleinEcran({
    titre: `${etat.genre.copie.de(etat.story.auteur)} — Meeshy`,
    description: etat.story.texte === '' ? etat.genre.copie.titre : etat.story.texte,
    corps: corps(etat),
    feuille: FEUILLE,
  });

/** Le document d'une STORY — la projection que la porte de `/stories/:id` lit. */
export const documentDeLaStory = (etat: EtatDeLaStory): string => documentDuPartage(etat);

/**
 * L'INVITATION — ce que reçoit le visiteur SANS session. Aucune donnée de la
 * story n'y figure, et pour cause : la v3 n'a rien demandé à la passerelle.
 * L'adresse est gardée de côté dans `returnUrl`, comme la modale de
 * `/chat/:lien` garde la sienne.
 */
export const documentDeLInvitation = ({ genre, id }: { readonly genre: GenreServi; readonly id: string }): string => {
  const { copie } = genre;
  // LE MÊME DÉFAUT, ET CELUI-CI ÉTAIT VIVANT (#5032). `adresseDeLaStory(id)`
  // renvoyait un visiteur non connecté de `/reels/:id` ou `/moods/:id` vers
  // `/stories/<id>` après sa connexion — le `returnUrl` d'une invitation
  // ramenait donc à un écran qui n'existe pas pour ce contenu. Le genre est en
  // portée depuis #4929 ; il n'était simplement pas consulté ici.
  const ici = encodeURIComponent(adresseDuPartage(genre, id));
  return documentDeMessage({
    titre: copie.invitation.titre,
    paragraphes: [copie.invitation.corps, copie.invitation.note],
    actions: [
      { libelle: copie.invitation.seConnecter, href: `/login?returnUrl=${ici}`, glyphe: 'ph-sign-in' },
      { libelle: copie.invitation.creerUnCompte, href: `/signup?returnUrl=${ici}`, ton: 'contour' },
    ],
    feuille: FEUILLE_CONNECTEE,
  });
};

/**
 * L'INDISPONIBLE — la MÊME réponse pour une story absente, supprimée, échue ou
 * hors audience (§ 5.1) : distinguer serait un oracle d'énumération. La vue
 * `storyFail` de la planche (`cible/storyFail.png`, sa méta et ses deux
 * actions) est l'issue SUIVANTE ; ce document en est le plancher honnête, pas
 * son remplaçant.
 */
export const documentIndisponible = (genre: GenreServi): string =>
  documentDeMessage({
    titre: genre.copie.indisponible.titre,
    paragraphes: [genre.copie.indisponible.corps],
    actions: [{ libelle: genre.copie.indisponible.action, href: '/' }],
    feuille: FEUILLE_CONNECTEE,
  });

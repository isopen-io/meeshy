
import { svgDuSprite } from '@/app/actifs-inlines';
import { FEUILLE_CONNECTEE } from '@/app/connecte/feuille';
import { documentPleinEcran } from '@/app/connecte/fil-vue';
import { langAttribut } from '@/app/connecte/transcrit';
import { quand } from '@/app/connecte/vue';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { documentDuSite } from '@/app/enveloppe/vue';
import { echappe } from '@/app/socle';
import { initiales, teinteDeLAvatar } from '@/lib/avatar';
import type { MediaDeStory, Story, Voisinage } from '@/lib/api/publication';
import { formeDePiece } from '@/lib/api/formes';
import { LONGUEUR_MAX_DE_LA_REPONSE, STORY } from '@/lib/contenu/story';
import { nomDeLangue } from '@/lib/contenu/langues';

import { FEUILLE_DE_LA_STORY } from './story-feuille';

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
  readonly story: Story;
  readonly voisinage: Voisinage;
  readonly maintenant: number;
  /** Le retour d'un envoi (Post/Redirect/Get) : la réponse est partie. */
  readonly confirmation: boolean;
  readonly erreur: string | null;
  readonly brouillon: string;
};

export const CHAMP_DE_LA_REPONSE = 'reponse';
export const CHAMP_DE_L_AIME = 'aime';

const FEUILLE = FEUILLE_CONNECTEE + FEUILLE_DE_LA_STORY;

export const adresseDeLaStory = (id: string, langue?: string): string =>
  `/stories/${encodeURIComponent(id)}${langue === undefined ? '' : `?lang=${encodeURIComponent(langue)}`}`;

/** La langue effectivement LUE — celle que le Prisme a élue, ou celle d'origine. */
const langueLue = (story: Story): string | null => story.langueServie ?? story.langueOriginale;

const segments = ({ voisinage }: EtatDeLaStory): string =>
  `<ol class="segments" aria-label="${echappe(STORY.segments(voisinage.segments.length))}">` +
  voisinage.segments
    .map(
      (segment, index) =>
        `<li${segment.courant ? ' aria-current="step"' : ''}>` +
        `<span class="hors-ecran">${echappe(STORY.segment(index + 1, voisinage.segments.length))}</span></li>`,
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

/**
 * LES LANGUES OFFERTES — un lien par langue que la story porte RÉELLEMENT
 * (l'originale et celles dont la traduction a un texte). Un `<details>` s'ouvre
 * sans une ligne de JavaScript ; `aria-current` dit celle qui est lue.
 */
const langues = (story: Story): string => {
  if (story.languesOffertes.length < 2) return '';
  const lue = langueLue(story);
  return (
    `<details class="langues">` +
    `<summary title="${echappe(STORY.langues)}">${svgDuSprite('ph-translate')}<span class="hors-ecran">${echappe(STORY.langues)}</span></summary>` +
    `<ul aria-label="${echappe(STORY.langues)}">` +
    story.languesOffertes
      .map(
        (langue) =>
          `<li><a href="${echappe(adresseDeLaStory(story.id, langue))}"${langue === lue ? ' aria-current="true"' : ''} lang="${echappe(langue)}">` +
          `${echappe(nomDeLangue(langue))}</a></li>`,
      )
      .join('') +
    '</ul></details>'
  );
};

const enTete = (etat: EtatDeLaStory): string => {
  const { story } = etat;
  return (
    '<header class="story-tete">' +
    avatar(story.auteur) +
    '<div class="qui">' +
    `<h1 class="nom">${echappe(story.auteur)}</h1>` +
    (story.publieeA === null
      ? ''
      : `<time datetime="${echappe(story.publieeA)}">${echappe(quand(story.publieeA, etat.maintenant))}</time>`) +
    '</div>' +
    langues(story) +
    `<a class="fermer" href="/" aria-label="${echappe(STORY.fermer)}">${svgDuSprite('ph-x')}</a>` +
    '</header>'
  );
};

/**
 * LE MÉDIA D'UNE STORY. Une image est rendue AVEC ses dimensions (le CLS est
 * nul par construction, § 12.6) ; une vidéo et un son restent en
 * `preload="none"` — zéro octet avant la pression, comme dans la galerie. Un
 * genre sans lecteur natif et sans image (un fichier) n'est pas rendu : une
 * story n'en porte pas, et fabriquer une affiche pour un cas que la passerelle
 * ne produit pas serait inventer.
 */
const mediaHtml = (media: MediaDeStory, texte: string): string => {
  const alt = media.alt ?? texte;
  const dimensions =
    media.largeur === null || media.hauteur === null ? '' : ` width="${media.largeur}" height="${media.hauteur}"`;
  if (media.genre === 'image') return `<img src="${echappe(media.url)}" alt="${echappe(alt)}"${dimensions}/>`;
  const lecteur = formeDePiece(media.genre).lecteur;
  if (lecteur === null) return '';
  return `<${lecteur} controls preload="none" src="${echappe(media.url)}"></${lecteur}>`;
};

const scene = (etat: EtatDeLaStory): string => {
  const { story, voisinage } = etat;
  const langue = langAttribut(langueLue(story), DOCUMENT_LANGUAGE);
  const premier = story.medias[0];
  const contenu =
    premier === undefined
      ? `<p class="texte"${langue}>${echappe(story.texte === '' ? STORY.sansContenu : story.texte)}</p>`
      : '<figure>' +
        mediaHtml(premier, story.texte) +
        (story.texte === '' ? '' : `<figcaption${langue}>${echappe(story.texte)}</figcaption>`) +
        '</figure>';

  const tap = (classe: string, cible: string | null, libelle: string): string =>
    cible === null
      ? ''
      : `<a class="tap ${classe}" href="${echappe(adresseDeLaStory(cible))}"><span class="hors-ecran">${echappe(libelle)}</span></a>`;

  return (
    `<section class="scene" aria-label="${echappe(STORY.scene)}">` +
    contenu +
    tap('precedente', voisinage.precedente, STORY.precedente) +
    tap('suivante', voisinage.suivante, STORY.suivante) +
    '</section>'
  );
};

/**
 * L'ANNONCE DU PRISME — rendue SEULEMENT quand une traduction est servie : sur
 * une story déjà écrite dans la langue du lecteur, elle n'apprendrait rien. Le
 * « voir l'original » est un LIEN, donc un EFFET (charte règle 7).
 */
const prisme = (story: Story): string => {
  if (story.langueServie === null || story.langueOriginale === null) return '';
  return (
    '<p class="story-prisme">' +
    svgDuSprite('ph-translate') +
    `<span>${echappe(STORY.traduitDe(nomDeLangue(story.langueOriginale)))}</span>` +
    `<a href="${echappe(adresseDeLaStory(story.id, story.langueOriginale))}">${echappe(STORY.original)}</a>` +
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
const repondre = (etat: EtatDeLaStory): string =>
  `<form class="story-repondre" method="post" action="${echappe(adresseDeLaStory(etat.story.id))}">` +
  `<label class="hors-ecran" for="champ-reponse">${echappe(STORY.repondre)}</label>` +
  `<textarea id="champ-reponse" name="${CHAMP_DE_LA_REPONSE}" rows="1" maxlength="${LONGUEUR_MAX_DE_LA_REPONSE}" autocomplete="off" enterkeyhint="send" placeholder="${echappe(STORY.repondreA(etat.story.auteur))}">${echappe(etat.brouillon)}</textarea>` +
  `<button class="aimer" type="submit" name="${CHAMP_DE_L_AIME}" value="${etat.story.aimee ? '0' : '1'}" aria-pressed="${etat.story.aimee ? 'true' : 'false'}" aria-label="${echappe(STORY.aimer)}">${svgDuSprite('ph-heart')}</button>` +
  `<button class="envoyer" type="submit" aria-label="${echappe(STORY.envoyer)}">${svgDuSprite('ph-arrow-up')}</button>` +
  '</form>';

const corps = (etat: EtatDeLaStory): string =>
  '<main id="main-content" class="story-ecran">' +
  segments(etat) +
  enTete(etat) +
  scene(etat) +
  prisme(etat.story) +
  (etat.confirmation ? `<p class="story-etat" role="status">${echappe(STORY.repondu)}</p>` : '') +
  (etat.erreur === null ? '' : `<p class="alerte" role="alert"><b>${echappe(STORY.refuse)}</b> ${echappe(etat.erreur)}</p>`) +
  repondre(etat) +
  '</main>';

export const documentDeLaStory = (etat: EtatDeLaStory): string =>
  documentPleinEcran({
    titre: `${STORY.de(etat.story.auteur)} — Meeshy`,
    description: etat.story.texte === '' ? STORY.titre : etat.story.texte,
    corps: corps(etat),
    feuille: FEUILLE,
  });

/**
 * L'INVITATION — ce que reçoit le visiteur SANS session. Aucune donnée de la
 * story n'y figure, et pour cause : la v3 n'a rien demandé à la passerelle.
 * L'adresse est gardée de côté dans `returnUrl`, comme la modale de
 * `/chat/:lien` garde la sienne.
 */
export const documentDeLInvitation = ({ id }: { readonly id: string }): string => {
  const ici = encodeURIComponent(adresseDeLaStory(id));
  return documentDuSite({
    titre: `${STORY.invitation.titre} — Meeshy`,
    description: STORY.invitation.corps,
    feuille: FEUILLE_CONNECTEE,
    robots: 'noindex, nofollow',
    corps:
      '<div class="bonjour">' +
      `<h1>${echappe(STORY.invitation.titre)}</h1>` +
      `<p>${echappe(STORY.invitation.corps)}</p>` +
      `<p>${echappe(STORY.invitation.note)}</p>` +
      '</div>' +
      `<section class="acces" aria-label="${echappe(STORY.invitation.seConnecter)}"><nav>` +
      `<a class="action primaire" href="/login?returnUrl=${ici}">${svgDuSprite('ph-sign-in')}${echappe(STORY.invitation.seConnecter)}</a>` +
      `<a class="action contour" href="/signup?returnUrl=${ici}">${echappe(STORY.invitation.creerUnCompte)}</a>` +
      '</nav></section>',
    retour: true,
  });
};

/**
 * L'INDISPONIBLE — la MÊME réponse pour une story absente, supprimée, échue ou
 * hors audience (§ 5.1) : distinguer serait un oracle d'énumération. La vue
 * `storyFail` de la planche (`cible/storyFail.png`, sa méta et ses deux
 * actions) est l'issue SUIVANTE ; ce document en est le plancher honnête, pas
 * son remplaçant.
 */
export const documentIndisponible = (): string =>
  documentDuSite({
    titre: `${STORY.indisponible.titre} — Meeshy`,
    description: STORY.indisponible.corps,
    feuille: FEUILLE_CONNECTEE,
    robots: 'noindex, nofollow',
    corps:
      '<div class="bonjour">' +
      `<h1>${echappe(STORY.indisponible.titre)}</h1>` +
      `<p>${echappe(STORY.indisponible.corps)}</p>` +
      '</div>' +
      `<section class="acces" aria-label="${echappe(STORY.indisponible.action)}"><nav>` +
      `<a class="action primaire" href="/">${echappe(STORY.indisponible.action)}</a>` +
      '</nav></section>',
    retour: true,
  });

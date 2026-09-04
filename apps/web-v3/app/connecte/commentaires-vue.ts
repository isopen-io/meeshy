import { svgDuSprite } from '@/app/actifs-inlines';
import { langAttribut } from '@/app/connecte/transcrit';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { choixDeLangue } from '@/app/choix-de-langue';
import { echappe } from '@/app/socle';
import { initiales, teinteDeLAvatar } from '@/lib/avatar';
import type { Commentaire, GenreDePublication, Publication } from '@/lib/api/publication';
import {
  COMMENTAIRES,
  GLYPHE_COEUR,
  GLYPHE_PAR_GENRE,
  GLYPHE_TRADUCTION,
} from '@/lib/contenu/commentaires';
import { nomDeLangue } from '@/lib/contenu/langues';

import { FEUILLE_DES_COMMENTAIRES } from './commentaires-feuille';
import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { CHARGEUR_DE_PARTICIPATION } from './chargeur';
import { documentPleinEcran } from './fil-vue';
import { documentDeMessage } from '@/app/enveloppe/vue';
import { carteVide, quand } from './vue';

/**
 * L'ÉCRAN DES COMMENTAIRES (`cible/comments.png`, issue #4896).
 *
 * LE `lang=` EST POSÉ SUR CHAQUE NŒUD RÉSOLU, et c'est le critère de fin qui
 * l'exige — mais la raison est plus simple qu'une case à cocher : sans lui, un
 * lecteur d'écran prononce un texte français avec la voix de la langue du
 * document. Un commentaire servi en espagnol dans une page française est
 * inaudible, littéralement.
 *
 * L'ATTRIBUT N'EST POSÉ QUE SUR CE QUI EST TRADUIT. `langueServie` est nulle
 * quand le texte est dans sa langue d'origine — poser alors un `lang=` serait
 * une affirmation que rien n'appuie, et sur l'ORIGINAL déplié c'est
 * `langueOriginale` qui vaut, pas la langue servie.
 *
 * LES TROIS PUCES DISENT CE QU'ON LIT, ELLES NE NAVIGUENT PAS. La cible les
 * dessine comme un sélecteur ; il n'y a rien à sélectionner — on arrive sur une
 * publication, et son genre est ce qu'il est. La puce du genre courant porte
 * `aria-current`, les deux autres sont là pour situer. Les rendre cliquables
 * demanderait de savoir vers QUELLE autre publication aller, ce que rien ne
 * dit (règle 7).
 *
 * « MODIFIER · SUPPRIMER » N'EST PAS RENDU SUR LE COMMENTAIRE D'UN AUTRE — et
 * ce n'est pas un `display:none`. Cacher par le style laisse le contrôle dans
 * le document : atteignable au clavier, lu par un lecteur d'écran, et cliquable
 * pour qui sait ouvrir l'inspecteur. La passerelle refuserait, mais le lecteur
 * aurait d'abord cru pouvoir.
 *
 * AUCUNE IMAGE D'AVATAR. Des initiales teintées par le nom (`lib/avatar.ts`, le
 * site unique des deux rendus) : trente avatars sur une 3G rurale coûteraient
 * plus que le fil entier, pour une information que deux lettres portent.
 */

export type EtatDesCommentaires = {
  readonly publication: Publication;
  readonly commentaires: readonly Commentaire[];
  readonly encore: boolean;
  readonly maintenant: number;
  /** Ce que le POST vient de faire, dit au retour de la redirection (#5091). */
  readonly avis?: 'commente' | null;
  /** La saisie TENUE par le serveur quand il refuse — perdre un texte tapé est le défaut le plus cher d'un formulaire. */
  readonly saisieTenue?: string;
  readonly motif?: string | null;
  /** Ce que le document porte pour son module (§ 12.4, #5091) — même origine, aucune passerelle. */
  readonly tempsReel?: { readonly module: string } | null;
};

/**
 * LA LIGNE DU PRISME — « traduit de l'anglais · voir l'original ».
 *
 * Elle n'est rendue QUE si une traduction a été servie : sur un texte déjà dans
 * sa langue, elle annoncerait une traduction qui n'a pas eu lieu. C'est le
 * défaut que le dépôt nomme « le Prisme ANNONCÉ sans être APPLIQUÉ », pris dans
 * l'autre sens.
 *
 * L'original se déplie par un `<details>` natif — aucun JavaScript, et le
 * contrôle a un EFFET (charte règle 4). Il porte le `lang=` de la langue
 * ORIGINALE, qui n'est pas celle du texte servi juste au-dessus.
 */
const lignePrisme = ({
  langueServie,
  langueOriginale,
  texteOriginal,
}: {
  readonly langueServie: string | null;
  readonly langueOriginale: string | null;
  readonly texteOriginal: string;
}): string => {
  // LA LIGNE DU PRISME ANNONCE UNE TRADUCTION, donc elle ne se rend que s'il y
  // en a eu une. `langueServie` porte désormais la langue de l'original quand
  // c'est lui qui est servi : la garder sur `null` annoncerait « traduit de
  // l'anglais » au-dessus d'un texte anglais.
  if (langueServie === null || langueOriginale === null || langueServie === langueOriginale) return '';

  return (
    '<details class="prisme">' +
    '<summary>' +
    svgDuSprite(GLYPHE_TRADUCTION) +
    `<span>${echappe(COMMENTAIRES.traduitDe(nomDeLangue(langueOriginale)))} · ${echappe(COMMENTAIRES.voirLOriginal)}</span>` +
    '</summary>' +
    `<p class="original" lang="${echappe(langueOriginale)}">${echappe(texteOriginal)}</p>` +
    '</details>'
  );
};

const puces = (courant: GenreDePublication): string =>
  `<ul class="sources" aria-label="${echappe(COMMENTAIRES.liste)}">` +
  (Object.keys(COMMENTAIRES.genres) as GenreDePublication[])
    .map((genre) => {
      const actuel = genre === courant;
      return (
        '<li>' +
        `<span class="source"${actuel ? ' aria-current="true"' : ''}>` +
        svgDuSprite(GLYPHE_PAR_GENRE[genre] ?? 'ph-article') +
        echappe(COMMENTAIRES.genres[genre]) +
        '</span>' +
        '</li>'
      );
    })
    .join('') +
  '</ul>';

const cartePublication = (publication: Publication): string =>
  '<article class="publication">' +
  `<span class="vignette" aria-hidden="true">${svgDuSprite(GLYPHE_PAR_GENRE[publication.genre] ?? 'ph-article')}</span>` +
  '<span class="dit">' +
  `<span class="qui">${echappe(publication.titre ?? publication.auteur)}${publication.titre === null ? '' : ` · ${echappe(publication.auteur)}`}</span>` +
  `<span class="texte"${langAttribut(publication.langueServie, DOCUMENT_LANGUAGE)}>${echappe(publication.texte)}</span>` +
  lignePrisme(publication) +
  '</span>' +
  '</article>';

const avatar = (nom: string): string =>
  `<span class="avatar ${teinteDeLAvatar(nom)}" aria-hidden="true">${echappe(initiales(nom))}</span>`;

const ligne = (k: Commentaire, maintenant: number): string => {
  const instant = quand(k.publieA, maintenant);

  return (
    `<li class="commentaire" data-id="${echappe(k.id)}">` +
    avatar(k.auteur) +
    '<span class="dit">' +
    '<span class="entete">' +
    `<span class="qui">${echappe(k.auteur)}</span>` +
    (instant === '' ? '' : `<span class="instant">${echappe(instant)}</span>`) +
    '</span>' +
    `<span class="texte"${langAttribut(k.langueServie, DOCUMENT_LANGUAGE)}>${echappe(k.texte)}</span>` +
    lignePrisme(k) +
    '<span class="gestes">' +
    `<span class="compteur">${svgDuSprite(GLYPHE_COEUR)}<span class="hors-ecran">${echappe(COMMENTAIRES.aimes(k.aimes))}</span><span aria-hidden="true">${k.aimes}</span></span>` +
    `<span class="geste">${echappe(COMMENTAIRES.repondre)}</span>` +
    // Les deux gestes de l'auteur ne sont pas CACHÉS sur le commentaire d'un
    // autre : ils n'y sont pas. Un `display:none` les laisserait dans le
    // document, atteignables au clavier et lus par un lecteur d'écran.
    (k.aMoi
      ? `<span class="geste">${echappe(COMMENTAIRES.modifier)}</span><span class="geste">${echappe(COMMENTAIRES.supprimer)}</span>`
      : '') +
    '</span>' +
    '</span>' +
    '</li>'
  );
};

/**
 * L'EN-TÊTE, ET SON SÉLECTEUR DE LANGUE (`sheet:lang`).
 *
 * Il est au MÊME endroit que sur la story — dans l'en-tête, à droite du titre
 * — et porte le MÊME mot (« Changer la langue ») : un lecteur qui passe d'un
 * écran à l'autre cherche le geste où il l'a laissé (dimension 6).
 *
 * `?lang=` est un GESTE sur la publication, pas un réglage : la porte le lui
 * applique sans le descendre au fil, sans quoi une langue choisie masquerait
 * les commentaires qu'elle ne traduit pas.
 */
const enTete = (publication: Publication): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/" aria-label="${echappe(COMMENTAIRES.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(COMMENTAIRES.titre)}</h1>` +
  (publication.titre === null ? '' : `<p class="sous">${echappe(publication.titre)}</p>`) +
  '</div>' +
  choixDeLangue({
    languesOffertes: publication.languesOffertes,
    langueLue: publication.langueServie ?? publication.langueOriginale,
    adresse: (langue) => `/post/${encodeURIComponent(publication.id)}?lang=${encodeURIComponent(langue)}`,
    libelle: COMMENTAIRES.langues,
  }) +
  '</header>';

/**
 * LE GESTE D'ÉCRITURE (#5091) — un `<form method="post">` vers la MÊME adresse,
 * le chemin qui marche partout. Cet écran n'est servi qu'à un lecteur CONNECTÉ
 * (l'invitation couvre l'anonyme en amont) : le formulaire n'est donc jamais un
 * contrôle qui rendrait 401. La saisie refusée revient TENUE par le serveur,
 * le motif en `role="alert"` ; le succès se dit en `role="status"` au retour
 * de la redirection.
 */
const ecrire = ({ saisieTenue, motif, avis }: EtatDesCommentaires): string =>
  (avis === 'commente'
    ? `<p class="avis" role="status">${svgDuSprite('ph-check-circle')}${echappe(COMMENTAIRES.publie)}</p>`
    : '') +
  '<form class="ecrire" method="post">' +
  '<p class="voix-du-geste" role="status" hidden></p>' +
  (motif === null || motif === undefined ? '' : `<p class="motif" role="alert">${echappe(motif)}</p>`) +
  `<label class="hors-ecran" for="contenu-du-commentaire">${echappe(COMMENTAIRES.ecrire)}</label>` +
  `<textarea id="contenu-du-commentaire" name="contenu" rows="2" maxlength="2000" required placeholder="${echappe(
    COMMENTAIRES.ecrire,
  )}">${echappe(saisieTenue ?? '')}</textarea>` +
  `<button type="submit" class="action primaire">${echappe(COMMENTAIRES.publier)}</button>` +
  '</form>';

const corps = (etat: EtatDesCommentaires): string => {
  const { publication, commentaires, encore, maintenant, tempsReel } = etat;
  const participation =
    tempsReel === null || tempsReel === undefined
      ? ''
      : ` data-participation="commentaires" data-module="${echappe(tempsReel.module)}"`;
  return (
    `<main id="main-content" class="commentaires-ecran"${participation}>` +
    enTete(publication) +
    puces(publication.genre) +
    cartePublication(publication) +
    '<div id="fil-des-commentaires">' +
    (commentaires.length === 0
      ? carteVide({
          glyphe: 'ph-chat-circle',
          titre: COMMENTAIRES.vide,
          phrase: COMMENTAIRES.videPrecision,
        })
      : `<ul class="commentaires">${commentaires.map((k) => ligne(k, maintenant)).join('')}</ul>`) +
    (encore ? `<p class="encore">${echappe(COMMENTAIRES.encore)}</p>` : '') +
    ecrire(etat) +
    '</div>' +
    '</main>'
  );
};

export const documentDesCommentaires = (etat: EtatDesCommentaires): string =>
  documentPleinEcran({
    titre: COMMENTAIRES.titre,
    description: etat.publication.titre ?? COMMENTAIRES.titre,
    corps: corps(etat),
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_COMMENTAIRES,
    script: etat.tempsReel === null || etat.tempsReel === undefined ? '' : CHARGEUR_DE_PARTICIPATION,
  });

/**
 * L'INVITATION — pour qui n'a pas de session, ou dont le jeton a expiré.
 *
 * Ce n'est PAS une redirection sèche vers `/login` : le lecteur qui ouvre un
 * lien reçu doit savoir CE QU'IL OUVRE avant qu'on lui demande de se
 * connecter. Elle porte donc son titre, sa raison, et `?returnUrl=` sur les
 * deux actions — pour que le lien ramène là où il menait.
 *
 * La même forme que celle de la story (`story-vue.ts`), et pour la même
 * raison : les trois portes de cette publication sont en `requiredAuth`, et la
 * v3 s'y conforme sans rien demander d'ouvert.
 */
export const documentDInvitation = ({ id }: { readonly id: string }): string => {
  const ici = encodeURIComponent(`/post/${id}`);
  return documentDeMessage({
    titre: COMMENTAIRES.invitation,
    paragraphes: [COMMENTAIRES.invitationPrecision],
    actions: [
      { libelle: COMMENTAIRES.seConnecter, href: `/login?returnUrl=${ici}`, glyphe: 'ph-sign-in' },
    ],
    feuille: FEUILLE_CONNECTEE,
  });
};

/**
 * L'INDISPONIBLE — la MÊME réponse pour une publication absente, supprimée,
 * hors audience, ou d'un genre que cet écran ne sert pas.
 *
 * Distinguer serait un oracle d'énumération, et la passerelle a déjà pris ce
 * parti : son refus est un `404` et non un `403`, « distinguer révélerait
 * l'existence du post ». L'écran ne défait pas côté client ce que le serveur
 * a décidé côté serveur — il le DIT, en assumant l'ambiguïté plutôt qu'en la
 * masquant.
 */
export const documentIndisponible = (): string =>
  documentDeMessage({
    titre: COMMENTAIRES.introuvable,
    paragraphes: [COMMENTAIRES.introuvablePrecision],
    feuille: FEUILLE_CONNECTEE,
  });

import { svgDuSprite } from '@/app/actifs-inlines';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { echappe } from '@/app/socle';
import { mediaHtml } from '@/app/media-html';
import type { PostDuFil, TexteDeLangue, Vignette } from '@/lib/api/social';
import { quand } from '@/lib/temps';
import { FIL_SOCIAL, GLYPHE_COEUR, GLYPHE_COMMENTER, GLYPHE_REPOSTER } from '@/lib/contenu/social';

import { langAttribut } from './transcrit';
import { avatar } from './vue';
import { documentPleinEcran } from './fil-vue';
import { CHARGEUR_DE_PARTICIPATION } from './chargeur';
import { FEUILLE_DU_FIL_SOCIAL } from './social-feuille';
import { carteVide } from './vue';

/**
 * L'ÉCRAN DU FIL SOCIAL (`/feed`, cible/feed.png, #5031) — le rail de stories,
 * puis les posts et réels du voisinage.
 *
 * IL EMPRUNTE `documentPleinEcran` (le même squelette que le fil et les
 * commentaires) : un en-tête collant, aucun pied de site — un lecteur qui fait
 * défiler ce fil ne doit pas voir la marque et les liens institutionnels
 * apparaître entre deux publications.
 *
 * « VOTRE STORY » ET LE COMPOSEUR NE SONT PAS RENDUS. La cible en dessine un
 * tuile « + Votre story » et une bande « Quoi de neuf ? » — les DEUX ouvrent un
 * geste d'ÉCRITURE (`/stories/new`, `/composer`) que la v3 ne sert pas encore
 * (matrice.json : `storyCreate` dépend de `composer`, hors de ce lot). C'est la
 * même règle que `/post/:id` applique déjà à l'écriture d'un commentaire :
 * « poser le verbe sans le formulaire ferait une surface ouverte sans lecteur »
 * (charte règle 7 — un contrôle qui ne mène nulle part n'est pas rendu). Écart
 * de DISPOSITION assumé avec la cible, à refermer dans le lot `composer`.
 */

export type EtatDuFilSocial = {
  readonly stories: readonly Vignette[];
  readonly posts: readonly PostDuFil[];
  /**
   * `null` — plus rien à charger. Une chaîne — le curseur de la page
   * suivante : `corps()` rend ALORS `<a href="/feed?cursor=…">`, jamais un
   * bouton sans cible (charte règle 7 — un contrôle a un EFFET). Défaut
   * corrigé : `encore`/`hasMore` étaient PORTÉS jusqu'ici sans jamais être
   * LUS par `corps()` — le cycle 122 nommait déjà cette forme de défaut.
   */
  readonly curseurSuivant: string | null;
  readonly maintenant: number;
  /** `?fait=` — la confirmation d'un geste qui vient d'aboutir SANS JavaScript. */
  readonly fait: 'aime' | 'aime-retire' | 'repost' | null;
  /** `?refus=1` — le geste n'a pas abouti. */
  readonly echoue: boolean;
  /**
   * Le socle du module de participation optimiste (§ 12.4-like, MAIS sans
   * socket : aimer et reposter n'ont besoin que d'un aller simple). `null`
   * tant que l'actif compilé est absent (tests, avant le premier `bun build`)
   * — le chemin SANS JavaScript reste alors le SEUL chemin, ce qui est
   * toujours correct (amélioration progressive, jamais une condition).
   */
  readonly tempsReel: { readonly module: string; readonly passerelle: string } | null;
};

/**
 * L'EN-TÊTE PORTE LA PORTE DES RÉELS. La table de navigation de la planche
 * (`MeeshyWebV3.dc.html:870`) pose un bouton « Réels » sur cet écran — c'est la
 * SEULE entrée de `/feed/reels` qu'elle dessine, et sans elle l'écran serait
 * servi sans qu'aucun lien n'y mène (leçon 507).
 *
 * IL PREND LA PLACE DE DROITE de l'en-tête du fil, celle que `.fil-tete` réserve
 * déjà à une action (`.medias` sur le fil de conversation) : même géométrie,
 * même cible de 44 px, aucun pixel neuf.
 */
const enTete = (): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/" aria-label="${echappe(FIL_SOCIAL.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(FIL_SOCIAL.titre)}</h1>` +
  `<p class="sous">${echappe(FIL_SOCIAL.sousTitre)}</p>` +
  '</div>' +
  `<a class="medias" href="/feed/reels" aria-label="${echappe(FIL_SOCIAL.reels)}">${svgDuSprite('ph-film-strip')}</a>` +
  '</header>';

/**
 * `data-vu` PORTE L'ANNEAU vu/non-vu (`Vignette.vu`, `isViewedByMe` servi par
 * la projection `tray`, § postIncludes.ts) — `cible/feed.png` distingue les
 * DEUX (Ibrahim/Marta accentués, non vues ; Sara/Luc neutres, déjà vues) : le
 * seul signal utile d'un rail de stories.
 */
const vignetteDeStory = (story: Vignette): string =>
  '<li>' +
  `<a href="/stories/${echappe(encodeURIComponent(story.id))}">` +
  `<span class="cercle" data-vu="${story.vu ? '1' : '0'}">${avatar(story.auteur)}</span>` +
  `<span class="nom">${echappe(story.auteur)}</span>` +
  '</a>' +
  '</li>';

/**
 * LE SAUT DE RAIL — un couloir de stories peut porter des dizaines de
 * vignettes, chacune INDIVIDUELLEMENT focusable (§ scrollable au clavier) :
 * sans lien de contournement, la première publication n'est atteignable
 * qu'après avoir tabulé tout le rail. `href="#publications"` cible
 * `<ul id="publications" tabindex="-1">` (`corps()` ci-dessous) — le lien
 * lui-même reste hors-écran jusqu'au focus (`.saut:focus-visible`, feuille).
 */
const sautDeRail = (stories: readonly Vignette[]): string =>
  stories.length === 0 ? '' : `<a class="saut" href="#publications">${echappe(FIL_SOCIAL.allerAuxPublications)}</a>`;

const rail = (stories: readonly Vignette[]): string =>
  stories.length === 0
    ? ''
    : `<ul class="rail" aria-label="${echappe(FIL_SOCIAL.rail)}">${stories.map(vignetteDeStory).join('')}</ul>`;

/**
 * LE GROUPE DE LANGUES D'UN POST — un `<input type="radio">` par texte
 * distinct, immédiatement suivi de SON texte : c'est cet ordre-là,
 * radio-puis-contenu, que la feuille exploite (`input:checked+.texte`), et
 * lui seul rend l'effet générique quel que soit le nombre de langues.
 *
 * UN SEUL TEXTE ⇒ AUCUN GROUPE. Rendre un radio de UN n'offrirait aucun choix,
 * et la charte (règle 7) veut un contrôle qui a un effet — en changer l'état
 * ne changerait rien à afficher.
 */
const puceDeLangue = (id: string, texte: TexteDeLangue): string => {
  const libelle = texte.origine
    ? `${nomDeLangue(texte.langue)} · ${FIL_SOCIAL.original}`
    : nomDeLangue(texte.langue);
  return `<label for="${echappe(id)}">${echappe(libelle)}</label>`;
};

const nomDeLangue = (code: string | null): string => {
  if (code === null) return FIL_SOCIAL.original;
  try {
    return new Intl.DisplayNames(['fr'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
};

const corpsDuTexte = (postId: string, textes: readonly TexteDeLangue[], langueDuDocument: string): string => {
  const premier = textes[0];
  if (premier === undefined) return '';
  if (textes.length === 1) {
    return `<p class="texte"${langAttribut(premier.langue, langueDuDocument)}>${echappe(premier.texte)}</p>`;
  }

  const nomDuGroupe = `langue-${postId}`;
  const idDe = (rang: number): string => `lang-${postId}-${rang}`;

  return (
    `<fieldset class="prisme-multi">` +
    `<legend class="hors-ecran">${echappe(FIL_SOCIAL.langueDeCePost)}</legend>` +
    textes
      .map(
        (texte, rang) =>
          `<input type="radio" id="${idDe(rang)}" name="${echappe(nomDuGroupe)}" class="hors-ecran"${rang === 0 ? ' checked' : ''}>` +
          `<p class="texte"${langAttribut(texte.langue, langueDuDocument)}>${echappe(texte.texte)}</p>`,
      )
      .join('') +
    `<div class="langues">${textes.map((texte, rang) => puceDeLangue(idDe(rang), texte)).join('')}</div>` +
    '</fieldset>'
  );
};

/**
 * LE GESTE « AIMER » — deux formulaires, jamais une bascule côté client : le
 * corps posté DIT le geste voulu (`aime` ou `retirer-aime`), et la porte sait
 * laquelle des deux routes de la passerelle appeler (§ `lib/api/publication.ts`
 * › `aime`). C'est le MÊME patron que la sourdine de `/chats`
 * (`app/connecte/liste-porte.ts`), appliqué à un geste à deux états au lieu
 * d'un geste à trois.
 */
const gesteAimer = (post: PostDuFil): string =>
  '<form method="post" action="/feed" class="geste geste-aime">' +
  `<input type="hidden" name="post" value="${echappe(post.id)}"/>` +
  `<input type="hidden" name="geste" value="${post.aimeParMoi ? 'retirer-aime' : 'aime'}"/>` +
  `<button type="submit" aria-pressed="${post.aimeParMoi ? 'true' : 'false'}">` +
  svgDuSprite(GLYPHE_COEUR) +
  `<span class="hors-ecran">${echappe(post.aimeParMoi ? FIL_SOCIAL.aimeRetire : FIL_SOCIAL.aime)}</span>` +
  `<span class="valeur">${post.aimes}</span>` +
  '</button>' +
  '</form>';

/**
 * LE GESTE « REPOSTER » — À SENS UNIQUE (voir `lib/api/publication.ts` ›
 * `reposte`) : une fois republié, ce n'est plus un bouton — aucune route ne
 * défait un repost, et un contrôle qu'aucun second geste ne peut accomplir
 * n'est pas un bouton (charte règle 7).
 *
 * LES DEUX ÉTATS SONT SERVIS ENSEMBLE, l'un `hidden`. C'est la loi de
 * `lib/realtime/liste-peinture.ts` reprise ici : « elle ne crée aucun nœud » —
 * le module de participation (§ 12.4) n'a pas accès au sprite sur le disque,
 * donc pas de quoi FABRIQUER l'état « Reposté » après coup. Il ne fait que
 * révéler la fente que le document sert déjà cachée.
 */
const gesteReposter = (post: PostDuFil): string =>
  '<form method="post" action="/feed" class="geste geste-reposter"' + (post.reposteParMoi ? ' hidden' : '') + '>' +
  `<input type="hidden" name="post" value="${echappe(post.id)}"/>` +
  '<input type="hidden" name="geste" value="repost"/>' +
  '<button type="submit">' +
  svgDuSprite(GLYPHE_REPOSTER) +
  `<span class="hors-ecran">${echappe(FIL_SOCIAL.reposter)}</span>` +
  `<span class="valeur">${post.reposts}</span>` +
  '</button>' +
  '</form>' +
  `<span class="geste geste-reposte" aria-label="${echappe(FIL_SOCIAL.reposte)}"${post.reposteParMoi ? '' : ' hidden'}>` +
  svgDuSprite(GLYPHE_REPOSTER) +
  `<span class="valeur">${post.reposts}</span>` +
  '</span>';

const gestes = (post: PostDuFil): string =>
  '<div class="gestes">' +
  gesteAimer(post) +
  `<a class="geste geste-commenter" href="/post/${echappe(encodeURIComponent(post.id))}">` +
  svgDuSprite(GLYPHE_COMMENTER) +
  `<span class="hors-ecran">${echappe(FIL_SOCIAL.commenter)}</span>` +
  `<span class="valeur">${post.commentaires}</span>` +
  '</a>' +
  gesteReposter(post) +
  '</div>';

/** L'ancre d'une carte (`#post-<id>`) — partagée par le rendu ET par la porte
 * (redirection Post/Redirect/Get), pour qu'aimer la 18ᵉ publication rende à
 * la 18ᵉ, jamais au sommet du fil (`PostFeedService.getFeed` réordonne le
 * fil à chaque lecture — récence, engagement, affinité, diversité — donc
 * seule une ANCRE, pas un rang, retrouve la carte après le rechargement). */
export const idDuPost = (id: string): string => `post-${id}`;

const cartePost = (post: PostDuFil, maintenant: number, langueDuDocument: string): string => {
  const premierMedia = post.medias[0];
  return (
    `<li><article class="post" id="${echappe(idDuPost(post.id))}" data-post="${echappe(post.id)}" data-aime="${post.aimeParMoi ? '1' : '0'}" data-aimes="${post.aimes}" data-reposte="${post.reposteParMoi ? '1' : '0'}" data-reposts="${post.reposts}">` +
    '<div class="entete">' +
    avatar(post.auteur) +
    '<span class="dit">' +
    `<span class="qui">${echappe(post.auteur)}</span>` +
    `<span class="instant">${echappe(quand(post.publieA, maintenant))}</span>` +
    '</span>' +
    '</div>' +
    corpsDuTexte(post.id, post.textes, langueDuDocument) +
    (premierMedia === undefined ? '' : `<figure class="media">${mediaHtml(premierMedia, post.textes[0]?.texte ?? '')}</figure>`) +
    gestes(post) +
    '</article></li>'
  );
};

const corps = (etat: EtatDuFilSocial, langueDuDocument: string): string =>
  sautDeRail(etat.stories) +
  rail(etat.stories) +
  '<p class="hors-ecran" id="journal-des-gestes" role="status" aria-live="polite">' +
  (etat.fait === null ? '' : CONFIRMATIONS[etat.fait]) +
  '</p>' +
  (etat.echoue ? `<p class="alerte" role="alert">${echappe(FIL_SOCIAL.echec)}</p>` : '') +
  (etat.posts.length === 0
    ? carteVide({ glyphe: 'ph-chats-circle', titre: FIL_SOCIAL.vide, phrase: FIL_SOCIAL.videPrecision })
    : `<ul class="publications" id="publications" tabindex="-1" aria-label="${echappe(FIL_SOCIAL.publications)}">${etat.posts
        .map((post) => cartePost(post, etat.maintenant, langueDuDocument))
        .join('')}</ul>`) +
  (etat.curseurSuivant === null
    ? ''
    : `<a class="plus" href="/feed?cursor=${echappe(encodeURIComponent(etat.curseurSuivant))}">${echappe(FIL_SOCIAL.plus)}</a>`);

const CONFIRMATIONS: Readonly<Record<'aime' | 'aime-retire' | 'repost', string>> = {
  aime: 'Vous aimez cette publication.',
  'aime-retire': 'Vous n’aimez plus cette publication.',
  repost: 'Publication repartagée.',
};

export const documentDuFilSocial = (etat: EtatDuFilSocial): string =>
  documentPleinEcran({
    titre: `${FIL_SOCIAL.titre} — Meeshy`,
    description: FIL_SOCIAL.sousTitre,
    corps: `<main id="main-content" class="fil-social"${etat.tempsReel === null ? '' : ` data-participation="feed" data-module="${echappe(etat.tempsReel.module)}" data-passerelle="${echappe(etat.tempsReel.passerelle)}"`}>${enTete()}${corps(etat, DOCUMENT_LANGUAGE)}</main>`,
    feuille: FEUILLE_DU_FIL_SOCIAL,
    script: etat.tempsReel === null ? '' : CHARGEUR_DE_PARTICIPATION,
  });

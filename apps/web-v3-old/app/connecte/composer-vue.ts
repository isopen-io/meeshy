import { svgDuSprite } from '@/app/actifs-inlines';
import { CHARGEUR_DE_PARTICIPATION } from '@/app/connecte/chargeur';
import { documentPleinEcran } from '@/app/connecte/fil-vue';
import { echappe } from '@/app/socle';

import {
  AUDIENCES,
  CHAMPS_DU_COMPOSER,
  CHAMP_DU_FORMAT,
  COMPOSER,
  FORMATS_SERVIS,
  HUMEURS,
  LONGUEUR_MAX_DU_CONTENU,
  ONGLET_DE_LA_STORY,
  type Audience,
  type FormatServi,
} from '@/lib/contenu/composer';
import { nomDeLangue } from '@/lib/contenu/langues';

import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_COMPOSER } from './composer-feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { FEUILLE_DES_REGLAGES } from './reglages-feuille';

/**
 * L'ÉCRAN DE COMPOSITION (`/composer`, #4966, `cible/composer.png`).
 *
 * IL MARCHE ENTIER SANS UN OCTET DE JAVASCRIPT, et ce n'est pas une
 * dégradation — c'est le socle. Changer de format est une NAVIGATION
 * (`?format=`), choisir une humeur est un `radiogroup`, choisir une audience un
 * `<select>`, publier un `POST` suivi d'un Post/Redirect/Get. Rien de tout cela
 * n'a besoin d'un script, donc rien ne l'attend.
 *
 * **LA LIGNE « AUDIENCE » EST UN CONTRÔLE, PAS UNE MENTION.** Le doc-comment de
 * `publie()` (`lib/api/publication.ts`) annonçait l'inverse — « sa ligne
 * Audience reste INFORMATIVE » — et ce n'était pas tenable une fois l'écran
 * écrit : sur un écran de CRÉATION, une ligne qui affiche « Public » sans
 * pouvoir en changer est exactement le contrôle qui ment que la charte règle 7
 * interdit. `CreatePostSchema.visibility` accepte les trois valeurs sans champ
 * de plus ; il n'y avait aucune raison de ne pas les servir.
 *
 * **LA LIGNE « TRADUCTION » RESTE INFORMATIVE, ELLE, ET C'EST DIFFÉRENT.** Il
 * n'y a rien à y choisir : la v3 REVENDIQUE la langue dans laquelle le texte est
 * écrit (`originalLanguage`), et c'est le Prisme de chaque LECTEUR qui décide
 * ensuite ce qu'il lit. La ligne dit donc ce qui va se passer, avec la langue
 * RÉELLE que la revendication portera — jamais le littéral « Auto » de la
 * cible, qui laisse croire à un réglage.
 */

export const ADRESSE_DU_COMPOSER = '/composer';

/** L'adresse d'un format — un ÉTAT de cette page, jamais un écran de plus. */
export const versLeFormat = (format: FormatServi): string =>
  `${ADRESSE_DU_COMPOSER}?${CHAMP_DU_FORMAT}=${format}`;

export type EtatDuComposer = {
  readonly format: FormatServi;
  /** Ce que le lecteur a tapé — reposé TEL QUEL après un refus. */
  readonly texte: string;
  /** L'humeur choisie, ou `null`. */
  readonly humeur: string | null;
  readonly audience: Audience;
  /** La langue que la publication REVENDIQUERA, ou `null` — la passerelle devinera. */
  readonly langue: string | null;
  /** Le retour du Post/Redirect/Get : la publication est partie, et voici où la voir. */
  readonly publie: boolean;
  /** Le refus de la passerelle, rendu TEL QUEL — jamais recomposé ici. */
  readonly erreur: string | null;
  /**
   * LE MODULE DU BROUILLON (#4966), `null` tant que l'actif n'est pas compilé.
   *
   * **IL N'Y A NI PASSERELLE NI SOCKET ICI**, et c'est ce qui distingue ce
   * `tempsReel` des huit autres : le module de cet écran ne parle à personne.
   * Il tient la saisie dans `sessionStorage` — ce que le `no-store` du document
   * ne peut pas tenir à sa place, et ce que le bfcache lui refuse pour la même
   * raison. Le champ garde son nom pour que le chargeur différé, qui vise
   * `main[data-module]`, n'ait rien à savoir de plus.
   */
  readonly tempsReel: { readonly module: string } | null;
};

const enTete = (): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/feed" aria-label="${echappe(COMPOSER.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(COMPOSER.titre)}</h1>` +
  `<p class="sous">${echappe(COMPOSER.sousTitre)}</p>` +
  '</div>' +
  '</header>';

/**
 * LES ONGLETS — des LIENS, et seulement ceux dont la publication aboutit.
 *
 * `aria-current="page"` porte lequel est servi : sans lui, dix lecteurs d'écran
 * annoncent deux liens identiques et rien ne dit lequel est ouvert. Le fond
 * accentué le dit à l'œil ; `aria-current` le dit à tout le reste (charte
 * règle 12 — une information ne tient jamais à la seule couleur).
 */
const onglets = (courant: FormatServi): string =>
  `<ul class="onglets" aria-label="${echappe(COMPOSER.formats)}">` +
  FORMATS_SERVIS.map(
    ({ cle, glyphe, libelle }) =>
      `<li><a href="${echappe(versLeFormat(cle))}"${cle === courant ? ' aria-current="page"' : ''}>` +
      `${svgDuSprite(glyphe)}${echappe(libelle)}</a></li>`,
  ).join('') +
  // LA STORY EST UN ÉCRAN, PAS UN FORMAT — l'onglet MÈNE à `/stories/new`
  // (#5033) et ne porte donc jamais `aria-current` : on n'y est jamais.
  `<li><a href="${echappe(ONGLET_DE_LA_STORY.href)}">` +
  `${svgDuSprite(ONGLET_DE_LA_STORY.glyphe)}${echappe(ONGLET_DE_LA_STORY.libelle)}</a></li>` +
  '</ul>';

const champDuTexte = ({ etat, libelle, indice }: { readonly etat: EtatDuComposer; readonly libelle: string; readonly indice: string }): string =>
  '<p class="champ">' +
  `<label for="c-texte">${echappe(libelle)}</label>` +
  `<textarea id="c-texte" name="${CHAMPS_DU_COMPOSER.texte}" rows="4" maxlength="${LONGUEUR_MAX_DU_CONTENU}" ` +
  `placeholder="${echappe(indice)}" autocomplete="off">${echappe(etat.texte)}</textarea>` +
  `<span class="aide">${echappe(COMPOSER.borne(LONGUEUR_MAX_DU_CONTENU))}</span>` +
  '</p>';

/**
 * LA GRILLE D'HUMEURS — dix radios, l'emoji VISIBLE et un nom accessible.
 *
 * L'emoji est le libellé qu'on voit ; il n'est pas un nom. Sans le
 * `<span class="hors-ecran">`, un lecteur d'écran annonce dix fois la même
 * chose — ou le nom Unicode du caractère, qui n'est pas français.
 */
const grilleDHumeurs = (choisie: string | null): string =>
  '<fieldset class="humeurs">' +
  `<legend>${echappe(COMPOSER.humeur)}</legend>` +
  HUMEURS.map(
    (emoji) =>
      '<label>' +
      `<input class="hors-ecran" type="radio" name="${CHAMPS_DU_COMPOSER.humeur}" value="${echappe(emoji)}"${emoji === choisie ? ' checked' : ''}>` +
      `<span aria-hidden="true">${emoji}</span>` +
      `<span class="hors-ecran">${echappe(emoji)}</span>` +
      '</label>',
  ).join('') +
  '</fieldset>';

/**
 * L'AUDIENCE — un `<select>`, et chaque option porte SA phrase sous la liste :
 * « Contacts » ne dit pas à qui, et une audience mal comprise est une fuite de
 * confidentialité, pas une préférence d'affichage. La phrase servie est celle
 * de l'audience COURANTE — la seule que le socle sans JavaScript sait montrer.
 */
const champDeLAudience = (courante: Audience): string =>
  '<p class="champ">' +
  `<label for="c-audience">${echappe(COMPOSER.audience)}</label>` +
  `<select id="c-audience" name="${CHAMPS_DU_COMPOSER.audience}">` +
  AUDIENCES.map(
    ({ valeur, libelle }) =>
      `<option value="${valeur}"${valeur === courante ? ' selected' : ''}>${echappe(libelle)}</option>`,
  ).join('') +
  '</select>' +
  `<span class="aide">${echappe(AUDIENCES.find((a) => a.valeur === courante)?.phrase ?? '')}</span>` +
  '</p>';

const ligneDeTraduction = (langue: string | null): string =>
  '<p class="phrase">' +
  svgDuSprite('ph-translate') +
  ' ' +
  echappe(langue === null ? COMPOSER.traductionSansLangue : COMPOSER.traductionPhrase(nomDeLangue(langue))) +
  '</p>';

const corps = (etat: EtatDuComposer): string =>
  onglets(etat.format) +
  (etat.publie
    ? `<p class="avis" role="status">${echappe(COMPOSER.publie)} <a href="/feed">${echappe(COMPOSER.publieVoir)}</a></p>`
    : '') +
  (etat.erreur === null
    ? ''
    : `<p class="alerte" role="alert"><b>${echappe(COMPOSER.refuse)}</b> ${echappe(etat.erreur)}</p>`) +
  '<form method="post">' +
  `<input type="hidden" name="${CHAMP_DU_FORMAT}" value="${etat.format}">` +
  '<section>' +
  (etat.format === 'humeur'
    ? `<h2>${echappe(COMPOSER.humeur)}</h2>` +
      `<p class="phrase">${echappe(COMPOSER.humeurAide)}</p>` +
      grilleDHumeurs(etat.humeur) +
      champDuTexte({ etat, libelle: COMPOSER.humeurTexte, indice: COMPOSER.humeurTextePlaceholder })
    : `<h2>${echappe(COMPOSER.texte)}</h2>` +
      champDuTexte({ etat, libelle: COMPOSER.texte, indice: COMPOSER.textePlaceholder })) +
  '</section>' +
  '<section>' +
  `<h2>${echappe(COMPOSER.audience)}</h2>` +
  champDeLAudience(etat.audience) +
  ligneDeTraduction(etat.langue) +
  '</section>' +
  `<button type="submit" class="action primaire publier">${echappe(COMPOSER.publier)}</button>` +
  '</form>';

/**
 * Ce que le `<main>` porte pour son module — le chargeur différé vise
 * `main[data-module]`, et le module se reconnaît à `data-participation`.
 * Aucune adresse de passerelle : il n'en joint aucune.
 */
const attributsDuBrouillon = (etat: EtatDuComposer): string =>
  etat.tempsReel === null
    ? ''
    : ` data-participation="composer" data-module="${echappe(etat.tempsReel.module)}"`;

export const documentDuComposer = (etat: EtatDuComposer): string =>
  documentPleinEcran({
    titre: `${COMPOSER.titre} — Meeshy`,
    description: COMPOSER.sousTitre,
    corps:
      `<main id="main-content" class="reglages composer"${attributsDuBrouillon(etat)}>` +
      `${enTete()}${corps(etat)}</main>`,
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_REGLAGES + FEUILLE_DU_COMPOSER,
    script: etat.tempsReel === null ? '' : CHARGEUR_DE_PARTICIPATION,
  });

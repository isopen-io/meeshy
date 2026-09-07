import { ACCEPTED_MIME_TYPES } from '@meeshy/shared/types/attachment';

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
  MAX_POST_MEDIA,
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
   * LE REFUS DES MÉDIAS (#5390) — DISTINCT de `erreur` : un fichier hors
   * vocabulaire, ou plus de `MAX_POST_MEDIA`, se refuse À L'ÉCRAN, dans le
   * bloc du champ médias, sans jamais appeler la passerelle (§ étape 4 de la
   * spécification). `erreur` reste le refus SERVEUR — les deux peuvent
   * coexister (un refus de médias jugé côté porte, puis un refus serveur sur
   * un envoi suivant), donc ce ne sont pas deux formes d'un même champ.
   */
  readonly refusDesMedias: string | null;
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

/**
 * LE CHAMP DES MÉDIAS (#5390) — servi UNIQUEMENT en format `post` (la cible
 * dessine la grille sous le champ de texte de CET onglet ; une humeur est un
 * emoji, § 7 Q3 de la spécification).
 *
 * L'INPUT MULTIPART EST LE CHEMIN QUI MARCHE PARTOUT : un `<input type="file"
 * multiple>` dans un `<form enctype="multipart/form-data">` poste les octets
 * sans un octet de JavaScript. Il porte `.hors-ecran` — le MÊME idiome que la
 * grille d'humeurs (`composer-feuille.ts`) : la tuile pointillée « + Ajouter »
 * de la cible est le `<label>` VISIBLE qui l'enveloppe, un clic dessus ouvre
 * le sélecteur natif exactement comme un clic sur l'input lui-même.
 *
 * **LA TUILE « + AJOUTER » EST LE DERNIER ÉLÉMENT DE LA MÊME GRILLE QUE LES
 * APERÇUS** (revue #5390) — c'est ce que `cible/composer.png` dessine : une
 * vignette et la tuile pointillée CÔTE À CÔTE, de même taille, l'ajout en
 * DERNIER. Servie au-dessus d'une liste séparée, elle aurait mis le geste
 * d'ajout avant ce qu'on a déjà choisi, et deux rythmes verticaux là où la
 * cible n'en montre qu'un. Le module (`lib/realtime/composer.ts`) insère donc
 * ses aperçus AVANT cette tuile, et ne touche jamais aux autres.
 *
 * `<ul class="apercus">` n'est jamais `hidden` : elle porte toujours au moins
 * la tuile d'ajout. L'aperçu, lui, reste une amélioration progressive (§ 12.4)
 * — sans script, la liste ne contient QUE la tuile, et le navigateur montre sa
 * propre liste de noms.
 *
 * LE NOM DU GROUPE EST SERVI HORS ÉCRAN : la cible ne dessine aucun titre
 * au-dessus de la grille (elle va du texte à la grille), mais un lecteur
 * d'écran qui rencontre « Ajouter » sans contexte ne sait pas ce qu'il
 * ajoute. `.hors-ecran` sert les deux — la disposition de la cible ET le nom
 * du champ (dimension 5).
 *
 * LE REFUS EST PEINT DANS CE BLOC, PAS AU-DESSUS DU FORMULAIRE : c'est le
 * champ qu'il concerne, et un lecteur qui vient de choisir un fichier refusé
 * doit voir pourquoi À CÔTÉ du contrôle qui l'a refusé. Il est AUSSI relié à
 * l'input par `aria-describedby` — annoncé par `role="alert"` au moment où il
 * paraît, retrouvable en revenant sur le champ.
 */
const ID_DE_L_AIDE = 'c-medias-aide';
const ID_DU_REFUS = 'c-medias-refus';

/**
 * `accept` OFFRE EXACTEMENT CE QUE LA PORTE ACCEPTE (revue #5390) — la MÊME
 * liste que `isImageMimeType`/`isVideoMimeType` appliquent
 * (`ACCEPTED_MIME_TYPES.IMAGE` + `.VIDEO`, `@meeshy/shared/types/attachment`),
 * jamais une seconde.
 *
 * Il valait `image/*,video/*`, un OFFRE plus large que la RÈGLE : le sélecteur
 * proposait au lecteur des fichiers que la porte allait refuser — un `.heic`
 * pris dans Fichiers sur iOS, un `.avif` sur Android — et le refus arrivait
 * APRÈS le choix, sans qu'il ait pu le prévoir. Un contrôle qui offre ce
 * qu'il refuse est la forme la plus discrète du contrôle qui ment.
 *
 * Le fichier `lib/contenu/composer.ts` ne pouvait PAS porter cette liste : il
 * est requis en CommonJS par les specs Playwright, où un `import` statique de
 * `@meeshy/shared` (ESM) jette. Cette vue, elle, ne tourne que dans le process
 * Next — comme `composer-porte.ts`, qui importe les mêmes gardes.
 */
/** EXPORTÉE (#5389) — `story-neuve-vue.ts` sert la MÊME liste sur son champ fichier, jamais une seconde. */
export const TYPES_ACCEPTES = [...ACCEPTED_MIME_TYPES.IMAGE, ...ACCEPTED_MIME_TYPES.VIDEO].join(',');

/**
 * LE GABARIT DU RETRAIT (#5390, revue — défaut 1) — `previsualiseMedias`
 * (`lib/realtime/composer.ts`) pose un bouton « Retirer » sur CHAQUE
 * vignette, et un module de navigateur NE FABRIQUE JAMAIS un tracé : c'est le
 * même interdit que `notifs-peinture.ts` (`template#gabarit-notif`) et
 * `liste-peinture.ts` — un glyphe est TOUJOURS inliné par `svgDuSprite`, côté
 * SERVEUR, jamais recomposé en JavaScript. Aucune vignette n'existe sans
 * script (§ 12.4) : le gabarit est donc `hidden` par nature (`<template>` ne
 * se rend jamais) et ne coûte qu'un `<svg>` déjà présent ailleurs sur la
 * page — zéro requête de plus.
 */
const GABARIT_DU_RETRAIT = 'c-medias-gabarit-retrait';

const gabaritDuRetrait = (): string => `<template id="${GABARIT_DU_RETRAIT}">${svgDuSprite('ph-x')}</template>`;

const champDesMedias = (refus: string | null): string =>
  '<div class="champ medias">' +
  `<p class="hors-ecran" id="c-medias-titre">${echappe(COMPOSER.medias)}</p>` +
  '<ul class="apercus" aria-labelledby="c-medias-titre">' +
  '<li class="tuile-ajouter">' +
  '<label class="ajouter">' +
  `<input class="hors-ecran" id="c-medias" type="file" name="${CHAMPS_DU_COMPOSER.medias}" accept="${TYPES_ACCEPTES}" multiple` +
  ` aria-describedby="${ID_DE_L_AIDE}${refus === null ? '' : ` ${ID_DU_REFUS}`}">` +
  svgDuSprite('ph-plus') +
  `<span>${echappe(COMPOSER.mediasAjouter)}</span>` +
  '</label>' +
  '</li>' +
  '</ul>' +
  `<span class="aide" id="${ID_DE_L_AIDE}">${echappe(COMPOSER.mediasAide)}</span>` +
  (refus === null ? '' : `<p class="alerte" role="alert" id="${ID_DU_REFUS}">${echappe(refus)}</p>`) +
  gabaritDuRetrait() +
  '</div>';

/**
 * LE REPLI SANS JAVASCRIPT DE `mediaAlt` (#5390, revue — défaut 3).
 *
 * `MAX_POST_MEDIA` champs RÉPÉTÉS (`CHAMPS_DU_COMPOSER.mediasAlt`), présents
 * dans CHAQUE chargement du document — c'est ce qui rend le champ utilisable
 * sans script : la porte n'a besoin de savoir NI combien de fichiers seront
 * choisis NI lequel des dix champs porte quel texte, seulement leur ORDRE
 * (voir le doc-comment de `CHAMPS_DU_COMPOSER.mediasAlt`).
 *
 * REPLIÉ PAR DÉFAUT (`<details>`) : dix champs de texte ouverts en
 * permanence sous une grille qui, sans photo choisie, n'en montre AUCUNE
 * serait le bruit que la charte proscrit (dimension 8). Un `<details>` fermé
 * NE RETIRE RIEN du formulaire — son contenu reste soumis, seulement pas
 * PEINT — donc le repli ne coûte rien au critère de fin.
 *
 * AVEC JAVASCRIPT, `previsualiseMedias` OUVRE ce bloc dès qu'un fichier est
 * choisi et REMPLACE le libellé générique du rang occupé
 * (« Photo ou vidéo n°2 ») par le NOM du fichier qui l'occupe
 * (« Décrire « vue.png » ») — jamais un second jeu de champs : LE MÊME nom,
 * `medias-alt`, ne connaît donc jamais qu'un seul producteur, script ou non.
 */
const champDesMediasAlt = (): string =>
  '<details class="medias-alt">' +
  `<summary>${echappe(COMPOSER.mediasAltTitre)}</summary>` +
  `<p class="phrase">${echappe(COMPOSER.mediasAltPhrase)}</p>` +
  Array.from({ length: MAX_POST_MEDIA }, (_valeur, indice) => indice + 1)
    .map(
      (rang) =>
        `<p class="champ" data-rang="${rang}">` +
        `<label for="c-medias-alt-${rang}">${echappe(COMPOSER.mediasAltRang(rang))}</label>` +
        `<input type="text" id="c-medias-alt-${rang}" name="${CHAMPS_DU_COMPOSER.mediasAlt}" maxlength="1000">` +
        '</p>',
    )
    .join('') +
  '</details>';

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
  // `enctype="multipart/form-data"` est INOFFENSIF sur le format `humeur`
  // (aucun `<input type="file">` n'y est rendu) — un seul `<form>`, jamais une
  // jumelle par format.
  '<form method="post" enctype="multipart/form-data">' +
  `<input type="hidden" name="${CHAMP_DU_FORMAT}" value="${etat.format}">` +
  '<section>' +
  (etat.format === 'humeur'
    ? `<h2>${echappe(COMPOSER.humeur)}</h2>` +
      `<p class="phrase">${echappe(COMPOSER.humeurAide)}</p>` +
      grilleDHumeurs(etat.humeur) +
      champDuTexte({ etat, libelle: COMPOSER.humeurTexte, indice: COMPOSER.humeurTextePlaceholder })
    : `<h2>${echappe(COMPOSER.texte)}</h2>` +
      champDuTexte({ etat, libelle: COMPOSER.texte, indice: COMPOSER.textePlaceholder }) +
      champDesMedias(etat.refusDesMedias) +
      champDesMediasAlt()) +
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

/**
 * `data-publie="1"` — le crochet que le module lit pour effacer le brouillon
 * (§ étape 5 de la spécification, RÈGLE 3 réécrite). Le geste réussi est
 * DÉCLARÉ par le document lui-même, jamais par l'événement `submit` : une
 * soumission qui échoue en route (panne réseau) ne porte jamais cet attribut,
 * et le brouillon survit — c'est le sujet de M2/E3.
 */
const attributDePublication = (etat: EtatDuComposer): string => (etat.publie ? ' data-publie="1"' : '');

/**
 * `data-refuse="1"` (#5390) — le SECOND crochet du module, et celui qui a
 * fallu ajouter en découvrant une régression : sans lui, un refus dont le
 * texte reposé est VIDE (une saisie de seuls espaces, nettoyée par
 * `texteDe().trim()`) redonnait la main à la RÈGLE 1 du module (« restaurer
 * un champ vide depuis le brouillon ») — qui réinjectait alors la version
 * NON NETTOYÉE encore en `sessionStorage`, exactement l'inverse de « le
 * serveur a toujours raison ». Ce document EST la réponse d'un `POST` — la
 * porte l'a déjà décidé, refusé ou publié — et ce n'est JAMAIS au module de
 * superposer un brouillon par-dessus une décision serveur, vide ou non.
 */
const attributDeRefus = (etat: EtatDuComposer): string =>
  etat.erreur !== null || etat.refusDesMedias !== null ? ' data-refuse="1"' : '';

export const documentDuComposer = (etat: EtatDuComposer): string =>
  documentPleinEcran({
    titre: `${COMPOSER.titre} — Meeshy`,
    description: COMPOSER.sousTitre,
    corps:
      `<main id="main-content" class="reglages composer"${attributsDuBrouillon(etat)}${attributDePublication(etat)}${attributDeRefus(etat)}>` +
      `${enTete()}${corps(etat)}</main>`,
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_REGLAGES + FEUILLE_DU_COMPOSER,
    script: etat.tempsReel === null ? '' : CHARGEUR_DE_PARTICIPATION,
  });

import { svgDuSprite } from '@/app/actifs-inlines';
import { documentPleinEcran } from '@/app/connecte/fil-vue';
import { echappe } from '@/app/socle';

import { AUDIENCES, CHAMPS_DU_COMPOSER, LONGUEUR_MAX_DU_CONTENU, type Audience } from '@/lib/contenu/composer';
import { nomDeLangue } from '@/lib/contenu/langues';
import { HEURES_DE_VIE_D_UNE_STORY, STORY_NEUVE } from '@/lib/contenu/story-neuve';

import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_COMPOSER } from './composer-feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { FEUILLE_DES_REGLAGES } from './reglages-feuille';

/**
 * `/stories/new` — PUBLIER UNE STORY (#5033, `cible/storyCreate.png`).
 *
 * IL RÉEMPLOIE LES CHAMPS DU COMPOSER, jamais des jumeaux. `CHAMPS_DU_COMPOSER`
 * nomme `texte` et `audience` ici comme là-bas : deux écrans qui postent vers la
 * MÊME route avec deux vocabulaires de formulaire auraient divergé au premier
 * champ ajouté, et le second n'aurait été trouvé qu'en production.
 *
 * LES DEUX LIGNES DU BAS NE SONT PAS DE MÊME NATURE, et l'écran le montre :
 * l'audience est un `<select>` (elle mute la charge), l'expiration une PHRASE
 * (aucune capacité serveur). Les dessiner pareil ferait croire qu'on peut
 * changer les deux.
 */

export const ADRESSE_DE_LA_STORY_NEUVE = '/stories/new';

export type EtatDeLaStoryNeuve = {
  readonly texte: string;
  readonly audience: Audience;
  /** La langue que la story REVENDIQUERA, ou `null` — la passerelle devinera. */
  readonly langue: string | null;
  readonly publie: boolean;
  readonly erreur: string | null;
};

const enTete = (): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/composer" aria-label="${echappe(STORY_NEUVE.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(STORY_NEUVE.titre)}</h1>` +
  `<p class="sous">${echappe(STORY_NEUVE.sousTitre)}</p>` +
  '</div>' +
  '</header>';

const champDuTexte = (texte: string): string =>
  '<p class="champ">' +
  `<label for="s-texte">${echappe(STORY_NEUVE.texte)}</label>` +
  `<textarea id="s-texte" name="${CHAMPS_DU_COMPOSER.texte}" rows="6" maxlength="${LONGUEUR_MAX_DU_CONTENU}" ` +
  `placeholder="${echappe(STORY_NEUVE.textePlaceholder)}" autocomplete="off">${echappe(texte)}</textarea>` +
  `<span class="aide">${echappe(STORY_NEUVE.sansMedia)}</span>` +
  '</p>';

const champDeLAudience = (courante: Audience): string =>
  '<p class="champ">' +
  `<label for="s-audience">${echappe(STORY_NEUVE.audience)}</label>` +
  `<select id="s-audience" name="${CHAMPS_DU_COMPOSER.audience}">` +
  AUDIENCES.map(
    ({ valeur, libelle }) =>
      `<option value="${valeur}"${valeur === courante ? ' selected' : ''}>${echappe(libelle)}</option>`,
  ).join('') +
  '</select>' +
  `<span class="aide">${echappe(AUDIENCES.find((a) => a.valeur === courante)?.phrase ?? '')}</span>` +
  '</p>';

/**
 * L'EXPIRATION EST UNE PHRASE, PAS UN CHAMP — et la phrase DIT pourquoi. Sans
 * la seconde moitié (« cette durée est fixée par le service ; elle ne se règle
 * pas »), un lecteur cherche le réglage et conclut que l'écran est incomplet.
 * La valeur, elle, vient du gateway, jamais du « 24 h » de la cible.
 */
const ligneDExpiration = (): string =>
  '<p class="phrase">' +
  svgDuSprite('ph-clock') +
  ' ' +
  echappe(
    `${STORY_NEUVE.expiration} ${STORY_NEUVE.expirationValeur(HEURES_DE_VIE_D_UNE_STORY)} — ` +
      STORY_NEUVE.expirationPhrase(HEURES_DE_VIE_D_UNE_STORY),
  ) +
  '</p>';

const ligneDeLangue = (langue: string | null): string =>
  langue === null
    ? ''
    : `<p class="phrase">${svgDuSprite('ph-translate')} ${echappe(`${STORY_NEUVE.langue} : ${nomDeLangue(langue)}`)}</p>`;

export const documentDeLaStoryNeuve = (etat: EtatDeLaStoryNeuve): string =>
  documentPleinEcran({
    titre: `${STORY_NEUVE.titre} — Meeshy`,
    description: STORY_NEUVE.sousTitre,
    corps:
      '<main id="main-content" class="reglages composer">' +
      enTete() +
      (etat.publie
        ? `<p class="avis" role="status">${echappe(STORY_NEUVE.publie)} <a href="/feed">${echappe(STORY_NEUVE.publieVoir)}</a></p>`
        : '') +
      (etat.erreur === null
        ? ''
        : `<p class="alerte" role="alert"><b>${echappe(STORY_NEUVE.refuse)}</b> ${echappe(etat.erreur)}</p>`) +
      '<form method="post">' +
      `<section><h2>${echappe(STORY_NEUVE.texte)}</h2>${champDuTexte(etat.texte)}</section>` +
      '<section>' +
      `<h2>${echappe(STORY_NEUVE.audience)}</h2>` +
      champDeLAudience(etat.audience) +
      ligneDeLangue(etat.langue) +
      ligneDExpiration() +
      '</section>' +
      `<button type="submit" class="action primaire publier">${echappe(STORY_NEUVE.publier)}</button>` +
      '</form>' +
      '</main>',
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_REGLAGES + FEUILLE_DU_COMPOSER,
  });

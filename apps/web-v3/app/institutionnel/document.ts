import { echappe } from '@/app/socle';

import { documentDuSite, lienDeChrome, rendLePage } from '@/app/enveloppe/vue';
import type { Lien } from '@/app/enveloppe/contenu';

import { FEUILLE_INSTITUTIONNELLE } from './feuille';

/**
 * LE MODÈLE DES CINQ PAGES INSTITUTIONNELLES — `/about`, `/contact`,
 * `/partners`, `/terms`, `/privacy` — et son composeur UNIQUE.
 *
 * POURQUOI UN MODÈLE PLUTÔT QUE CINQ VUES
 *
 * Les cinq pages disent la même chose de cinq façons : un titre, parfois une
 * date de mise à jour, des sections, et une rangée de liens vers les quatre
 * autres. Cinq compositeurs seraient cinq jumelles — et la divergence ne se
 * verrait pas au diff, mais des semaines plus tard, quand `/terms` porterait un
 * niveau de titre que `/privacy` n'aurait pas suivi. Le modèle rend la
 * cohérence STRUCTURELLE : une page ne peut plus se dessiner autrement, parce
 * qu'elle ne se dessine plus du tout — elle se DÉCLARE.
 *
 * LE BLOC EST UN TYPE SOMME, et chacun de ses cinq genres a été trouvé dans le
 * contenu, jamais deviné :
 *
 *   • `paragraphes` — le corps courant (presque toutes les sections de `/terms`) ;
 *   • `liste`       — une énumération de phrases (`usage.prohibited`,
 *                     `rights.list`, `whatIsMeeshy.keyPoints`) ;
 *   • `cartes`      — un titre + un corps, ou un titre + des items
 *                     (`whyServerSide.reasons`, `dataCollection.*`,
 *                     `useCases.*`) ;
 *   • `accent`      — la phrase que le legacy MET EN AVANT et qui n'est pas une
 *                     section (`linguisticDiversity.why`,
 *                     `sharing.thirdParty`, `account.anonymousEncryption`) ;
 *   • `encadre`     — des coordonnées, dont certaines sont ACTIONNABLES
 *                     (l'adresse postale, l'e-mail).
 *
 * Un genre de plus se paie d'un cas dans le `switch` ci-dessous, et c'est
 * voulu : le compilateur refuse un genre non rendu, donc personne ne peut
 * déclarer un bloc qui ne s'afficherait pas.
 *
 * LE CONTENU EST CELUI DU LEGACY, mot pour mot — `apps/web/locales/fr/` —,
 * comme pour la vitrine, et pour la même raison : la directive du porteur
 * (2026-09-01) demande d'intégrer les pages EXISTANTES, pas d'en écrire de
 * nouvelles. Ce qui a changé, page par page, est dit dans chaque `contenu.ts`.
 */

export type Carte = {
  readonly titre: string;
  readonly corps?: string;
  /** La ligne qui QUALIFIE la carte — un tarif, une durée. Rendue en capitales espacées. */
  readonly mention?: string;
  readonly items?: readonly string[];
};

/**
 * Une ligne d'encadré. `href` la rend ACTIONNABLE : une adresse e-mail qu'on ne
 * peut pas ouvrir d'un geste est une adresse qu'il faut recopier à la main —
 * la dimension 7 compte les gestes du chemin nominal, et le legacy en demandait
 * deux de trop.
 */
export type LigneEncadree = {
  readonly texte: string;
  readonly href?: string;
};

export type Bloc =
  | { readonly genre: 'paragraphes'; readonly corps: readonly string[] }
  | { readonly genre: 'liste'; readonly items: readonly string[] }
  | { readonly genre: 'cartes'; readonly cartes: readonly Carte[] }
  | { readonly genre: 'accent'; readonly corps: string }
  | { readonly genre: 'encadre'; readonly lignes: readonly LigneEncadree[] };

export type Section = {
  readonly titre: string;
  readonly blocs: readonly Bloc[];
};

export type PageDeContenu = {
  readonly titre: string;
  /**
   * FACULTATIVE, et son absence est un CONTENU absent, pas un oubli de mise en
   * page : `/privacy` n'a pas de sous-titre au catalogue, et lui en fabriquer
   * un en reprenant sa première section faisait lire deux fois le même
   * paragraphe, l'un sous l'autre. Gardé par « aucune page ne répète son
   * accroche en section ».
   */
  readonly accroche?: string;
  /** « Dernière mise à jour : … » — les deux pages légales seules la portent. */
  readonly mention?: string;
  readonly description: string;
  readonly sections: readonly Section[];
  /**
   * La rangée de suite EST une section — titre, corps facultatif, puis des
   * liens. Son `accroche` existe parce que `/partners` termine sur « Devenir
   * Partenaire », un titre qu'elle portait DÉJÀ : la page l'affichait deux fois
   * de suite, une fois au-dessus du paragraphe, une fois au-dessus des boutons.
   * Le paragraphe entre donc ici plutôt que dans une section jumelle.
   */
  readonly suite: {
    readonly titre: string;
    readonly accroche?: string;
    readonly liens: readonly Lien[];
  };
};

const paragraphe = (texte: string): string => `<p>${echappe(texte)}</p>`;

const puce = (texte: string): string => `<li>${echappe(texte)}</li>`;

const carte = ({ titre, corps, mention, items }: Carte): string =>
  '<li>' +
  `<h3>${echappe(titre)}</h3>` +
  (corps === undefined ? '' : `<p>${echappe(corps)}</p>`) +
  (items === undefined ? '' : `<ul>${items.map(puce).join('')}</ul>`) +
  (mention === undefined ? '' : `<p class="mention">${echappe(mention)}</p>`) +
  '</li>';

const ligneEncadree = ({ texte, href }: LigneEncadree): string =>
  href === undefined
    ? `<li>${echappe(texte)}</li>`
    : `<li><a href="${echappe(href)}">${echappe(texte)}</a></li>`;

/**
 * Le `switch` est EXHAUSTIF et sans `default` : c'est ce qui fait qu'un
 * sixième genre ajouté au type somme ne compile pas tant qu'il n'est pas rendu.
 * Un `default` qui rendrait la chaîne vide transformerait cette erreur de
 * compilation en un bloc SILENCIEUSEMENT absent de la page.
 */
const rendLeBloc = (bloc: Bloc): string => {
  switch (bloc.genre) {
    case 'paragraphes':
      return bloc.corps.map(paragraphe).join('');
    case 'liste':
      return `<ul class="puces">${bloc.items.map(puce).join('')}</ul>`;
    case 'cartes':
      return `<ul class="cartes">${bloc.cartes.map(carte).join('')}</ul>`;
    case 'accent':
      return `<p class="accent">${echappe(bloc.corps)}</p>`;
    case 'encadre':
      return `<ul class="encadre">${bloc.lignes.map(ligneEncadree).join('')}</ul>`;
  }
};

const identifiant = (rang: number): string => `section-${rang}`;

const rendLaSection = (section: Section, rang: number): string =>
  `<section aria-labelledby="${identifiant(rang)}">` +
  `<h2 id="${identifiant(rang)}">${echappe(section.titre)}</h2>` +
  section.blocs.map(rendLeBloc).join('') +
  '</section>';

const corpsDeLaPage = (page: PageDeContenu): string =>
  '<div class="entete">' +
  `<h1>${echappe(page.titre)}</h1>` +
  (page.accroche === undefined ? '' : `<p class="accroche">${echappe(page.accroche)}</p>`) +
  (page.mention === undefined ? '' : `<p class="mention">${echappe(page.mention)}</p>`) +
  '</div>' +
  page.sections.map(rendLaSection).join('') +
  '<section class="suite" aria-labelledby="suite">' +
  `<h2 id="suite">${echappe(page.suite.titre)}</h2>` +
  (page.suite.accroche === undefined ? '' : `<p>${echappe(page.suite.accroche)}</p>`) +
  `<nav>${page.suite.liens.map(lienDeChrome).join('')}</nav>` +
  '</section>';

export const documentDeLaPage = (page: PageDeContenu): string =>
  documentDuSite({
    titre: `${page.titre} — Meeshy`,
    description: page.description,
    feuille: FEUILLE_INSTITUTIONNELLE,
    corps: corpsDeLaPage(page),
    retour: true,
  });

/**
 * LE GESTIONNAIRE, écrit UNE fois. Les cinq `route.ts` ne portent qu'un
 * `export const GET = gestionnaireDe(PAGE_…)` : cinq corps de fonction
 * identiques seraient cinq occasions d'oublier un en-tête.
 */
export const gestionnaireDe =
  (page: PageDeContenu) =>
  (): Response =>
    rendLePage(documentDeLaPage(page));

/**
 * LE TYPE DU CONTENU INSTITUTIONNEL.
 *
 * Repris tel quel de `apps/web-old-version3/app/institutionnel/document.ts` — avec les
 * cinq `contenu.ts` qui l'habitent. C'est le seul travail de l'ancienne refonte
 * qui se transporte sans réécriture, et pour une bonne raison : ce sont des
 * DONNÉES, pas du rendu. Le contenu lui-même vient du legacy mot pour mot
 * (`apps/web/locales/fr/`), parce qu'un texte juridique qui change en passant
 * d'une application à l'autre est un incident, pas une refonte.
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
 * peut pas ouvrir d'un geste est une adresse qu'il faut recopier à la main.
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

/** Un lien nommé — la forme du chrome, reprise telle quelle. */
export type Lien = {
  readonly libelle: string;
  readonly href: string;
};

/**
 * La rangée de suite EST une section — titre, accroche facultative, puis des
 * liens. Son `accroche` existe parce que `/partners` termine sur « Devenir
 * Partenaire », un titre qu'elle portait DÉJÀ : la page l'affichait deux fois
 * de suite, une fois au-dessus du paragraphe, une fois au-dessus des boutons.
 */
export type RangeeDeSuite = {
  readonly titre: string;
  readonly accroche?: string;
  readonly liens: readonly Lien[];
};

export type PageDeContenu = {
  readonly titre: string;
  /**
   * FACULTATIVE, et son absence est un CONTENU absent, pas un oubli de mise en
   * page : `/privacy` n'en a pas au catalogue, et lui en fabriquer une en
   * reprenant sa première section faisait lire deux fois le même paragraphe.
   */
  readonly accroche?: string;
  /** « Dernière mise à jour : … » — les deux pages légales seules la portent. */
  readonly mention?: string;
  readonly description: string;
  readonly sections: readonly Section[];
  readonly suite: RangeeDeSuite;
};

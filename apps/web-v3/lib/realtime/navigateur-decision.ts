/**
 * LE NAVIGATEUR DE ZONE — la DÉCISION, pure (#5106).
 *
 * Deux questions, aucune touche au DOM vivant :
 *  - `decideLInterception` : ce clic devient-il une navigation DOUCE (fetch +
 *    swap) ou reste-t-il une navigation RÉELLE ? C'est le jumeau RUNTIME du
 *    lint `zone/lien-sortant-en-navigation-client` : tout ce qui sort de la
 *    liste navigable — autre origine, autre zone, geste d'ouverture (cible,
 *    téléchargement, clic du milieu, modificateur) — navigue réellement.
 *    L'ancre locale (`#…`) aussi : le navigateur natif la sert sans un octet.
 *  - `extraitLEchange` : que remet le document cible au swap ? Titre, feuille
 *    de tête, `<main>` et son module. Un document SANS `<main>` rend `null` —
 *    le swap REFUSE et la navigation réelle reprend : mieux vaut un
 *    rechargement qu'un écran composé à moitié.
 *
 * LA SURIMPRESSION REFUSE L'ÉCHANGE. `documentDuSite` rend la surimpression —
 * l'espace membre, le panneau de profil, la création d'une conversation, le
 * plein écran d'un média — HORS de `<main>`, juste avant `.enveloppe`
 * (`app/enveloppe/vue.ts:198`), pour que `Échap` la ferme sans un octet de
 * JavaScript et que le reste de l'écran soit `inert`. Un échange qui ne porte
 * que `<main>` ne peut donc ni l'OUVRIR (`/chats` → `/chats?espace` changeait
 * l'adresse sans jamais montrer le dialogue — le contrôle restait INERTE) ni
 * la REFERMER (le dialogue de l'écran quitté serait resté par-dessus le neuf,
 * en piège à focus). C'est exactement le cas que la doctrine du module nomme
 * déjà : « mieux vaut un rechargement qu'un écran composé à moitié ».
 *
 * `estNavigable` est SEGMENT-aware, comme `belongsToV3Zone` et comme le
 * travailleur de zone : `/chats` couvre `/chats` et `/chats/…`, jamais
 * `/chatsfoo` ; `/chat/` (barre finale) couvre son arbre seul.
 */

export type LienClique = {
  readonly href: string;
  readonly target: string;
  readonly telechargement: boolean;
  readonly bouton: number;
  readonly modificateur: boolean;
};

export type CadreDeNavigation = {
  readonly origine: string;
  readonly navigable: readonly string[];
};

export type Echange = {
  readonly titre: string;
  readonly feuille: string;
  readonly mainHtml: string;
  readonly module: string | null;
};

export const estNavigable = (pathname: string, navigable: readonly string[]): boolean =>
  navigable.some((prefixe) =>
    prefixe.endsWith('/')
      ? pathname.startsWith(prefixe)
      : pathname === prefixe || pathname.startsWith(`${prefixe}/`),
  );

export const decideLInterception = (
  lien: LienClique,
  cadre: CadreDeNavigation,
): 'douce' | 'reelle' => {
  if (lien.bouton !== 0 || lien.modificateur || lien.telechargement) return 'reelle';
  if (lien.target !== '' && lien.target !== '_self') return 'reelle';
  const url = new URL(lien.href, cadre.origine);
  if (url.origin !== cadre.origine) return 'reelle';
  if (url.hash !== '') return 'reelle';
  return estNavigable(url.pathname, cadre.navigable) ? 'douce' : 'reelle';
};

/**
 * Le document porte-t-il une surimpression ? Un `<dialog>` enfant DIRECT de
 * `<body>` est la forme UNIQUE que `documentDuSite` lui donne — les quatre
 * producteurs du dépôt l'écrivent ainsi (`espace-vue.ts:95`,
 * `profil-vue.ts:347`, `plein-vue.ts:168`, `liste-vue.ts:386`).
 */
export const porteUneSurimpression = (racine: Document): boolean =>
  racine.querySelector('body > dialog') !== null;

export const extraitLEchange = (documentTexte: string): Echange | null => {
  const cible = new DOMParser().parseFromString(documentTexte, 'text/html');
  const main = cible.querySelector('main');
  if (main === null) return null;
  if (porteUneSurimpression(cible)) return null;
  // Le module est BORNÉ à la zone du temps réel : un `data-module` qui ne
  // vivrait pas sous `/__v3/rt/` — une origine étrangère, un chemin voisin —
  // n'atteint jamais `import()`. Le document vient de notre propre serveur,
  // mais une charge importée s'exécute : la ceinture ne coûte qu'un préfixe.
  const moduleDeclare = main.getAttribute('data-module');
  return {
    titre: cible.title,
    feuille: cible.head.querySelector('style')?.textContent ?? '',
    mainHtml: main.outerHTML,
    module: moduleDeclare !== null && moduleDeclare.startsWith('/__v3/rt/') ? moduleDeclare : null,
  };
};

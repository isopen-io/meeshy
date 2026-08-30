/**
 * Le NOM d'une route, unique pour toute la machine de verification.
 *
 * Deux mesures parlent des memes ecrans dans deux langues : le budget de
 * bundle lit `app-build-manifest.json`, dont les cles sont des chemins INTERNES
 * (`/(public)/stories/[id]/page`) ; la mesure de poids reseau lit des URLs
 * PUBLIQUES (`/stories/abc`). Les faire se rencontrer dans deux tables de
 * plafonds serait la jumelle classique : deux verites pour un meme ecran, qui
 * divergent au premier renommage.
 *
 * Ce fichier pose donc UN espace de noms — le chemin public parametre
 * (`/stories/:id`) — et les deux traductions qui y menent. `budgets.json` est
 * ecrit dans cet espace-la, et lui seul.
 *
 * Le NOM d'un parametre n'appartient PAS a cet espace. `/chats/:lien`,
 * `/chats/:identifiant` et `/chats/:id` sont TROIS lignes de la matrice et UNE
 * seule URL : le serveur ne voit qu'un segment. Les laisser cohabiter comme
 * trois cles de budget mettrait trois plafonds sur la meme page, et seul
 * l'ordre des cles JSON dirait lequel s'applique. `normaliserMotif()` efface
 * donc le nom du parametre, et `budgetDeChemin()` REFUSE de trancher quand
 * deux motifs attrapent le meme chemin — un plafond ambigu ne se discute pas
 * en revue, il se corrige dans le fichier.
 */

const FICHIERS_DE_ROUTE = new Set([
  'page',
  'route',
  'layout',
  'default',
  'loading',
  'error',
  'not-found',
  'template',
]);

const estGroupe = (segment) => /^\(.+\)$/.test(segment);
const estEmplacement = (segment) => segment.startsWith('@');

/**
 * Le groupe de routes d'une entree du manifeste : `(public)`, `(connected)`,
 * ou `(racine)` pour ce qui ne vit dans aucun groupe. C'est l'unite du budget
 * cumulatif du § 8.4.
 */
export function groupeDe(entree) {
  const groupe = entree.split('/').find(estGroupe);
  return groupe ?? '(racine)';
}

/**
 * Le chemin public d'une entree du manifeste. Les groupes et les emplacements
 * paralleles disparaissent (Next ne les sert pas), le fichier de route aussi,
 * et les segments dynamiques prennent la forme `:nom` — celle qu'un humain
 * ecrit dans un budget et celle que la conception ecrit dans son § 8.3.
 */
export function cheminPublic(entree) {
  const segments = entree.split('/').filter(Boolean);
  const dernier = segments[segments.length - 1];
  const sansFichier =
    dernier !== undefined && FICHIERS_DE_ROUTE.has(dernier) ? segments.slice(0, -1) : segments;

  const publics = sansFichier
    .filter((s) => !estGroupe(s) && !estEmplacement(s))
    .map((s) => {
      const optionnel = /^\[\[\.\.\.(.+)\]\]$/.exec(s);
      if (optionnel) return `:${optionnel[1]}*?`;
      const reste = /^\[\.\.\.(.+)\]$/.exec(s);
      if (reste) return `:${reste[1]}*`;
      const dynamique = /^\[(.+)\]$/.exec(s);
      return dynamique ? `:${dynamique[1]}` : s;
    });

  return publics.length ? `/${publics.join('/')}` : '/';
}

const echappe = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Le motif `/stories/:id` en expression reguliere ancree. */
export function motifEnRegex(motif) {
  const corps = motif
    .split('/')
    .filter(Boolean)
    .map((s) => {
      if (/^:.+\*\?$/.test(s)) return '(?:/.*)?';
      if (/^:.+\*$/.test(s)) return '/.*';
      if (s.startsWith(':')) return '/[^/]+';
      return `/${echappe(s)}`;
    })
    .join('');

  return new RegExp(`^${corps || '/'}/?$`);
}

/**
 * Le plafond qui s'applique a une route : celui qui la NOMME s'il existe,
 * sinon celui de son groupe. La source est rendue avec le chiffre — un plafond
 * dont on ignore d'ou il vient ne se discute pas en revue.
 */
export function plafondDe({ budgets, route, groupe }) {
  /**
   * La correspondance se fait sur la forme CANONIQUE, pas sur la chaine. Le
   * budget de bundle nomme la route d'apres le REPERTOIRE du build
   * (`chats/[key]` ⇒ `/chats/:key`) ; `budgets.json` la nomme d'apres la
   * matrice (`/chats/:lien`). Un match exact les manquait, et la route
   * retombait EN SILENCE sur le plafond de son groupe — un plafond plus large
   * que le sien, sans que rien ne rougisse. Le nom d'un parametre ne fait pas
   * partie de l'espace de noms (voir le doc-comment de tete).
   */
  const canonique = normaliserMotif(route);
  const [, parRoute] =
    Object.entries(budgets.routes ?? {}).find(([motif]) => normaliserMotif(motif) === canonique) ??
    [];
  if (parRoute && typeof parRoute.ecran === 'number') {
    return { plafond: parRoute.ecran, source: 'route', statut: parRoute.statut ?? 'CIBLE' };
  }

  const parGroupe = budgets.groupes?.[groupe];
  if (parGroupe && typeof parGroupe.ecran === 'number') {
    return { plafond: parGroupe.ecran, source: 'groupe', statut: parGroupe.statut ?? 'CIBLE' };
  }

  return { plafond: null, source: 'aucune', statut: 'ABSENT' };
}

/**
 * La forme CANONIQUE d'un motif de route : sans chaine de requete (elle ne
 * change pas la page servie) et sans nom de parametre. C'est dans cet espace
 * que la matrice et `budgets.json` se croisent.
 */
export function normaliserMotif(motif) {
  const sansQuery = motif.split('?')[0] ?? motif;
  const corps = sansQuery
    .split('/')
    .filter(Boolean)
    .map((s) => {
      if (/^:.+\*\?$/.test(s)) return ':*?';
      if (/^:.+\*$/.test(s)) return ':*';
      return s.startsWith(':') ? ':' : s;
    });
  return corps.length ? `/${corps.join('/')}` : '/';
}

/**
 * La ligne de budget qui gouverne une URL servie. C'est le chemin d'URL, et
 * lui seul, qui decide : une mesure faite sur `https://meeshy.me/l/abc` et une
 * autre sur `http://127.0.0.1:3300/l/abc` tombent sur le meme plafond.
 *
 * Deux retours qui ne sont PAS la meme chose, et que le consommateur doit
 * distinguer : `null` — aucune ligne ne couvre ce chemin, donc aucun plafond
 * ne le juge ; `{ ambigu: [...] }` — plusieurs lignes le couvrent, donc le
 * fichier de budgets se contredit.
 */
export function budgetDeChemin({ budgets, chemin }) {
  const nommees = Object.entries(budgets.routes ?? {}).map(([motif, budget]) => ({
    motif,
    budget,
    herite: false,
  }));
  const heritees = Object.entries(budgets.heritage_de_groupe ?? {})
    .filter(([groupe]) => !groupe.startsWith('_'))
    .flatMap(([groupe, motifs]) =>
      (motifs ?? []).map((motif) => ({ motif, budget: { groupe }, herite: true })),
    );

  const candidates = [...nommees, ...heritees].filter((c) => motifEnRegex(c.motif).test(chemin));
  if (candidates.length === 0) return null;

  /**
   * Le plus SPECIFIQUE gagne : `/stories/new` (deux segments litteraux) prime
   * sur `/stories/:id` (un seul). Sans cette regle, l'ecran de creation d'une
   * story tomberait sur le plafond de la LECTURE partagee — un plafond qui
   * n'est pas le sien, applique sans que rien ne rougisse. L'ambiguite ne
   * subsiste qu'entre motifs de MEME specificite : la, deux lignes disent deux
   * choses du meme chemin, et c'est le fichier qui doit trancher, pas l'ordre
   * des cles JSON.
   */
  const specificite = (motif) => motif.split('/').filter((s) => s && !s.startsWith(':')).length;
  const meilleure = Math.max(...candidates.map((c) => specificite(c.motif)));
  const retenues = candidates.filter((c) => specificite(c.motif) === meilleure);

  const [premiere] = retenues;
  return retenues.length > 1
    ? { ...premiere, ambigu: retenues.map((c) => c.motif) }
    : premiere;
}

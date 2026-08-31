// QUELLES VUES CIBLES UN OUTIL DE CONFORMITÉ A LE DROIT DE COMPARER [L-0.5].
//
// `vues.json` porte 37 vues, dont QUATORZE ont une route paramétrée
// (`/l/:token`, `/chats/:lien`, `/login?next=/l/:token`…). Un `:` n'est pas une
// URL : le validateur de jeton de la route publique (`^[a-zA-Z0-9_-]{2,50}$`,
// § 5.1) le refuse, donc naviguer vers `/l/:token` sert l'écran clos — le même
// pour TOUTES ces vues. Comparer une capture à cet écran-là ne mesure rien, et
// rend pourtant un chiffre : `structure=0.42` contre un seuil de `0.15`, sur un
// code par ailleurs conforme. Un gate qui compare la mauvaise capture est PIRE
// qu'un gate absent — il refuse un code juste.
//
// La loi tient en une phrase : un outil n'honore que les arguments qu'il sait
// honorer, et REFUSE les autres en les nommant. D'où trois refus, jamais un
// repli silencieux :
//
//   1. la vue demandée n'est dans aucune ligne de `vues.json` ;
//   2. sa route porte un jeton que la vue ne DÉCLARE pas ;
//   3. deux vues demandées visent, jetons substitués, le MÊME écran servi —
//      une seule navigation ne peut pas rendre deux écrans différents, donc
//      `linkRedirect` et `linkExpired`, qui partagent `/l/:token`, ont besoin
//      d'un ÉTAT (un jeton vivant, un jeton expiré) et pas seulement d'un jeton.
//
// Et le refus a son PROPRE code de sortie : « je n'ai pas su mesurer » n'est pas
// « j'ai mesuré et c'est hors cible ». Les confondre ferait d'un outil muet un
// outil accusateur.
//
// Ce module ne touche NI au disque NI à `import.meta` — même raison que
// `routes-emises.mjs` : il doit rester chargeable par un harnais CommonJS.

export const RC_CONFORME = 0;
export const RC_HORS_CIBLE = 1;
export const RC_ECHEC = 2;
export const RC_NON_COMPARABLE = 3;

// Un jeton se lit partout dans la route — `/login?next=/l/:token` en porte un
// dans sa chaîne de requête, et l'y manquer rendrait la vue `login` « servable
// telle quelle » alors qu'elle ne l'est pas.
const motifJeton = () => /:([A-Za-z_][A-Za-z0-9_]*)/g;

export const jetonsDeRoute = (route) => [...route.matchAll(motifJeton())].map(([, nom]) => nom);

export const estRouteParametree = (route) => jetonsDeRoute(route).length > 0;

export const cheminDeVue = (vue) => {
  const declares = vue.jetons ?? {};
  const manquants = jetonsDeRoute(vue.route).filter(
    (nom) => typeof declares[nom] !== 'string' || declares[nom] === '',
  );
  if (manquants.length > 0) {
    return {
      ok: false,
      manquants,
      raison:
        `route paramétrée : la vue « ${vue.id} » (${vue.route}) ne déclare aucune valeur pour ` +
        `${manquants.map((nom) => `« :${nom} »`).join(', ')} — naviguer vers la route telle quelle ` +
        `sert l'écran clos, jamais cette vue`,
    };
  }
  return { ok: true, chemin: vue.route.replace(motifJeton(), (_, nom) => declares[nom]) };
};

const collisions = (retenues) => {
  const parChemin = new Map();
  retenues.forEach((r) => parChemin.set(r.chemin, [...(parChemin.get(r.chemin) ?? []), r]));
  return [...parChemin.entries()].filter(([, groupe]) => groupe.length > 1);
};

export const selectionComparable = ({ vues, demandees }) => {
  const cible = demandees.length > 0 ? demandees : null;

  const inconnues = cible ? cible.filter((id) => !vues.some((v) => v.id === id)) : [];
  const choisies = cible
    ? vues.filter((v) => cible.includes(v.id))
    : vues.filter((v) => !estRouteParametree(v.route));
  const ignorees = cible ? [] : vues.filter((v) => estRouteParametree(v.route)).map((v) => v.id);

  const resolues = choisies.map((v) => ({ vue: v, resolution: cheminDeVue(v) }));
  const retenues = resolues
    .filter((r) => r.resolution.ok)
    .map((r) => ({ id: r.vue.id, route: r.vue.route, chemin: r.resolution.chemin }));

  const partagees = collisions(retenues);
  const enCollision = new Set(partagees.flatMap(([, groupe]) => groupe.map((r) => r.id)));

  return {
    comparables: retenues.filter((r) => !enCollision.has(r.id)),
    ignorees,
    refus: [
      ...inconnues.map((id) => ({
        id,
        raison: `vue inconnue : « ${id} » n'est dans aucune ligne de vues.json`,
      })),
      ...resolues
        .filter((r) => !r.resolution.ok)
        .map((r) => ({ id: r.vue.id, raison: r.resolution.raison })),
      ...partagees.flatMap(([chemin, groupe]) =>
        groupe.map((r) => ({
          id: r.id,
          raison:
            `route partagée : ${groupe.map((g) => `« ${g.id} »`).join(' et ')} visent le même ` +
            `écran servi (${chemin}) — une seule navigation ne peut pas rendre deux écrans ` +
            `différents, déclarer un jeton distinct par vue`,
        })),
      ),
    ],
  };
};

// LE VERDICT NE PEUT PAS ÊTRE VERT SANS AVOIR MESURÉ. Un refus le dit et sort
// non nul ; une sélection VIDE aussi — « 0/0 conformes » serait le verdict le
// plus cher du dépôt, vert sans avoir regardé un seul écran.
export const refusDeSelection = ({ comparables, refus }) => {
  if (refus.length > 0) {
    return { rc: RC_NON_COMPARABLE, messages: refus.map((r) => `${r.id} — ${r.raison}`) };
  }
  if (comparables.length === 0) {
    return {
      rc: RC_NON_COMPARABLE,
      messages: [
        "aucune vue à comparer : les routes paramétrées sont écartées sans --vues, et aucune " +
          'vue servable telle quelle ne reste — rien n\'a été mesuré',
      ],
    };
  }
  return null;
};

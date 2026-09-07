// CE QUE `next build` A ÉMIS, ET À QUEL GROUPE CHAQUE ENTRÉE APPARTIENT [L-0.5].
//
// Lire `app-build-manifest.json`, distinguer une PAGE d'un gestionnaire de route ou d'une entrée
// annexe, et reconnaître le groupe de routes d'une clé de manifeste : trois questions que
// `check-bundle-budget.mjs` posait pour MESURER un poids, et que le gate axe du § 8.5 pose pour
// savoir QUELLES routes il doit balayer. La réponse est la même — c'est la déclaration de
// `budgets.json` — et elle vit donc ici, à côté de la loi de motif qu'elle applique.
//
// Ce module ne touche NI au disque NI à `import.meta` : il reste chargeable par un harnais qui
// transpile ses entrées en CommonJS (Playwright), ce que `check-bundle-budget.mjs` — un
// exécutable, avec son `main` et son `fileURLToPath(import.meta.url)` — ne peut pas être.

import { plusPrecis } from './motifs.mjs';

// Les segments qu'App Router émet dans le manifeste sans qu'un navigateur puisse les demander.
// `/layout` porte les chunks du SOCLE ; `/not-found` est le composant, pas la limite `/_not-found`.
const SEGMENTS_ANNEXES = new Set([
  'layout',
  'not-found',
  'error',
  'global-error',
  'loading',
  'template',
  'default',
  'forbidden',
  'unauthorized',
]);

export const natureDeRoute = (route) => {
  const dernier = route.slice(route.lastIndexOf('/') + 1);
  if (dernier === 'route') return 'gestionnaire';
  if (dernier === 'page') return 'page';
  if (SEGMENTS_ANNEXES.has(dernier)) return 'annexe';
  return 'inconnue';
};

export const estGestionnaireDeRoute = (route) => natureDeRoute(route) === 'gestionnaire';

export const normaliseRoute = (route) => route.replace(/\/\([^)]+\)/g, '') || '/';

export const lireEntrees = (manifestSource) => {
  const pages = JSON.parse(manifestSource)?.pages;
  if (!pages || typeof pages !== 'object') return [];
  return Object.entries(pages).map(([route, chunks]) => ({
    route,
    chunks: Array.isArray(chunks) ? chunks : [],
  }));
};

// Un motif s'écrit contre l'URL — la forme qu'un humain reconnaît. Un motif qui porte lui-même un
// segment `(…)` s'écrit, lui, contre la clé BRUTE du manifeste : c'est la seule façon de
// distinguer `(public)/page` de `(connected)/page`, que la normalisation confond en `/page`.
const cibleDe = (route) => (motif) => (motif.includes('(') ? route : normaliseRoute(route));

export const groupeDe = (route, groupes) => {
  const { choix, ambigu } = plusPrecis(groupes, cibleDe(route));
  return { groupe: choix ? choix.id : null, ambigu: ambigu.map((g) => g.id) };
};

export const plafondDeRoute = (route, routes) => plusPrecis(routes ?? [], cibleDe(route)).choix;

// LE BUDGET RÉSEAU D'UNE VUE DE `compare-rendu.js`, LU DEPUIS `budgets.json` —
// JAMAIS UNE REGEX LOCALE [#5473].
//
// `compare-rendu.js` choisissait le budget réseau (octets transférés + nombre
// de requêtes) d'une vue avec une regex écrite à la main
// (`/^\/(l\/|stories\/|post\/|feed$)/`), indépendante de la déclaration de
// zone que `budgets.json` porte déjà (`groupes[].motifs`, groupe `(public)` =
// « rôle premier » — lecture partagée et jonction anonyme, sans compte).
// Mesuré : elle ne reconnaissait pas `/posts/*`, `/reels/*`, `/moods/*`,
// `/chat/*`, `/login/*`, `/signup/*` (budget « défaut », plus laxiste) ;
// reconnaissait À TORT `/feed`, qui vit dans le groupe `(connected)` ;
// reconnaissait `/post/*` mais pas `/posts/*` — un artefact de la regex, pas
// une décision.
//
// `groupeDe` (`routes-emises.mjs`) applique déjà la loi de motif de
// `motifs.mjs` contre `budgets.json` pour classer une clé de manifeste
// `next build` ; elle classe tout aussi bien un CHEMIN d'URL — ni l'un ni
// l'autre ne porte de segment `(groupe)` à distinguer au moment où ce module
// l'appelle. Seul le CHEMIN compte : une route de vue peut porter une chaîne
// de requête (`/login?returnUrl=/chat/:lien`), que les motifs de
// `budgets.json` ne savent pas lire (aucun d'eux ne porte de `?`).
import { groupeDe } from './routes-emises.mjs';

export const GROUPE_ROLE_PREMIER = '(public)';

export const pathnameDeRoute = (route) => route.split('?')[0];

export const cleDeBudget = (route, groupes) =>
  groupeDe(pathnameDeRoute(route), groupes).groupe === GROUPE_ROLE_PREMIER
    ? 'role-premier'
    : 'defaut';

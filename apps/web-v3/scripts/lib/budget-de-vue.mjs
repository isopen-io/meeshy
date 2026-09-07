// Classe une VUE dans sa classe de budget de page (compare-rendu.js), en lisant
// le groupe `(public)` de `budgets.json` — la zone que `bundle-budget.test.ts`
// nomme déjà « lecture partagée, rôle premier » — plutôt qu'une regex écrite à
// la main qui la duplique et diverge au premier écran ajouté (#4764) :
// `/^\/(l\/|stories\/|post\/|feed$)/` ne reconnaissait ni `/posts/*`, ni
// `/reels/*`, ni `/moods/*`, ni `/chat/*`, ni `/login/*`, ni `/signup/*`, et
// jugeait `/feed` — du groupe `(connected)` — au budget serré du rôle premier.
// `budgets.json` reste le SITE UNIQUE de déclaration de zone ; ce module ne
// fait que le LIRE, avec la même loi de motif que le reste de l'outillage
// (`motifs.mjs`, § « La loi de MOTIF de la v3, écrite UNE fois »).

import { couvre } from './motifs.mjs';

export const motifsDuRolePremier = (budgets) =>
  budgets?.groupes?.find((groupe) => groupe.id === '(public)')?.motifs ?? [];

export const estRolePremier = (route, budgets) =>
  motifsDuRolePremier(budgets).some((motif) => couvre(motif, route));

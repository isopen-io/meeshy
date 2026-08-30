// La loi de MOTIF de la v3, écrite UNE fois [L-0.5].
//
// Deux outils classent une chose par motif — `check-bundle-budget.mjs` classe une
// clé de manifeste dans un groupe de routes, `mesure-reseau.mjs` classe un chemin
// d'URL dans un écran budgété. Les deux ont besoin de la MÊME règle : le motif le
// plus PRÉCIS gagne, et deux motifs de précision égale ne tranchent pas — ils
// rendent une ambiguïté que l'appelant doit signaler plutôt qu'arbitrer au hasard
// de l'ordre du fichier. L'écrire deux fois en produirait deux versions
// divergentes au premier correctif.
//
// Ce qui CHANGE d'un appelant à l'autre n'est pas la règle, c'est la CIBLE : le
// gate de bundle compare certains motifs à la clé brute du manifeste et les
// autres à sa forme normalisée. D'où `cibleDe(motif)`, fourni par l'appelant.

// DEUX formes d'étoile, parce que deux questions.
//
//   `/stories/*`     TOUT ce qui vit sous /stories — un préfixe.
//   `/l/*/expired`   UN segment quelconque, à cette place — la seule façon
//                    d'écrire `/l/:token/expired`, dont le § 8.3 fait un plafond
//                    DISTINCT de celui de `/l/:token`.
//
// La précision reste la longueur du motif : `/l/*/expired` (13) l'emporte donc
// sur `/l/*` (2), et le plafond le plus spécifique gagne sans qu'on ait à écrire
// un ordre à la main.

const suffixe = '/*';

const echappe = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cache = new Map();

const enRegex = (motif) => {
  if (cache.has(motif)) return cache.get(motif);
  const large = motif.endsWith(suffixe);
  const corps = large ? motif.slice(0, -2) : motif;
  const segments = corps.split('/').map((s) => (s === '*' ? '[^/]+' : echappe(s)));
  const regex = new RegExp(`^${segments.join('/')}${large ? '(?:/.*)?' : ''}$`);
  cache.set(motif, regex);
  return regex;
};

export const precision = (motif) =>
  motif.endsWith(suffixe) ? motif.length - 2 : motif.length + 1;

export const couvre = (motif, cible) => enRegex(motif).test(cible);

export const plusPrecis = (candidats, cibleDe) => {
  const touches = candidats.flatMap((candidat) =>
    candidat.motifs
      .filter((motif) => couvre(motif, cibleDe(motif)))
      .map((motif) => ({ candidat, precision: precision(motif) })),
  );
  if (touches.length === 0) return { choix: null, ambigu: [] };

  const meilleure = Math.max(...touches.map((t) => t.precision));
  const finalistes = [
    ...new Set(touches.filter((t) => t.precision === meilleure).map((t) => t.candidat)),
  ];
  return finalistes.length === 1
    ? { choix: finalistes[0], ambigu: [] }
    : { choix: null, ambigu: finalistes };
};

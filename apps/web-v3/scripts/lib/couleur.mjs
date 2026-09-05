// L'arithmétique de couleur dont la table de jetons a besoin pour se GARDER
// elle-même [L-0.5].
//
// POURQUOI ELLE EXISTE
//
// « La table corrige la planche au titre de la dimension 5 (facilité d'accès) »
// est une AFFIRMATION tant que rien ne la calcule. Aucun script ni test du lot
// des jetons ne portait le mot `contrast`, `luminance` ni `4.5` : le schéma
// sombre — celui qui est mesuré et sert de référence — portait quatre paires
// sous AA sans que rien ne rougisse (`--color-text-subtle` sur `--color-bg` à
// 4,46, la même sur `--color-surface-raised` à 3,53, `--color-danger` sur
// `--color-surface-raised` à 4,04, `--color-on-avatar` sur `--color-avatar-1`
// à 4,37), et aucun jeton n'atteignait les 3:1 que WCAG 1.4.11 demande au
// contour visible d'un contrôle.
//
// POURQUOI ELLE RÉSOUT `var()` ELLE-MÊME
//
// La moitié des jetons de couleur de la table sont des ALIAS
// (`--color-text-subtle: var(--color-neutral-600)`, `--color-surface-raised:
// var(--color-neutral-900)`). Comparer les valeurs DÉCLARÉES ne dirait rien ;
// c'est la valeur SERVIE qui atteint le pixel. La résolution est donc faite
// ici, sur la table d'un schéma, et elle est bornée : une chaîne d'alias
// circulaire rend `null` plutôt que de boucler.
//
// Ce module ne connaît ni la v3 ni les jetons : il prend des chaînes et rend
// des nombres. La LOI — quelles paires, quel seuil — vit dans check-jetons.mjs.

const CANAL = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const octets = (hex) => {
  const corps = hex.slice(1);
  const paires =
    corps.length === 3 ? [...corps].map((c) => `${c}${c}`) : corps.match(/.{2}/g);
  return paires.map((paire) => Number.parseInt(paire, 16));
};

// WCAG 2.x — https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
const lineaire = (octet) => {
  const canal = octet / 255;
  return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
};

export const estHex = (valeur) => CANAL.test(valeur.trim());

export const luminance = (hex) => {
  const [r, v, b] = octets(hex.trim()).map(lineaire);
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
};

export const contraste = (a, b) => {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (haut + 0.05) / (bas + 0.05);
};

const ALIAS = /^var\(\s*(--[\w-]+)\s*\)$/;

// UN VOILE — `color-mix(in srgb, A p%, B)`. La charte (§ 12.5 règle 11) fait
// entrer quatre jetons de cette forme dans la table, et un fond qu'on ne sait
// pas CALCULER est un fond qu'on ne sait pas MESURER : `contrastesInsuffisants`
// rendait alors « paire non résolue », c'est-à-dire une infraction permanente,
// pour un jeton parfaitement lisible. La seule interpolation reconnue est
// `srgb` — c'est celle que les feuilles écrivent, et interpoler dans un espace
// perceptuel demanderait une conversion dont aucune valeur de la table n'a
// besoin. Tout autre espace rend `null` : « je n'ai pas su », jamais un chiffre
// approché.
const MELANGE = /^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\s*\)$/;

const canal = (a, b, part) => Math.round(a * part + b * (1 - part));

const enHex = (octets) =>
  `#${octets.map((octet) => octet.toString(16).padStart(2, '0')).join('')}`;

// Bornée par le nombre de jetons de la table : au-delà, la chaîne d'alias se
// mord la queue et il vaut mieux rendre `null` que boucler.
export const resout = (table, nom) => {
  let valeur = table[nom];
  for (let saut = 0; saut <= Object.keys(table).length; saut += 1) {
    if (valeur === undefined) return null;
    const texte = valeur.trim();
    const melange = MELANGE.exec(texte);
    if (melange !== null) return melangeResolu(table, melange);
    const alias = ALIAS.exec(texte);
    if (alias === null) return estHex(texte) ? texte.toLowerCase() : null;
    valeur = table[alias[1]];
  }
  return null;
};

// Les deux termes d'un voile sont eux-mêmes des jetons : ils se résolvent par le
// même chemin, ce qui rend un voile POSÉ SUR un voile calculable sans cas
// particulier.
const terme = (table, texte) => {
  const alias = ALIAS.exec(texte.trim());
  if (alias !== null) return resout(table, alias[1]);
  return estHex(texte) ? texte.trim().toLowerCase() : null;
};

const melangeResolu = (table, [, premier, pourcentage, second]) => {
  const [a, b] = [terme(table, premier), terme(table, second)];
  if (a === null || b === null) return null;
  const part = Number(pourcentage) / 100;
  const [octetsA, octetsB] = [octets(a), octets(b)];
  return enHex(octetsA.map((valeur, rang) => canal(valeur, octetsB[rang], part)));
};

export const arrondi = (rapport) => Math.round(rapport * 100) / 100;

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

// Bornée par le nombre de jetons de la table : au-delà, la chaîne d'alias se
// mord la queue et il vaut mieux rendre `null` que boucler.
export const resout = (table, nom) => {
  let valeur = table[nom];
  for (let saut = 0; saut <= Object.keys(table).length; saut += 1) {
    if (valeur === undefined) return null;
    const alias = ALIAS.exec(valeur.trim());
    if (alias === null) return estHex(valeur) ? valeur.trim().toLowerCase() : null;
    valeur = table[alias[1]];
  }
  return null;
};

export const arrondi = (rapport) => Math.round(rapport * 100) / 100;

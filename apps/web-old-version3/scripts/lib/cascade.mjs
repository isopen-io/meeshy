// La cascade CSS, réduite à ce que la TABLE DE JETONS en utilise [infra-3, #4413].
//
// POURQUOI ELLE EXISTE
//
// Le critère de fin de #4413 est une phrase COMPOSÉE : « un utilisateur en
// préférence claire explicite sur un OS sombre obtient des jetons CLAIRS ».
// Deux témoins la couvraient par moitiés — `theme-script.test.ts` prouve la
// CLASSE, `jetons.test.ts` prouve que chaque schéma DÉCLARE ses valeurs — et
// entre les deux il reste la cascade, qui est justement l'endroit où la jumelle
// que la conception § 2 refuse se loge : des jetons rendus à
// `@media (prefers-color-scheme)` pendant que les utilitaires `dark:` suivent
// la classe. Un `grep 'prefers-color-scheme'` dit qu'il n'y en a pas ; il ne dit
// pas ce que le navigateur SERT. Ce module le dit.
//
// CE QU'ELLE MODÉLISE, ET CE QU'ELLE REFUSE DE DEVINER
//
// Elle joue quatre choses, les seules dont la table dépend : l'ordre des
// `@import`, la spécificité entre `:root` et `:root.<classe>`, la condition
// `prefers-color-scheme` d'une requête de média, et `light-dark()`. Tout le
// reste — un combinateur, un `:not()`, une règle imbriquée, `@layer`,
// `@supports` — la fait LEVER une erreur plutôt que l'ignorer. Un résolveur qui
// laisse tomber en silence ce qu'il ne comprend pas rend vert sur exactement le
// défaut qu'on lui demande d'attraper.
//
// LA PROMESSE CI-DESSUS NE VALAIT QUE POUR LES SÉLECTEURS [revue #4413]
//
// Elle a été écrite en pensant à ce qui QUALIFIE une règle, et quatre formes
// passaient dessous sans qu'un mot du module les nomme :
//
//   1. `@layer base { :root { … } }` et `@supports (…) { :root { … } }` étaient
//      SAUTÉS en silence — `regles()` ne recursait que dans `@media` et jetait
//      tout prélude commençant par `@`. Or `@layer` est précisément la façon
//      dont Tailwind, choix retenu par la conception § 2, écrit une table.
//   2. `@import url('./dark.css') screen;` — un import QUALIFIÉ par un média —
//      ne matchait pas `IMPORT`, donc `dark.css` disparaissait de la cascade,
//      l'`@import` survivant était avalé dans le prélude de la règle suivante,
//      et la table servie tombait à ZÉRO propriété. Zéro propriété est justement
//      la valeur que le gate lit comme « le critère de fin est tenu ».
//   3. Un combinateur descendant (`:root .carte`) passait le contrôle d'ATOMES
//      — les deux atomes sont modélisés, c'est l'ESPACE entre eux qui ne l'est
//      pas. `atomes()` vérifie donc désormais que les atomes trouvés
//      RECONSTITUENT le sélecteur d'origine, ce qui ferme d'un coup tout
//      séparateur silencieux.
//   4. `light-dark(A, B)` sert A ou B selon le schéma RÉSOLU — c'est-à-dire
//      selon l'OS dès que `color-scheme` en déclare deux (`light dark`). C'est
//      la seule fonction CSS dont le métier ENTIER est de basculer sur l'OS, et
//      la cascade en rendait la chaîne littérale : identique sous les deux OS,
//      donc invisible pour `suivisDeLOS`. La jumelle que #4413 interdit
//      s'écrivait ainsi sans le mot `@media`.
//
// La leçon de forme : une promesse de LEVÉE se vérifie sur les deux moitiés
// d'une déclaration — ce qui la QUALIFIE (sélecteur, at-rule) et ce qu'elle
// VAUT.

import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const COMMENTAIRE = /\/\*[\s\S]*?\*\//g;
const IMPORT = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g;
const SCHEMA_OS = /prefers-color-scheme\s*:\s*(dark|light)/;

const net = (source) => source.replace(COMMENTAIRE, '');

/**
 * Les feuilles qu'un navigateur charge à partir d'une entrée, DANS L'ORDRE :
 * chaque `@import` d'abord (récursivement), le corps de l'entrée ensuite — un
 * `@import` doit précéder toute autre règle, donc le corps arrive toujours en
 * dernier dans la cascade.
 */
export const feuillesDepuis = (racine, entree) => {
  const chemin = join(racine, entree);
  const source = net(readFileSync(chemin, 'utf8'));
  const importees = [...source.matchAll(IMPORT)].flatMap((m) =>
    feuillesDepuis(dirname(chemin), m[1]),
  );
  const corps = source.replace(IMPORT, '');
  // Un `@import` qui SURVIT au retrait est un import que le module n'a pas su
  // suivre — un `@import url('./dark.css') screen;`, une couche, un `supports()`.
  // Le laisser passer fait DISPARAÎTRE une feuille de la cascade sans un mot.
  if (/@import/.test(corps)) {
    throw new Error(`cascade: @import non modélisé (${basename(chemin)})`);
  }
  return [...importees, { nom: basename(chemin), source: corps }];
};

const finDeBloc = (source, ouvrante) => {
  let profondeur = 0;
  for (let i = ouvrante; i < source.length; i += 1) {
    if (source[i] === '{') profondeur += 1;
    else if (source[i] === '}') {
      profondeur -= 1;
      if (profondeur === 0) return i;
    }
  }
  throw new Error('cascade: accolade non fermée');
};

const declarations = (corps) =>
  Object.fromEntries(
    [...corps.matchAll(/(--[\w-]+|[a-z-]+)\s*:\s*([^;]+)/g)].map((d) => [d[1], d[2].trim()]),
  );

const regles = (source, schemaOs, sortie) => {
  const entete = /([^{}]+)\{/g;
  let curseur = 0;
  for (;;) {
    entete.lastIndex = curseur;
    const m = entete.exec(source);
    if (m === null) return sortie;
    const prelude = m[1].trim();
    const ouvrante = m.index + m[0].length - 1;
    const fermante = finDeBloc(source, ouvrante);
    const corps = source.slice(ouvrante + 1, fermante);
    if (prelude.startsWith('@')) {
      if (!/^@media\b/.test(prelude)) {
        throw new Error(`cascade: règle @ non modélisée (${prelude})`);
      }
      const schema = SCHEMA_OS.exec(prelude);
      regles(corps, schema === null ? schemaOs : schema[1], sortie);
    } else {
      if (corps.includes('{')) throw new Error(`cascade: règle imbriquée non modélisée (${prelude})`);
      sortie.push({
        selecteurs: prelude.split(',').map((s) => s.trim()).filter(Boolean),
        declarations: declarations(corps),
        schemaOs,
      });
    }
    curseur = fermante + 1;
  }
};

const ATOME = /^(?::root|html|\.[\w-]+)$/;

const atomes = (selecteur) => {
  const parts = selecteur.match(/:root|html|\.[\w-]+|\S/g) ?? [];
  // Deux contrôles, et le second est celui qui manquait : les atomes doivent
  // RECONSTITUER le sélecteur. Sans lui, `:root .carte` (combinateur descendant)
  // rendait les deux mêmes atomes que `:root.carte` — l'ESPACE, seul porteur du
  // sens, disparaissait sans un mot.
  if (parts.some((atome) => !ATOME.test(atome)) || parts.join('') !== selecteur) {
    throw new Error(`cascade: sélecteur non modélisé (${selecteur})`);
  }
  return parts;
};

const sert = (selecteur, classes) =>
  atomes(selecteur).every((atome) => (atome.startsWith('.') ? classes.includes(atome.slice(1)) : true));

// [classes+pseudo-classes, types] — aucun identifiant n'apparaît dans la table.
const specificite = (selecteur) =>
  atomes(selecteur).reduce(
    ([b, c], atome) => (atome === 'html' ? [b, c + 1] : [b + 1, c]),
    [0, 0],
  );

const gagne = (candidate, tenante) =>
  tenante === undefined ||
  candidate[0] > tenante[0] ||
  (candidate[0] === tenante[0] && candidate[1] >= tenante[1]);

const argumentsDeTeteDeListe = (texte) => {
  const args = [];
  let profondeur = 0;
  let debut = 0;
  for (let i = 0; i < texte.length; i += 1) {
    if (texte[i] === '(') profondeur += 1;
    else if (texte[i] === ')') profondeur -= 1;
    else if (texte[i] === ',' && profondeur === 0) {
      args.push(texte.slice(debut, i));
      debut = i + 1;
    }
  }
  return [...args, texte.slice(debut)].map((a) => a.trim());
};

const LIGHT_DARK = 'light-dark(';

/**
 * `light-dark(A, B)` sert A sous un schéma résolu CLAIR, B sous un schéma
 * SOMBRE. C'est la seule fonction CSS dont le métier entier est de servir deux
 * couleurs selon le schéma — la rendre littéralement rendait la même chaîne
 * sous les deux OS, donc invisible pour tout contrôle qui compare les tables
 * servies.
 */
export const resoutLightDark = (valeur, schema) => {
  const debut = valeur.indexOf(LIGHT_DARK);
  if (debut === -1) return valeur;
  const ouvrante = debut + LIGHT_DARK.length - 1;
  let profondeur = 0;
  let fermante = -1;
  for (let i = ouvrante; i < valeur.length && fermante === -1; i += 1) {
    if (valeur[i] === '(') profondeur += 1;
    else if (valeur[i] === ')') {
      profondeur -= 1;
      if (profondeur === 0) fermante = i;
    }
  }
  if (fermante === -1) throw new Error(`cascade: light-dark() non fermé (${valeur})`);
  const args = argumentsDeTeteDeListe(valeur.slice(ouvrante + 1, fermante));
  if (args.length !== 2) {
    throw new Error(`cascade: light-dark() attend DEUX couleurs (${valeur})`);
  }
  return resoutLightDark(
    valeur.slice(0, debut) + (schema === 'light' ? args[0] : args[1]) + valeur.slice(fermante + 1),
    schema,
  );
};

/**
 * Le schéma RÉSOLU sur l'élément : celui que `color-scheme` déclare quand il
 * n'en déclare qu'UN, celui de l'OS dès qu'il en déclare deux (`light dark`) ou
 * aucun. C'est ce schéma-là, pas la requête de média, qui arme `light-dark()`.
 */
export const schemaResolu = (colorScheme, schemaOs) => {
  const declares = (colorScheme ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((mot) => mot === 'light' || mot === 'dark');
  return declares.length === 1 ? declares[0] : schemaOs;
};

/**
 * Ce que l'agent utilisateur sert à `<html class="…">` sous un schéma d'OS
 * donné : la table de déclarations résolue, `color-scheme` compris — c'est lui
 * qui peint les ascenseurs et les contrôles natifs, et il bascule par les mêmes
 * règles que les jetons.
 */
export const tableServie = ({ feuilles, classes, osSombre }) => {
  const schemaOs = osSombre ? 'dark' : 'light';
  const applicables = feuilles
    .flatMap((feuille) => regles(feuille.source, null, []))
    .filter((regle) => regle.schemaOs === null || regle.schemaOs === schemaOs);
  const servie = {};
  const tenantes = {};
  applicables.forEach((regle) => {
    const poids = regle.selecteurs
      .filter((selecteur) => sert(selecteur, classes))
      .map(specificite)
      .sort((a, b) => b[0] - a[0] || b[1] - a[1])[0];
    if (poids === undefined) return;
    Object.entries(regle.declarations).forEach(([propriete, valeur]) => {
      if (!gagne(poids, tenantes[propriete])) return;
      tenantes[propriete] = poids;
      servie[propriete] = valeur;
    });
  });
  const resolu = schemaResolu(servie['color-scheme'], schemaOs);
  return Object.fromEntries(
    Object.entries(servie).map(([propriete, valeur]) => [
      propriete,
      resoutLightDark(valeur, resolu),
    ]),
  );
};

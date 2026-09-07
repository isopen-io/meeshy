/**
 * L'AVATAR D'UN NOM — ses initiales et sa teinte — écrit UNE fois, pour les
 * deux rendus d'une ligne : celui que le SERVEUR compose (`app/connecte/
 * fil-lignes.ts`, `app/connecte/vue.ts`) et celui que le module de
 * participation PEINT dans le navigateur (`lib/realtime/fil-peinture.ts`).
 *
 * Il en existait TROIS copies des initiales et DEUX de la teinte, dont l'une
 * s'annonçait « la même dispersion que celle du serveur » — la jumelle que la
 * charte interdit : un même auteur aurait pu prendre deux couleurs entre la
 * ligne servie et la ligne peinte en direct, sans qu'aucun témoin ne le voie.
 * Ce module est isomorphe (aucun DOM, aucun `process`) : bun le bundle dans le
 * module de participation, Node le lit dans les gestionnaires de route.
 */

export const TEINTES = ['t1', 't2', 't3', 't4'] as const;

export type Teinte = (typeof TEINTES)[number];

export const initiales = (nom: string): string =>
  nom
    .split(/\s+/)
    .filter((mot) => mot !== '')
    .slice(0, 2)
    .map((mot) => [...mot][0] ?? '')
    .join('')
    .toUpperCase() || '·';

/**
 * LA TEINTE D'UN AVATAR — l'une des quatre de la table, tirée du NOM.
 *
 * Elle dit QUI (charte règle 11), donc elle doit être STABLE : un même fil, un
 * même auteur ne peuvent pas changer de couleur entre deux rendus, sinon la
 * couleur cesse d'être une information et devient du bruit. Elle est calculée
 * depuis le nom affiché — c'est lui que le lecteur voit, et deux appareils
 * doivent peindre la même pastille.
 *
 * CE QU'UNE TEINTE PEUT PROMETTRE, AVEC QUATRE COULEURS. Elle DÉSAMBIGUÏSE deux
 * lignes voisines ; elle n'IDENTIFIE personne. Ce qui se choisit, c'est de ne
 * pas AGGRAVER ce hasard : une somme de points de code rendrait la même valeur
 * pour toute PERMUTATION d'un nom (« Marta Ruiz » et « Ruiz Marta »). Le mélange
 * djb2 dépend de l'ORDRE ; son avalanche finale fait remonter les bits de poids
 * fort dans les faibles, sans quoi le modulo par quatre ne lirait que la parité
 * (33 est congru à 1 modulo 4).
 */
export const teinteDeLAvatar = (nom: string): Teinte => {
  const melange = [...nom].reduce(
    (accumule, caractere) => (Math.imul(accumule, 33) ^ (caractere.codePointAt(0) ?? 0)) >>> 0,
    5381,
  );
  const premier = (melange ^ (melange >>> 16)) >>> 0;
  const second = Math.imul(premier, 0x45d9f3b) >>> 0;
  const disperse = (second ^ (second >>> 16)) >>> 0;
  return TEINTES[disperse % TEINTES.length] ?? 't1';
};

// OÙ VIT UN JETON DE VUE — ET POURQUOI PAS DANS `vues.json` [L-0.5].
//
// `vues.json` est REGÉNÉRÉ : `capture-cibles.js` pilote la planche, scrape ses
// 37 écrans et réécrit le fichier en entier. La planche ne connaît aucun jeton
// — elle dessine `/l/:token`, jamais `/l/lien-vivant`. Un champ `jetons` posé
// dans `vues.json` y vivrait donc jusqu'à la prochaine capture, puis
// disparaîtrait SANS UN MOT.
//
// Et la disparition est le pire des défauts possibles ici, parce qu'elle est
// MUETTE : sans jeton, `vues-comparables.mjs` refuse — exactement ce qu'il fait
// à bon droit quand un jeton manque vraiment. Le mode dégradé rend le même
// verdict que le mode nominal, donc rien ne rougit, et la branche COMPARAISON
// du résolveur redevient inatteignable sans que personne ne l'apprenne.
//
// D'où la forme retenue : le jeton vit dans une ANNEXE que le générateur
// n'ouvre jamais, et ce module tient ENSEMBLE les deux moitiés de la couture —
// ce que la régénération écrit, et ce que la lecture joint. La propriété est
// alors structurelle et non réparée : la régénération ne peut pas effacer ce
// qu'elle n'écrit pas.
//
// Deux gardes s'ensuivent, parce qu'un fichier annexe DÉPLACE le piège s'il ne
// les porte pas :
//
//   1. l'annexe ABSENTE se dit par son nom, jamais en se fondant dans le refus
//      ordinaire d'un jeton non déclaré — c'est le défaut d'origine qui
//      reviendrait par la porte de service ;
//   2. un `jetons` trouvé DANS `vues.json` est NOMMÉ et jamais honoré : le
//      laisser marcher, c'est le laisser mourir à la capture suivante.
//
// Ce module touche au disque, contrairement à `vues-comparables.mjs` : il est
// la couture entre DEUX fichiers, et ses seuls appelants (`capture-cibles.js`,
// `compare-rendu.js`, le harnais de tests) tournent tous sous node.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const NOM_INDEX = 'vues.json';
export const NOM_JETONS = 'jetons-de-vues.json';
export const NOM_LISIBLE = 'vues.md';

// Les sept champs que la PLANCHE produit — et la garantie structurelle du lot :
// une ligne d'index est PROJETÉE sur cette liste, donc un champ absent d'ici ne
// peut pas entrer dans `vues.json`, ni par le scrape ni par une main.
export const CHAMPS_REGENERES = ['id', 'label', 'route', 'group', 'title', 'subtitle', 'png'];

const projette = (vue) =>
  Object.fromEntries(CHAMPS_REGENERES.map((champ) => [champ, vue[champ] ?? '']));

export const indexRegenere = ({ source, vues }) => ({
  source,
  count: vues.length,
  vues: vues.map(projette),
});

const parGroupe = (vues) =>
  vues.reduce(
    (groupes, vue) =>
      groupes.some((g) => g.name === vue.group)
        ? groupes.map((g) => (g.name === vue.group ? { ...g, items: [...g.items, vue] } : g))
        : [...groupes, { name: vue.group, items: [vue] }],
    [],
  );

const echappe = (valeur) => String(valeur).replace(/\|/g, '\\|');

export const documentDesVues = ({ source, vues }) =>
  [
    '# Meeshy web v3 — les vues cibles',
    '',
    "> **Ce fichier est une SOURCE, pas un tableau de bord.** L'etat d'implementation de chaque vue vit",
    '> dans son issue GitHub, jamais ici. Regenere par `capture-cibles.js` — ne pas editer a la main.',
    '',
    `La planche \`${source}\` porte **${vues.length} ecrans**, chacun avec sa route web.`,
    '',
    ...parGroupe(vues).flatMap((groupe) => [
      `## ${groupe.name}`,
      '',
      '| Vue | Route | Titre | Capture |',
      '|---|---|---|---|',
      ...groupe.items.map(
        (v) =>
          `| ${echappe(v.label)} | \`${echappe(v.route)}\` | ${echappe(v.title)} | ![${v.id}](${v.png}) |`,
      ),
      '',
    ]),
  ].join('\n');

// LES DEUX SEULS FICHIERS QU'UNE CAPTURE RÉÉCRIT. Les nommer ici, et non au fil
// du harnais, est ce qui rend « la régénération ne touche pas l'annexe »
// vérifiable par un témoin plutôt que par une relecture.
export const ecrisLIndex = ({ dossier, source, vues }) => {
  const index = indexRegenere({ source, vues });
  writeFileSync(join(dossier, NOM_INDEX), `${JSON.stringify(index, null, 1)}\n`);
  writeFileSync(join(dossier, NOM_LISIBLE), documentDesVues({ source, vues: index.vues }));
  return index;
};

export const vuesJointes = ({ index, jetons }) =>
  index.vues.map((vue) => {
    const declares = jetons[vue.id];
    return declares === undefined ? projette(vue) : { ...projette(vue), jetons: declares };
  });

export const jetonsHorsAnnexe = (index) =>
  index.vues
    .filter((vue) => vue.jetons !== undefined)
    .map((vue) => ({
      id: vue.id,
      raison:
        `jeton déclaré au mauvais endroit : « ${vue.id} » porte un champ « jetons » dans ` +
        `${NOM_INDEX}, que la capture RÉÉCRIT en entier — la prochaine régénération l'effacera ` +
        `sans un mot, et le refus qui suivra ressemblera à un refus légitime. Le déclarer dans ` +
        `${NOM_JETONS}, que la régénération n'ouvre jamais`,
    }));

export const litLesVues = (dossier) => {
  const index = JSON.parse(readFileSync(join(dossier, NOM_INDEX), 'utf8'));
  const chemin = join(dossier, NOM_JETONS);
  const presente = existsSync(chemin);
  const annexe = presente ? JSON.parse(readFileSync(chemin, 'utf8')) : {};

  return {
    source: index.source,
    vues: vuesJointes({ index, jetons: annexe.jetons ?? {} }),
    refus: [
      ...(presente
        ? []
        : [
            {
              id: NOM_JETONS,
              raison:
                `annexe absente : ${NOM_JETONS} est le seul site où une vue déclare la valeur de ` +
                `ses jetons de route. Sans lui, TOUTE route paramétrée est refusée — et ce refus ` +
                `est indiscernable de celui d'un jeton réellement non déclaré`,
            },
          ]),
      ...jetonsHorsAnnexe(index),
    ],
  };
};

// Le graphe des workspaces, lu depuis les globs de la racine.
//
// Ce module portait aussi la lecture de disque de `scripts/check-v3-pipeline.mjs`
// (fichiers d'un paquet, requêtes relatives, chaînes d'environnement). Ce garde
// n'était câblé à aucune étape de CI (#5623) et a été retiré avec ses deux libs
// exclusives (`v3-routage.mjs`, `v3-sondes.mjs`) ; `workspaceDirectories` reste
// seul ici parce que `scripts/check-ci-build-order.mjs` — lui bien câblé
// (`ci.yml` job `quality`) — en dépend.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Le graphe que la racine gouverne, lu depuis ses globs — la même entrée que
// `scripts/check-lockfile-alignment.mjs`, et pour la même raison : un parcours
// du disque ramasserait des manifestes que bun n'installe jamais.
export const workspaceDirectories = (root) => {
  const globs = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).workspaces ?? [];
  const parents = [
    ...new Set(globs.filter((glob) => glob.endsWith('/*')).map((glob) => glob.slice(0, -2))),
  ];
  return parents.flatMap((parent) =>
    (existsSync(join(root, parent)) ? readdirSync(join(root, parent), { withFileTypes: true }) : [])
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const manifest = join(root, parent, entry.name, 'package.json');
        if (!existsSync(manifest)) return [];
        const { name } = JSON.parse(readFileSync(manifest, 'utf8'));
        return typeof name === 'string' ? [{ name, directory: `${parent}/${entry.name}` }] : [];
      }),
  );
};

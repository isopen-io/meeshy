import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Liste RÉCURSIVEMENT tous les fichiers (jamais les dossiers) sous `dir`,
 * chemins ABSOLUS. Extrait de `check-shell-dist.mjs` (#5815) pour être
 * partagé avec `build-shells.mjs` — jamais une jumelle recopiée : les deux
 * scripts auditent le MÊME dist construit de la MÊME façon.
 */
export function allFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? allFiles(path) : [path];
  });
}

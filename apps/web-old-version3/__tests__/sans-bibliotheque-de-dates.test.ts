/**
 * @jest-environment node
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * GARDE DE SOURCE — « Intl natif » (critère de fin `detail-notification`,
 * spécification § 3 témoin 9). `apps/web-v3` ne déclare ni n'importe aucune
 * bibliothèque de dates : la table des fuseaux (`FUSEAUX_DND`,
 * `lib/contenu/prefs-de-notif.ts`) est de l'arithmétique pure.
 */

const RACINE = path.resolve(__dirname, '..');
const BIBLIOTHEQUES_INTERDITES = ['moment', 'dayjs', 'date-fns', 'luxon'];
const DOSSIERS_SOURCE = ['app', 'lib'];
const DOSSIERS_IGNORES = new Set(['node_modules', '.next', 'coverage']);

const fichiersSource = (dossier: string): string[] => {
  const entrees = fs.readdirSync(dossier, { withFileTypes: true });
  return entrees.flatMap((entree) => {
    if (DOSSIERS_IGNORES.has(entree.name)) return [];
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) return fichiersSource(chemin);
    return /\.(ts|tsx)$/.test(entree.name) ? [chemin] : [];
  });
};

describe('aucune bibliothèque de dates dans apps/web-v3', () => {
  it('`package.json` ne déclare ni moment, ni dayjs, ni date-fns, ni luxon', () => {
    const paquet = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')) as {
      readonly dependencies?: Record<string, string>;
      readonly devDependencies?: Record<string, string>;
    };
    const declarees = { ...paquet.dependencies, ...paquet.devDependencies };

    BIBLIOTHEQUES_INTERDITES.forEach((nom) => expect(declarees[nom]).toBeUndefined());
  });

  it('aucun `import`/`require` de ces noms dans `app/` ou `lib/`', () => {
    const motif = new RegExp(`from\\s+['"](${BIBLIOTHEQUES_INTERDITES.join('|')})['"]|require\\(['"](${BIBLIOTHEQUES_INTERDITES.join('|')})['"]\\)`);

    const coupables = DOSSIERS_SOURCE.flatMap((dossier) => fichiersSource(path.join(RACINE, dossier))).filter((fichier) =>
      motif.test(fs.readFileSync(fichier, 'utf8')),
    );

    expect(coupables).toEqual([]);
  });
});

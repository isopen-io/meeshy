import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LES RESSOURCES DE LA COQUE RESTENT DU XML VALIDE (#10088).
 *
 * XML interdit `--` dans un commentaire : `mergeDebugResources` refuse alors
 * le fichier et l'APK ne se construit plus. Un commentaire qui citait le
 * jeton `--ios-surface` a cassé la coque sans qu'aucun témoin web ne rougisse.
 */

const RES = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'res');

function fichiersXml(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersXml(chemin);
    return nom.endsWith('.xml') ? [chemin] : [];
  });
}

describe('les ressources XML de la coque se compilent (#10088)', () => {
  test('aucun commentaire ne contient « -- »', () => {
    const fautifs = fichiersXml(RES).filter((chemin) =>
      [...readFileSync(chemin, 'utf8').matchAll(/<!--([\s\S]*?)-->/g)].some(([, corps]) => (corps ?? '').includes('--')),
    );
    expect(fautifs.map((chemin) => chemin.slice(RES.length + 1))).toEqual([]);
  });
});

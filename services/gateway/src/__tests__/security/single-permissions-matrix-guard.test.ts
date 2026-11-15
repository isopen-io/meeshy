/**
 * UNE seule matrice dit qui peut administrer (#4152).
 *
 * Le dépôt en portait QUATRE, et les clients lisaient les moins fiables :
 *
 * | où | écart mesuré |
 * |---|---|
 * | matrice centrale (17 × 6) | fait autorité |
 * | matrice locale de `routes/admin/services` (9 × 6) | `ADMIN.canManageTranslations` à `false` contre `true` |
 * | copie manuscrite servie à la CONNEXION | `ANALYST.canAccessAdmin: true`, quand les deux matrices disent `false` |
 * | copie manuscrite servie après ÉDITION DE PROFIL | `canAccessAdmin = isAdmin` seul ⇒ un MODERATOR PERD son accès en changeant d'avatar |
 *
 * ## Pourquoi une garde de SOURCE
 *
 * Corriger les quatre ne dit rien de la cinquième. Ce qui a produit ces copies
 * n'est pas une erreur ponctuelle mais un GESTE facile : écrire un objet de
 * permissions là où on en a besoin. La garde interdit le geste.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const RACINE = path.resolve(__dirname, '../..');

/** Les deux seuls fichiers autorisés à DÉCLARER des permissions. */
const SITES_AUTORISES = [
  'services/admin/permissions.service.ts',   // la matrice, la loi
  'services/admin/served-permissions.ts',    // sa projection sur le fil
] as const;

function fichiersTs(racine: string): string[] {
  const sortie: string[] = [];
  for (const entree of fs.readdirSync(racine, { withFileTypes: true })) {
    const complet = path.join(racine, entree.name);
    if (entree.isDirectory()) {
      if (entree.name !== '__tests__' && entree.name !== 'node_modules') sortie.push(...fichiersTs(complet));
    } else if (entree.name.endsWith('.ts')) {
      sortie.push(complet);
    }
  }
  return sortie;
}

function lignesDeCode(texte: string): Array<{ ligne: string; numero: number }> {
  return texte
    .split('\n')
    .map((ligne, i) => ({ ligne: ligne.trim(), numero: i + 1 }))
    .filter(({ ligne }) => !ligne.startsWith('//') && !ligne.startsWith('*') && !ligne.startsWith('/*'));
}

describe('Aucune cinquième copie ne peut apparaître', () => {
  it('le balayage LIT bien l’arbre — sinon il serait vert à vide', () => {
    const fichiers = fichiersTs(RACINE);
    expect(fichiers.length).toBeGreaterThan(100);
    for (const autorise of SITES_AUTORISES) {
      expect(fs.existsSync(path.join(RACINE, autorise))).toBe(true);
    }
  });

  it('`canAccessAdmin` n’est CALCULÉ nulle part ailleurs', () => {
    // La clé qui décide si la console d'administration s'affiche.
    //
    // Deux formes restent légitimes hors des sites autorisés, et elles seules :
    //
    //   `canAccessAdmin: boolean`            — une DÉCLARATION de type
    //   `canAccessAdmin: <x>.canAccessAdmin` — une PROJECTION, qui relaie
    //
    // Toute autre valeur CALCULE le droit, et c'est exactement ce que les
    // quatre copies faisaient : un littéral, un `isAdmin`, une comparaison de
    // rôle. La chercher par une liste de formes INTERDITES manquerait la
    // cinquième ; on énumère donc les formes AUTORISÉES.
    const copies = fichiersTs(RACINE)
      .filter((f) => !SITES_AUTORISES.some((a) => f.endsWith(a)))
      .flatMap((f) =>
        lignesDeCode(fs.readFileSync(f, 'utf8'))
          .filter(({ ligne }) => {
            const m = /canAccessAdmin\s*:\s*(.+?)[,;}]/.exec(ligne);
            if (!m) return false;
            const valeur = m[1].trim();
            return valeur !== 'boolean' && !/^[\w.]+\.canAccessAdmin$/.test(valeur);
          })
          .map(({ numero, ligne }) => `${path.relative(RACINE, f)}:${numero}  ${ligne}`)
      );

    expect(copies).toEqual([]);
  });

  it('aucune SECONDE matrice n’associe un rôle à un bloc de permissions', () => {
    // La forme d'une matrice : une clé de rôle littérale ouvrant un objet. Les
    // deux qui existaient l'avaient toutes les deux.
    const matrices = fichiersTs(RACINE)
      .filter((f) => !SITES_AUTORISES.some((a) => f.endsWith(a)))
      .flatMap((f) =>
        lignesDeCode(fs.readFileSync(f, 'utf8'))
          .filter(({ ligne }) => /^'(BIGBOSS|ADMIN|MODERATOR|AUDIT|ANALYST)'\s*:\s*\{$/.test(ligne))
          .map(({ numero, ligne }) => `${path.relative(RACINE, f)}:${numero}  ${ligne}`)
      );

    expect(matrices).toEqual([]);
  });

  it('la matrice locale de `routes/admin` est bien devenue une PROJECTION', () => {
    const local = fs.readFileSync(path.join(RACINE, 'routes/admin/services/PermissionsService.ts'), 'utf8');

    // Elle DÉLÈGUE...
    expect(local).toContain('adminPermissionsService.getPermissions');
    // ...et ne DÉCLARE plus rien.
    expect(local).not.toContain('DEFAULT_PERMISSIONS');
    expect(local).not.toContain('ROLE_HIERARCHY');
  });
});

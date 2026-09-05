/**
 * Le hachage de mot de passe a un SITE UNIQUE — `utils/password-hash.ts` (#5216)
 * — et cette garde le tient (#5235).
 *
 * `#5216` a consolidé le hachage (coût bcrypt, choix natif/JS) dans
 * `hashPassword`/`verifyPassword`. Il restait deux appelants qui comparaient
 * encore un mot de passe de COMPTE avec `bcryptjs` en direct :
 * `routes/users/contact-changes.ts` et `routes/me/delete-account.ts`. Un
 * troisième — `services/TwoFactorService.ts:263`, `disable()` — comparait lui
 * aussi le mot de passe du COMPTE (pas un code de secours : ceux-ci sont
 * hachés en SHA-256 par `hashBackupCode`, une famille de secret distincte et
 * hors périmètre) ; l'issue #5235 le classait « hors périmètre, sauf décision
 * du lot » sur la foi d'une description erronée de cette ligne — mesuré ici,
 * elle est dans la MÊME famille que les deux routes, donc dans le même lot.
 *
 * Rien n'était cassé — les formats `$2a$`/`$2b$` se vérifient mutuellement,
 * `utils/password-hash.ts` le documente — mais deux moteurs pour un même
 * secret sont une jumelle qui divergera sans qu'aucun témoin ne rougisse : si
 * le natif devient un jour obligatoire, ou si `verifyPassword` change sa
 * règle « ne lève jamais », les trois sites doublés ne le sauraient pas.
 *
 * Cette garde interdit tout import de `bcrypt` / `bcryptjs` hors
 * `utils/password-hash.ts`, dans le CODE DE PRODUCTION du gateway. Les
 * témoins (`__tests__`) restent libres d'importer `bcryptjs` pour fabriquer
 * des fixtures de hash réel (`bcrypt.hashSync(...)`) — ce n'est pas une
 * comparaison de mot de passe applicative.
 *
 * Une garde NÉGATIVE meurt en silence : elle reste verte si son balayage
 * rend `[]` (répertoire déplacé, motif qui ne matche plus rien). Les témoins
 * POSITIFS ci-dessous prouvent que le balayage atteint bien les fichiers
 * qu'il prétend garder, et que le motif attrape bien ce qu'il interdit.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const GATEWAY_SRC = join(__dirname, '../..');
const REPO_ROOT = join(GATEWAY_SRC, '../../..');
const SITE_UNIQUE = join(GATEWAY_SRC, 'utils/password-hash.ts');
const SKIPPED_DIRS = new Set(['__tests__', 'node_modules', 'dist']);

const FORBIDDEN_IMPORT = /(?:from\s+|require\()\s*['"]bcrypt(?:js)?['"]/;

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIPPED_DIRS.has(entry)) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return entry.endsWith('.ts') && !entry.endsWith('.d.ts') ? [full] : [];
  });
}

const scannedFiles = (): readonly string[] =>
  sourceFiles(GATEWAY_SRC).filter((f) => f !== SITE_UNIQUE);

describe('garde — le hachage de mot de passe a un site unique (utils/password-hash.ts)', () => {
  it('balaie bien les sources qu\'elle prétend garder', () => {
    const files = scannedFiles();

    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith('routes/users/contact-changes.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('routes/me/delete-account.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('services/TwoFactorService.ts'))).toBe(true);
    // Le site unique lui-même n'est jamais balayé — il importe `bcryptjs` en légitimité.
    expect(files.includes(SITE_UNIQUE)).toBe(false);
  });

  it('interdit bien l\'import direct, sous ses deux noms de paquet', () => {
    expect(FORBIDDEN_IMPORT.test("import bcrypt from 'bcryptjs';")).toBe(true);
    expect(FORBIDDEN_IMPORT.test('import bcrypt from "bcrypt";')).toBe(true);
    expect(FORBIDDEN_IMPORT.test("const bcrypt = require('bcryptjs');")).toBe(true);
    expect(FORBIDDEN_IMPORT.test("import { verifyPassword } from '../../utils/password-hash';")).toBe(false);
    expect(FORBIDDEN_IMPORT.test("import bcrypt from 'bcryptjs-something-else';")).toBe(false);
  });

  it('aucun import direct de bcrypt/bcryptjs ne subsiste hors du site unique', () => {
    const offenders = scannedFiles()
      .filter((file) => FORBIDDEN_IMPORT.test(readFileSync(file, 'utf8')))
      .map((file) => relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });
});

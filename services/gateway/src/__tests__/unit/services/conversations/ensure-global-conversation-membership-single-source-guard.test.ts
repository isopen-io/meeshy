/**
 * Garde de source — l'ajout au salon global "meeshy" a UNE seule
 * implémentation (#3876).
 *
 * Avant ce lot, trois portes divergeaient : l'inscription publique
 * (`AuthService.register`) ajoutait l'utilisateur inline ; le seed
 * (`InitService`) portait sa PROPRE copie sous le nom
 * `addUserToMeeshyConversation` (et un troisième site direct dans
 * `createBigbossUser`) ; la création d'un compte par un administrateur
 * (`UserManagementService.createUser`) n'ajoutait RIEN. Les quatre sont
 * désormais unifiés derrière `ensureGlobalConversationMembership`
 * (`services/conversations/ensureGlobalConversationMembership.ts`).
 *
 * Ce garde rougit si :
 *  - l'ancien nom `addUserToMeeshyConversation` reparaît hors tests (une
 *    résurrection de la copie supprimée) ;
 *  - la fonction partagée est redéfinie ailleurs que dans son fichier
 *    d'origine ;
 *  - l'un des trois appelants attendus cesse de l'appeler.
 *
 * Une garde NÉGATIVE meurt en silence : elle reste verte si son balayage rend
 * `[]`. Le témoin positif ci-dessous prouve que le balayage atteint bien les
 * fichiers qu'il prétend garder.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const GATEWAY_SRC = join(__dirname, '../../../..');
const REPO_ROOT = join(GATEWAY_SRC, '../../..');
const SKIPPED_DIRS = new Set(['__tests__', 'node_modules', 'dist']);
const SOURCE_FILE = join(GATEWAY_SRC, 'services/conversations/ensureGlobalConversationMembership.ts');

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIPPED_DIRS.has(entry)) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return entry.endsWith('.ts') && !entry.endsWith('.d.ts') ? [full] : [];
  });
}

const scannedFiles = (): readonly string[] => sourceFiles(GATEWAY_SRC);

const EXPECTED_CALLERS = [
  'services/AuthService.ts',
  'services/admin/user-management.service.ts',
  'services/InitService.ts',
] as const;

describe('garde — ajout au salon global, source unique', () => {
  it('balaie bien les sources qu\'il prétend garder', () => {
    const files = scannedFiles();

    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f === SOURCE_FILE)).toBe(true);
    for (const caller of EXPECTED_CALLERS) {
      expect(files.some((f) => f.endsWith(caller))).toBe(true);
    }
  });

  it('l\'ancien nom `addUserToMeeshyConversation` ne reparaît nulle part hors tests', () => {
    const offenders = scannedFiles()
      .filter((file) => /\baddUserToMeeshyConversation\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('`ensureGlobalConversationMembership` n\'est DÉFINIE que dans son fichier d\'origine', () => {
    const definers = scannedFiles()
      .filter((file) => file !== SOURCE_FILE)
      .filter((file) => /export (async )?function ensureGlobalConversationMembership\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(REPO_ROOT, file));

    expect(definers).toEqual([]);
  });

  it('les trois appelants attendus appellent bien la fonction partagée', () => {
    for (const caller of EXPECTED_CALLERS) {
      const path = join(GATEWAY_SRC, caller);
      const content = readFileSync(path, 'utf8');
      expect(content).toMatch(/\bensureGlobalConversationMembership\(/);
    }
  });
});

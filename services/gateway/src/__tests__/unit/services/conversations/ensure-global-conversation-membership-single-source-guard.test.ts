/**
 * Garde de source — l'ajout au salon global "meeshy" a UNE seule
 * implémentation (#3876).
 *
 * Avant ce lot, trois portes divergeaient : l'inscription publique
 * (alors `AuthService.register`, désormais
 * `services/auth/registration.service`) ajoutait l'utilisateur inline ; le seed
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

/**
 * L'inscription publique a quitté `AuthService.ts` au #5216 — le fichier était
 * hors budget et la règle n'y utilisait aucun `this`. Ce qu'on garde n'a pas
 * changé : c'est la PORTE, pas le fichier qui l'hébergeait.
 */
const EXPECTED_CALLERS = [
  'services/auth/registration.service.ts',
  'services/admin/user-management.service.ts',
  'services/InitService.ts',
] as const;

/**
 * Les seuls sites de PRODUCTION qui créent une ligne `User`.
 *
 * `InitService` n'y figure pas : il ne crée aucun compte lui-même, il appelle
 * `AuthService.register()` — donc il hérite de l'ajout par ce chemin, en plus
 * de son propre appel pour imposer le rang du salon global. `AuthService.ts`
 * n'y figure plus non plus, pour la même raison depuis #5216 : il DÉLÈGUE à
 * `services/auth/registration.service`, qui est le site d'écriture.
 */
const EXPECTED_USER_CREATORS = [
  'services/auth/registration.service.ts',
  'services/admin/user-management.service.ts',
] as const;

const USER_WRITE = /\.user\.(create|createMany|upsert)\s*\(/;

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

  /**
   * Les témoins ci-dessus figent une liste d'appelants — ils portent donc
   * l'affirmation VÉRIFIABLE (« ces fichiers appellent la fonction ») et pas
   * l'autre (« ce sont les fichiers où la règle s'applique »), qui est celle
   * qui compte. Un quatrième `prisma.user.create` posé demain sans l'ajout au
   * salon global ne ferait rougir aucun des trois : c'est exactement le défaut
   * que #3876 vient de corriger sur la création admin, et rien n'empêchait sa
   * répétition.
   *
   * Ce cliquet-ci part donc de l'AUTRE bout — il énumère ce qui CRÉE UN
   * COMPTE, et exige que chaque site soit une porte connue. Quand il tombe :
   * la réparation est d'appeler `ensureGlobalConversationMembership`, jamais
   * d'ajouter une ligne à l'inventaire.
   */
  it('AUCUN site de création de compte n\'échappe aux portes connues', () => {
    const creators = scannedFiles()
      .filter((file) => USER_WRITE.test(readFileSync(file, 'utf8')))
      .map((file) => relative(GATEWAY_SRC, file));

    expect(creators.sort()).toEqual([...EXPECTED_USER_CREATORS].sort());
  });

  it('le balayage de création de compte SAIT reconnaître une écriture', () => {
    // Une garde négative dont le motif ne matche rien reste verte pour la
    // mauvaise raison : on prouve d'abord que le motif voit ce qu'il cherche.
    expect(USER_WRITE.test('await this.prisma.user.create({ data })')).toBe(true);
    expect(USER_WRITE.test('await tx.user.upsert({ where })')).toBe(true);
    expect(USER_WRITE.test('await prisma.userPreference.create({ data })')).toBe(false);
  });
});

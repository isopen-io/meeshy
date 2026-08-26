/**
 * Garde de source — la présence est résolue par VIEWER, jamais par préférences seules.
 *
 * Directive du 2026-08-25 : hors amitié acceptée, soi ou ADMIN/BIGBOSS, ni `isOnline`
 * ni `lastActiveAt` d'un autre utilisateur ne sont servis. `resolvePrefsOnly` — la
 * résolution AVEUGLE au viewer (préférences du sujet seules) — était la porte par
 * laquelle listes de conversation, messages, communautés, stories et snapshot socket
 * contournaient l'amitié. Elle est SUPPRIMÉE, pas dépréciée : une porte laissée
 * ouverte est une porte réutilisée.
 *
 * Ce garde rougit si l'identifiant `resolvePrefsOnly` réapparaît hors tests — qu'il
 * soit DÉFINI, APPELÉ ou seulement CITÉ dans un doc-comment — sous
 * `services/gateway/src/`, ET sous `packages/shared/utils` / `packages/shared/types`,
 * où la loi partagée vit et où la mention survivait au premier balayage. Il ne
 * prétend pas vérifier qu'un site passe le BON viewer : c'est l'affaire des tests de
 * comportement de chaque route (ami ⇒ servie, non-ami ⇒ cachée, ADMIN ⇒ servie,
 * MODERATOR ⇒ cachée, anonyme ⇒ cachée).
 *
 * Une garde NÉGATIVE meurt en silence : elle reste verte si son balayage rend `[]`
 * (répertoire déplacé, filtre d'extension trop étroit, motif qui ne matche plus
 * rien). Les témoins POSITIFS ci-dessous prouvent que le balayage atteint bien les
 * fichiers qu'il prétend garder, et que le motif attrape bien ce qu'il interdit.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const GATEWAY_SRC = join(__dirname, '../..');
const REPO_ROOT = join(GATEWAY_SRC, '../../..');
const SHARED_ROOT = join(REPO_ROOT, 'packages/shared');
const SCANNED_ROOTS: readonly string[] = [
  GATEWAY_SRC,
  join(SHARED_ROOT, 'utils'),
  join(SHARED_ROOT, 'types'),
];
const FORBIDDEN = /\bresolvePrefsOnly\b/;
const SKIPPED_DIRS = new Set(['__tests__', 'node_modules', 'dist']);

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIPPED_DIRS.has(entry)) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return entry.endsWith('.ts') && !entry.endsWith('.d.ts') ? [full] : [];
  });
}

const scannedFiles = (): readonly string[] => SCANNED_ROOTS.flatMap(sourceFiles);

describe('garde — résolution de présence viewer-aware', () => {
  it('balaie bien les sources qu\'il prétend garder — le gateway ET la loi partagée', () => {
    const files = scannedFiles();

    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.endsWith('services/PresenceVisibilityService.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('packages/shared/utils/presence-visibility.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('packages/shared/utils/participant-helpers.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('packages/shared/types/role-types.ts'))).toBe(true);
  });

  it('interdit bien l\'identifiant, défini comme appelé', () => {
    expect(FORBIDDEN.test('resolvePrefsOnly(')).toBe(true);
    expect(FORBIDDEN.test('async resolvePrefsOnly(ids: string[])')).toBe(true);
    expect(FORBIDDEN.test('await this.resolvePrefsOnly(userIds)')).toBe(true);
    expect(FORBIDDEN.test('resolveForTargets(viewer, ids)')).toBe(false);
  });

  it('aucun `resolvePrefsOnly` ne subsiste hors tests — ni défini, ni appelé, ni cité', () => {
    const offenders = scannedFiles()
      .filter((file) => FORBIDDEN.test(readFileSync(file, 'utf8')))
      .map((file) => relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });
});

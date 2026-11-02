/**
 * Garde de source — le régime d'une conversation ne s'écrit qu'à UN endroit (#12949).
 *
 * Décision porteur du 2026-10-25 : une conversation chiffrée de bout en bout ne
 * repasse jamais en clair, par AUCUN chemin — route, admin, outil, migration.
 * La loi est tenue par `switchEncryptionRegime`
 * (`services/conversations/encryptionRegime.ts`), dont la condition MongoDB
 * refuse de quitter `e2ee`. Ce garde rougit si un autre site écrit un champ
 * du régime de `Conversation` (`encryptionMode`, `encryptionEnabledAt`,
 * `encryptionEnabledBy`, `encryptionProtocol`, `encryptionEpoch`) :
 * - sous `services/gateway/src/`, dans l'argument d'un appel
 *   `.conversation.update / updateMany / upsert` ;
 * - dans un script de base (`scripts/`, `infrastructure/scripts/`,
 *   `services/gateway/scripts/`), dans un `$set` ou un `$unset`.
 *
 * Une garde NÉGATIVE meurt en silence quand son balayage ne rend rien : les
 * témoins positifs prouvent que le balayage atteint les sites et que le motif
 * attrape ce qu'il interdit.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const GATEWAY_SRC = join(__dirname, '../../..');
const REPO_ROOT = join(GATEWAY_SRC, '../../..');
const SCRIPT_ROOTS = ['scripts', 'infrastructure/scripts', 'services/gateway/scripts'].map((dir) => join(REPO_ROOT, dir));
const THE_WRITER = 'services/conversations/encryptionRegime.ts';
const REGIME_FIELD = /\bencryption(?:Mode|EnabledAt|EnabledBy|Protocol|Epoch)\b/;
const CONVERSATION_WRITE = /\.conversation\s*\.\s*(?:update|updateMany|upsert)\s*\(/g;
const RAW_WRITE = /\$(?:set|unset)\s*:?\s*["']?\s*:?\s*\{[^}]*\}/g;
const SKIPPED_DIRS = new Set(['__tests__', 'node_modules', 'dist', '.git']);

function walk(root: string, accept: (path: string) => boolean): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return SKIPPED_DIRS.has(name) ? [] : walk(path, accept);
    return accept(path) ? [path] : [];
  });
}

const isSource = (path: string) => /\.ts$/.test(path) && !/\.(test|spec)\.ts$/.test(path) && !/\.d\.ts$/.test(path);
const isScript = (path: string) => /\.(js|mjs|cjs|ts|sh)$/.test(path) && !/\.test\.(js|mjs|ts)$/.test(path);

/** L'argument d'un appel, parenthèses équilibrées depuis l'ouverture. */
function callArgument(source: string, openIndex: number): string {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    if (source[index] === ')') depth -= 1;
    if (depth === 0) return source.slice(openIndex, index + 1);
  }
  return source.slice(openIndex);
}

export function conversationRegimeWrites(source: string): string[] {
  return [...source.matchAll(CONVERSATION_WRITE)]
    .map((match) => callArgument(source, (match.index ?? 0) + match[0].length - 1))
    .filter((argument) => REGIME_FIELD.test(argument));
}

export function rawRegimeWrites(source: string): string[] {
  return [...source.matchAll(RAW_WRITE)].map((match) => match[0]).filter((clause) => REGIME_FIELD.test(clause));
}

const gatewaySources = () => walk(GATEWAY_SRC, isSource);
const scripts = () => SCRIPT_ROOTS.flatMap((root) => walk(root, isScript));

describe('le balayage atteint ce qu’il garde', () => {
  it('lit les sources de la passerelle, dont l’écrivain unique et les écritures de conversation', () => {
    const files = gatewaySources().map((path) => relative(GATEWAY_SRC, path));
    expect(files).toContain(THE_WRITER);
    expect(files).toContain('routes/conversations/core-lifecycle.ts');
    const writing = gatewaySources().filter((path) => [...readFileSync(path, 'utf8').matchAll(CONVERSATION_WRITE)].length > 0);
    expect(writing.length).toBeGreaterThan(10);
  });

  it('lit les scripts de base, dont la migration 006 qui touchait encryptionMode', () => {
    const names = scripts().map((path) => relative(REPO_ROOT, path));
    expect(names).toContain('scripts/migrations/mongodb/006_remove_encryptionMode_from_message_attachment.js');
  });

  it('attrape une écriture du régime, multi-ligne ou brute', () => {
    expect(conversationRegimeWrites("await tx.conversation\n  .update({ where: { id }, data: { title, encryptionMode: null } })")).toHaveLength(1);
    expect(conversationRegimeWrites('prisma.conversation.updateMany({ where: { id }, data: { encryptionEnabledAt: null } })')).toHaveLength(1);
    expect(conversationRegimeWrites('prisma.conversation.update({ where: { id }, data: { title } })')).toHaveLength(0);
    expect(rawRegimeWrites('db.Conversation.updateMany({}, { $unset: { encryptionMode: "" } })')).toHaveLength(1);
    expect(rawRegimeWrites('db.Conversation.updateMany({}, { $set: { title: "x" } })')).toHaveLength(0);
  });
});

describe('le régime d’une conversation ne s’écrit qu’à un endroit (#12949)', () => {
  it('aucune source de la passerelle hors encryptionRegime.ts n’écrit un champ du régime', () => {
    const offenders = gatewaySources()
      .filter((path) => relative(GATEWAY_SRC, path) !== THE_WRITER)
      .flatMap((path) => {
        const source = readFileSync(path, 'utf8');
        return [...conversationRegimeWrites(source), ...rawRegimeWrites(source)].map((write) => `${relative(GATEWAY_SRC, path)}: ${write.slice(0, 160)}`);
      });
    expect(offenders).toEqual([]);
  });

  it('aucun script de base ne pose ni n’efface un champ du régime', () => {
    const offenders = scripts().flatMap((path) => rawRegimeWrites(readFileSync(path, 'utf8')).map((write) => `${relative(REPO_ROOT, path)}: ${write}`));
    expect(offenders).toEqual([]);
  });
});

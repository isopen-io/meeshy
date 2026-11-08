/**
 * #17068 — les deux PIÈGES ARMÉS de l'appariement d'accolades du balayage
 * « émission vivante avant enfilage », et ce que son `try` compte à tort.
 *
 * Aucun des deux n'est un défaut ACTUEL : tous deux sont mesurés inoffensifs
 * sur l'arbre d'aujourd'hui. Ce sont des pièges, et le dépôt a une règle pour
 * eux (cycle 84 : on ne laisse pas un piège armé au motif que personne n'a
 * encore marché dessus). Un cliquet TEXTUEL affirme plus qu'il ne vérifie, et
 * son vert est une assertion : ces témoins sont ce qui la vérifie.
 *
 * Les fixtures vivent dans un répertoire TEMPORAIRE, jamais dans `src/` : le
 * balayage y trouverait de vraies émissions non gardées et son inventaire —
 * qui doit rester VIDE — rougirait pour une fixture.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sweepUnguardedLiveEmissions } from './live-emission-before-enqueue-sweep';

let dir: string;

const write = (name: string, body: string) => writeFileSync(join(dir, name), body, 'utf8');

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'sweep-traps-'));

  // ── Piège 1 : une accolade DÉSÉQUILIBRÉE dans un littéral de REGEX ────────
  //
  // Précision que l'issue n'apporte pas, et qui compte : son exemple
  // `/\d{2}/` est ÉQUILIBRÉ — il porte `{` ET `}` — donc il ne casse rien.
  // Le déclencheur réel est une accolade SEULE : `/\{/`, `/[}]/`, `/^\}/` —
  // la forme qu'écrit toute regex qui reconnaît du JSON ou un gabarit.
  //
  // Ici le `{` de la première regex empêche le `}` du `try` de refermer son
  // bloc ; le `}` de la seconde le referme ENTRE l'émission et l'enfilage. La
  // fenêtre du `try` couvre donc l'émission sans couvrir l'enfilage, et
  // `guardedByTry` conclut « gardée » sur une émission qui ne l'est pas.
  //
  // Les deux littéraux sont INLINE, dans le flot. Ma première fixture les
  // déclarait en tête de fichier, au-dessus de la fonction : leurs accolades
  // ne pouvaient alors affecter AUCUNE fenêtre, et le témoin passait au vert
  // sur l'arbre d'avant — il attestait son harnais, pas le piège. Une fixture
  // de piège doit le faire TOMBER avant de prouver qu'on l'a fermé.
  write(
    'regex-brace.ts',
    [
      'export async function diffuseEtEnfile(io: any, queue: any, s: string) {',
      '  try {',
      "    if (/\\{/.test(s)) noop();",
      '  } catch { noop(); }',
      "  io.to('r').emit('message:new', {});",
      "  if (/\\}/.test(s)) noop();",
      '  await queue.enqueueForOfflineParticipants({});',
      '}',
      'function noop() {}',
    ].join('\n'),
  );

  // ── Piège 2 : un `try` qui n'ABSORBE pas ─────────────────────────────────
  //
  // `guardedByTry` ne regarde que la POSITION des blocs. Un `try`/`finally`
  // sans `catch`, et un `catch` qui re-lève, laissent l'exception emporter
  // l'enfilage — exactement comme sans `try`.
  write(
    'try-finally.ts',
    [
      'export async function finallySansCatch(io: any, queue: any) {',
      '  try {',
      "    io.to('r').emit('message:new', {});",
      '  } finally {',
      '    noop();',
      '  }',
      '  await queue.enqueueForOfflineParticipants({});',
      '}',
      'function noop() {}',
    ].join('\n'),
  );

  write(
    'try-rethrow.ts',
    [
      'export async function catchQuiReleve(io: any, queue: any) {',
      '  try {',
      "    io.to('r').emit('message:new', {});",
      '  } catch (error) {',
      '    throw error;',
      '  }',
      '  await queue.enqueueForOfflineParticipants({});',
      '}',
    ].join('\n'),
  );

  // ── Les TÉMOINS DE CONTRÔLE : ce que le balayage doit continuer à taire ──
  //
  // Sans eux, « resserrer la reconnaissance du `try` » se solde en signalant
  // toute garde écrite à la main, et le cliquet désignerait le correctif comme
  // le défaut — ce que son propre doc-comment interdit.
  write(
    'try-absorbant.ts',
    [
      'export async function catchQuiAbsorbe(io: any, queue: any, log: any) {',
      '  try {',
      "    io.to('r').emit('message:new', {});",
      '  } catch (error) {',
      "    log.warn('émission perdue', { error });",
      '  }',
      '  await queue.enqueueForOfflineParticipants({});',
      '}',
    ].join('\n'),
  );

  write(
    'try-catch-finally.ts',
    [
      'export async function catchEtFinally(io: any, queue: any, log: any) {',
      '  try {',
      "    io.to('r').emit('message:new', {});",
      '  } catch (error) {',
      "    log.warn('perdue', { error });",
      '  } finally {',
      '    noop();',
      '  }',
      '  await queue.enqueueForOfflineParticipants({});',
      '}',
      'function noop() {}',
    ].join('\n'),
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const filesReported = () => new Set(sweepUnguardedLiveEmissions(dir).map((f) => f.file));

describe('#17068 — le balayage ne se laisse plus tromper par son propre appariement', () => {
  it('piège 1 — une accolade seule dans une regex ne camoufle plus une émission non gardée', () => {
    expect(filesReported()).toContain('regex-brace.ts');
  });

  it("piège 2a — un `try`/`finally` SANS `catch` n'est pas une garde", () => {
    expect(filesReported()).toContain('try-finally.ts');
  });

  it("piège 2b — un `catch` qui RE-LÈVE n'est pas une garde", () => {
    expect(filesReported()).toContain('try-rethrow.ts');
  });

  it("contrôle — un `catch` qui ABSORBE reste une garde, avec ou sans `finally`", () => {
    const reported = filesReported();
    expect(reported).not.toContain('try-absorbant.ts');
    expect(reported).not.toContain('try-catch-finally.ts');
  });
});

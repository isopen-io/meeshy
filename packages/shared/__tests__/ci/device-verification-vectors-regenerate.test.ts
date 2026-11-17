// packages/shared/__tests__/ci/device-verification-vectors-regenerate.test.ts
//
// #19153, #19181 (#18906) — les vecteurs de l'ajout d'appareil par code se RÉGÉNÈRENT à
// l'octet depuis le dépôt seul : le script relit la table amont versée (`upstream/`),
// rejoue RFC 5869 A.1 et A.3 par trois chemins, signe les entrées du registre avec
// `@signalapp/libsignal-client` en REPRENANT les signatures déjà publiées (XEdDSA est
// aléatoire), et `--check` compare ce qu'il produit aux quatre fichiers versés. Un fichier
// retouché à la main, ou un script qui diverge de ses fichiers, rougit ici.
//
// libsignal se résout depuis `packages/shared` (`optionalDependencies`, même version que
// la passerelle, tenue par `libsignal-version-alignment.test.ts`) : l'installation de CI
// (`bun install`, sans `--omit=optional`) le pose, avec ses binaires précompilés. S'il
// manque, ce témoin ROUGIT — il ne se saute jamais : un générateur qu'on ne peut plus
// rejouer est un vecteur qu'on ne peut plus croire.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARED = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = join(SHARED, 'fixtures', 'e2ee-device-verification');
const SCRIPT = join(SHARED, 'scripts', 'generate-device-verification-vectors.mjs');
const MODULES = join(SHARED, 'scripts', 'device-verification-vectors');
const LIBSIGNAL = createRequire(join(SHARED, 'package.json')).resolve('@signalapp/libsignal-client');
const UPSTREAM_TABLE_SHA256 = '2b4defb276d61f11cb9cbfb0ba326b96a8dbd9e768e6bc53fa0f565cd598e887';
const UPSTREAM_LICENSE_SHA256 = '0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594';
const LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'pt-BR', 'ar'] as const;
const SAS_VECTORS_0A_SHA256 = '801831eb7ecc2f985edae8023774f5d3e9bc28fd7f874edd0de876101172fd97';
const SAS_EMOJI_0A_SHA256 = 'f6d74f7c199ba7b1419cf4d918120b768e9d3fc6e896afa8d2bc72815d0342de';
const EMISSION_CASES = [
  'emission-en-quarantaine-vue-de-N',
  'emission-de-celui-qui-rejoint-vue-de-R2',
  'X1-membre-non-confirme-n-admet-pas-vue-de-N',
  'X1-membre-confirme-admet-vue-de-N',
  'X2-l-enfant-d-une-racine-qui-rejoint-un-plus-ancien-vue-de-D',
  'X2-l-approbation-de-la-racine-arrive-vue-de-D',
  'X2-l-enfant-confirme-avec-le-plus-ancien-vue-de-D',
  'X4-le-voleur-a-tue-mes-appareils-chez-N-vue-de-N',
  'NEUF-1-approbation-posthume-d-une-cle-retiree-vue-de-N',
];

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJson = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
const runCheck = (script: string, cwd: string) =>
  spawnSync('node', [script, '--check'], { cwd, encoding: 'utf8', timeout: 120_000, env: { ...process.env, MEESHY_LIBSIGNAL_CLIENT: LIBSIGNAL } });

/** Une copie du script et de ses fixtures, pour prouver le rouge sans toucher au dépôt. */
function copiedTree(): { readonly root: string; readonly script: string; readonly fixtures: string } {
  const root = mkdtempSync(join(tmpdir(), 'device-verification-check-'));
  const fixtures = join(root, 'fixtures', 'e2ee-device-verification');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(SCRIPT, join(root, 'scripts', 'generate-device-verification-vectors.mjs'));
  cpSync(MODULES, join(root, 'scripts', 'device-verification-vectors'), { recursive: true });
  cpSync(FIXTURES, fixtures, { recursive: true });
  return { root, script: join(root, 'scripts', 'generate-device-verification-vectors.mjs'), fixtures };
}

describe('vecteurs de l’ajout d’appareil par code : comparaison et registre (#19153, #19181)', () => {
  it('libsignal se charge depuis packages/shared, à la version épinglée', () => {
    const manifest = JSON.parse(readFileSync(join(SHARED, 'package.json'), 'utf8')) as { optionalDependencies?: Record<string, string> };
    const installed = JSON.parse(readFileSync(join(LIBSIGNAL, '..', '..', 'package.json'), 'utf8')) as { version: string };
    expect(installed.version).toBe(manifest.optionalDependencies?.['@signalapp/libsignal-client']);
  });

  it('le script régénère les quatre fichiers à l’octet, sans réseau', () => {
    const run = runCheck(SCRIPT, SHARED);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('--check : les quatre fichiers versés sont identiques à l’octet');
  }, 130_000);

  it('un octet retouché dans un fichier versé fait échouer --check, en nommant le fichier', () => {
    const tree = copiedTree();
    try {
      const path = join(tree.fixtures, 'sas-v1.vectors.json');
      writeFileSync(path, readFileSync(path, 'utf8').replace('9780485edff4', '9780485edff5'));
      const run = runCheck(tree.script, tree.root);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('sas-v1.vectors.json');
    } finally {
      rmSync(tree.root, { recursive: true, force: true });
    }
  }, 130_000);

  it('une entrée du registre retouchée — un horodatage, ou une signature — fait échouer --check, en nommant le fichier', () => {
    const tamper = (from: string, to: string) => {
      const tree = copiedTree();
      try {
        const path = join(tree.fixtures, 'trust-ledger-v1.cases.json');
        const text = readFileSync(path, 'utf8');
        expect(text).toContain(from);
        writeFileSync(path, text.replace(from, to));
        return runCheck(tree.script, tree.root);
      } finally {
        rmSync(tree.root, { recursive: true, force: true });
      }
    };
    const ledger = readJson('trust-ledger-v1.cases.json') as { signatures: { positives: readonly { sig: string }[] } };
    const sig = ledger.signatures.positives[0]?.sig ?? '';
    const flippedSig = `${sig.slice(0, 10)}${sig[10] === 'A' ? 'B' : 'A'}${sig.slice(11)}`;
    [tamper('"approvedAt": 1790000000000,', '"approvedAt": 1790000000001,'), tamper(sig, flippedSig)].forEach((run) => {
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('trust-ledger-v1.cases.json');
    });
  }, 130_000);

  it('une table amont qui n’est pas la copie conforme relevée arrête le script', () => {
    const tree = copiedTree();
    try {
      const path = join(tree.fixtures, 'upstream', 'matrix-sas-emoji.json');
      writeFileSync(path, readFileSync(path, 'utf8').replace('"Dog"', '"Hound"'));
      const run = runCheck(tree.script, tree.root);
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain('source matrix-spec inattendue');
    } finally {
      rmSync(tree.root, { recursive: true, force: true });
    }
  }, 130_000);

  it('la table amont versée est la copie conforme relevée, et sa licence le texte Apache-2.0 amont', () => {
    expect(sha256(join(FIXTURES, 'upstream', 'matrix-sas-emoji.json'))).toBe(UPSTREAM_TABLE_SHA256);
    expect(sha256(join(FIXTURES, 'upstream', 'LICENSE'))).toBe(UPSTREAM_LICENSE_SHA256);
    expect(sha256(join(FIXTURES, 'LICENSE-sas-emoji.txt'))).toBe(UPSTREAM_LICENSE_SHA256);
    expect(readFileSync(join(FIXTURES, 'upstream', 'NOTICE.md'), 'utf8')).toContain(UPSTREAM_TABLE_SHA256);
  });

  it('la table dérivée dit sa source, sa modification par Meeshy et sa licence, et nomme 64 symboles dans les sept langues', () => {
    const table = readJson('sas-emoji-v1.json') as {
      readonly _doc: string;
      readonly source: { readonly sha256: string; readonly license: string };
      readonly modified: { readonly by: string; readonly changes: readonly string[] };
      readonly license: { readonly spdx: string; readonly file: string };
      readonly emoji: readonly { readonly number: number; readonly emoji: string; readonly names: Record<string, string> }[];
    };
    expect(table._doc).toContain('modifiée par Meeshy le 2026-11-17');
    expect(table.source).toMatchObject({ sha256: UPSTREAM_TABLE_SHA256, license: 'Apache-2.0' });
    expect(table.modified.by).toBe('Meeshy');
    expect(table.modified.changes.length).toBeGreaterThan(0);
    expect(table.license).toEqual({ spdx: 'Apache-2.0', file: 'LICENSE-sas-emoji.txt' });
    expect(table.emoji.map((entry) => entry.number)).toEqual(Array.from({ length: 64 }, (_, index) => index));
    table.emoji.forEach((entry) => {
      expect(Object.keys(entry.names).sort()).toEqual([...LANGUAGES].sort());
      LANGUAGES.forEach((language) => expect(entry.names[language]?.length ?? 0).toBeGreaterThan(0));
    });
  });

  it('le fichier de la comparaison garde sa forme publiée, et un carré qui lit des octets rejetés s’y ajoute', () => {
    const file = readJson('sas-v1.vectors.json') as Record<string, readonly unknown[] | unknown>;
    expect(file.protocol).toBe('meeshy-device-verification:v1');
    expect(Object.keys(file).sort()).toEqual(['_doc', 'negatives', 'options', 'primitives', 'properties', 'protocol', 'rfc5869', 'vectors'].sort());
    expect((file.rfc5869 as readonly { name: string }[]).map((vector) => vector.name)).toEqual(['rfc5869-A.1', 'rfc5869-A.3']);
    expect((file.vectors as readonly unknown[]).length).toBe(4);
    expect((file.properties as readonly unknown[]).length).toBe(2);
    expect((file.negatives as readonly unknown[]).length).toBe(18);
    expect((file.options as readonly { name: string }[]).map((option) => option.name)).toEqual(['carre-du-code-vecteur-1', 'carre-de-l-accuse-vecteur-1', 'carre-avec-rejet']);
  });

  it('les vecteurs de la comparaison versés par le lot 0a sont identiques à l’octet : seul le carré avec rejet s’ajoute', () => {
    const file = readJson('sas-v1.vectors.json') as { readonly options: readonly { readonly name: string }[] };
    const asPublishedBy0a = { ...file, options: file.options.filter((option) => option.name !== 'carre-avec-rejet') };
    const digest = createHash('sha256').update(`${JSON.stringify(asPublishedBy0a, null, 2)}\n`).digest('hex');
    expect(digest).toBe(SAS_VECTORS_0A_SHA256);
    expect(sha256(join(FIXTURES, 'sas-emoji-v1.json'))).toBe(SAS_EMOJI_0A_SHA256);
  });

  it('le carré avec rejet lit, aux deux étapes, des octets qu’un banc sans rejet garderait', () => {
    const file = readJson('sas-v1.vectors.json') as { readonly options: readonly { readonly name: string; readonly streamHex: string; readonly expected: { readonly bytesUsed: number } }[] };
    const square = file.options.find((option) => option.name === 'carre-avec-rejet');
    const read = Buffer.from(square?.streamHex ?? '', 'hex').subarray(0, square?.expected.bytesUsed ?? 0);
    expect([...read].filter((byte) => byte >= 252).length).toBeGreaterThan(0);
    expect([...read].filter((byte) => byte >= 240 && byte < 252).length).toBeGreaterThan(1);
  });

  it('le registre porte 85 cas, 8 + 12 vecteurs de signature, et ses attendus d’émission marqués « en revue »', () => {
    const ledger = readJson('trust-ledger-v1.cases.json') as {
      readonly signatures: { readonly positives: readonly unknown[]; readonly negatives: readonly unknown[] };
      readonly expectedFields: Record<string, string>;
      readonly cases: readonly { readonly name: string; readonly emissionInput?: unknown; readonly emissionStatus?: string; readonly expected: Record<string, unknown> }[];
    };
    expect(ledger.cases.length).toBe(85);
    expect(ledger.signatures.positives.length).toBe(8);
    expect(ledger.signatures.negatives.length).toBe(12);
    const emission = ledger.cases.filter((entry) => entry.emissionInput !== undefined);
    expect(emission.map((entry) => entry.name)).toEqual(EMISSION_CASES);
    emission.forEach((entry) => expect(entry.emissionStatus).toBe('en revue'));
    ledger.cases.filter((entry) => entry.emissionInput === undefined).forEach((entry) => {
      expect(entry.emissionStatus).toBeUndefined();
      expect(Object.keys(entry.expected)).not.toContain('transmits');
    });
    expect(ledger.expectedFields.emissionStatus).toContain('en revue');
  });
});

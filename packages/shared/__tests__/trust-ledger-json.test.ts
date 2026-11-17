// packages/shared/__tests__/trust-ledger-json.test.ts
//
// #19182 (#18906) — l'analyseur JSON STRICT du clair `d` du registre de confiance :
// spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`,
// § 6.2 (temps 0) et § 6.3. `JSON.parse` garde la DERNIÈRE de deux clés en double, lit
// `1.0` et `1e3` comme des entiers et `null` comme une valeur : trois lectures qu'un autre
// décodeur (Swift `decodeIfPresent`, kotlinx) ne fait pas de la même façon. Le texte reçu
// passe donc ici AVANT tout décodage, et chacune de ces formes refuse le contenu entier.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStrictLedgerJson, strictLedgerJsonProblem } from '../encryption/device-verification/index.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/e2ee-device-verification/', import.meta.url));

type RawCase = { readonly name: string; readonly messages: readonly { readonly raw?: string }[]; readonly expected: { readonly refusedContents: number } };
const ledger = JSON.parse(readFileSync(join(FIXTURES, 'trust-ledger-v1.cases.json'), 'utf8')) as { readonly cases: readonly RawCase[] };
const rawCases = ledger.cases.filter((entry) => entry.messages.some((message) => typeof message.raw === 'string'));

describe('le JSON strict du registre (§ 6.3, temps 0)', () => {
  it.each([
    ['{"a":1,"b":[0,10,"x",true,false,{}],"c":{"d":"\\u00e9"}}', null],
    ['  {"a" : [ ] }\n', null],
    ['{"a":null}', 'null'],
    ['[1,null]', 'null'],
    ['{"a":1,"a":2}', 'duplicate-key'],
    ['{"a":1,"\\u0061":2}', 'duplicate-key'],
    ['{"x":{"a":1,"b":{"a":2,"a":3}}}', 'duplicate-key'],
    ['{"a":1.0}', 'number'],
    ['{"a":1e3}', 'number'],
    ['{"a":1E3}', 'number'],
    ['{"a":-1}', 'number'],
    ['{"a":-0}', 'number'],
    ['{"a":01}', 'syntax'],
    ['{"a":1,}', 'syntax'],
    ['{"a":1} {}', 'syntax'],
    ['{"a":"\u0001"}', 'syntax'],
    ['{"a":"\\x"}', 'syntax'],
    ['{"a":tru}', 'syntax'],
    ['', 'syntax'],
  ] as const)('%s → %s', (text, problem) => {
    expect(strictLedgerJsonProblem(text)).toBe(problem);
  });

  it('un JSON profondément imbriqué se lit sans pile d’appels (analyse itérative)', () => {
    const deep = `${'['.repeat(200_000)}0${']'.repeat(200_000)}`;
    expect(strictLedgerJsonProblem(deep)).toBeNull();
    expect(strictLedgerJsonProblem(`${'['.repeat(200_000)}null${']'.repeat(200_000)}`)).toBe('null');
  });

  it('rend la valeur analysée quand le texte est strict, et la raison sinon', () => {
    expect(parseStrictLedgerJson('{"d":1,"approvals":[]}')).toEqual({ ok: true, value: { d: 1, approvals: [] } });
    expect(parseStrictLedgerJson('{"d":1,"d":2}')).toEqual({ ok: false, problem: 'duplicate-key' });
  });

  it.each(rawCases.map((entry) => [entry.name, entry] as const))('%s : le clair brut est refusé si et seulement si le cas l’attend', (_name, entry) => {
    const verdicts = entry.messages.filter((message) => typeof message.raw === 'string').map((message) => strictLedgerJsonProblem(message.raw as string));
    const refusedByJson = verdicts.filter((verdict) => verdict !== null).length;
    expect(refusedByJson).toBeLessThanOrEqual(entry.expected.refusedContents);
    if (entry.name === 'json-strict-accepte-le-contenu-sans-defaut') expect(verdicts).toEqual([null]);
    if (/^json-.*-refus(e|ee)$/.test(entry.name)) expect(refusedByJson).toBe(1);
  });

  it('huit cas portent un clair brut, et chaque refus de JSON s’y voit', () => {
    expect(rawCases.map((entry) => entry.name).sort()).toEqual([
      'json-cle-en-double-au-niveau-du-contenu-refusee',
      'json-cle-en-double-refusee',
      'json-nombre-a-exposant-refuse',
      'json-nombre-a-point-refuse',
      'json-nombre-signe-refuse',
      'json-null-refuse',
      'json-null-sur-fromSeq-d-une-migration-refuse',
      'json-strict-accepte-le-contenu-sans-defaut',
    ]);
  });
});

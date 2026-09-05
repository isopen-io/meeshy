/**
 * Le miroir de `response-schema-sweep` / `response-payload-mismatch` /
 * `response-schema-closure-guard` (#4863) : les trois répondent à « ce qui
 * PART est-il ⊆ ce qui est DÉCLARÉ ? ». Celui-ci répond à l'inverse — « ce
 * qui est DÉCLARÉ **`required`** est-il ⊆ ce qui PART ? » — la seule
 * inclusion qu'un champ ABSENT satisfait trivialement, et que les trois
 * cliquets existants ne peuvent donc jamais voir tomber.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import { scanFileForRequiredGaps, sweepRequiredFieldGaps } from './response-required-field-sweep';
import { readdirSync, statSync } from 'fs';

const ROUTES_DIR = join(__dirname, '..');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') walk(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * VIDE, mesuré à #4863 : zéro `required:` à l'intérieur d'un bloc
 * `response:` sur l'ensemble de `services/gateway/src/routes` (voir le
 * doc-comment de l'outil pour le compte complet et ce qui reste hors
 * périmètre). Quand ce cliquet tombe : une entrée EN TROP nomme un schéma de
 * réponse neuf qui déclare `required` sans que son producteur le pose — à
 * réparer, jamais à geler sans raison écrite.
 */
const FROZEN_REQUIRED_GAPS: readonly string[] = [];

describe('balayage — un champ `required` de schéma de réponse est POSÉ par son producteur', () => {
  it("n'introduit aucun champ requis manquant que l'inventaire gelé ne nomme pas", () => {
    const actual = sweepRequiredFieldGaps(ROUTES_DIR)
      .map((g) => `${g.file}|${g.field}|${g.statusCode}`)
      .sort();

    expect(actual).toEqual([...FROZEN_REQUIRED_GAPS].sort());
  });

  it('lit bien le répertoire — sans quoi il passerait au vert à vide (leçon 308)', () => {
    expect(walk(ROUTES_DIR).length).toBeGreaterThan(50);
  });
});

describe('balayage — ce que la détection sait discriminer', () => {
  const wrap = (schema: string, handler: string) => `
    fastify.get('/x', {
      schema: {
        response: {
          200: ${schema}
        }
      }
    }, async (request, reply) => {
      ${handler}
    });
  `;

  it('signale un champ `required` déclaré, ET dans `properties`, ET absent du littéral envoyé', () => {
    const source = wrap(
      `{ type: 'object', properties: { success: { type: 'boolean' }, data: {
          type: 'object', required: ['id', 'name'], properties: { id: { type: 'string' }, name: { type: 'string' } }
      } } }`,
      `sendSuccess(reply, { id: 'x1' });`
    );

    expect(scanFileForRequiredGaps(source, 'x.ts')).toEqual([
      { file: 'x.ts', line: expect.any(Number), field: 'name', statusCode: '200' },
    ]);
  });

  it('ne signale rien quand tous les champs requis sont envoyés', () => {
    const source = wrap(
      `{ type: 'object', properties: { data: {
          type: 'object', required: ['id'], properties: { id: { type: 'string' } }
      } } }`,
      `sendSuccess(reply, { id: 'x1' });`
    );

    expect(scanFileForRequiredGaps(source, 'x.ts')).toEqual([]);
  });

  it("ne signale pas un `required` que `properties` ne déclare même pas — c'est le défaut de l'AUTRE sens", () => {
    const source = wrap(
      `{ type: 'object', properties: { data: {
          type: 'object', required: ['ghost'], properties: { id: { type: 'string' } }
      } } }`,
      `sendSuccess(reply, { id: 'x1' });`
    );

    expect(scanFileForRequiredGaps(source, 'x.ts')).toEqual([]);
  });

  it("honore l'ordre `required` AVANT `properties` — le plus courant en JSON Schema", () => {
    // `response-payload-mismatch.ts` suppose `properties` immédiatement après
    // `data: {` (ou après `type: 'object',`) : cet ordre le raterait. Ce
    // balayage descend par ENTRÉES, pas par une regex à ordre fixe.
    const source = wrap(
      `{ type: 'object', properties: { data: {
          type: 'object', required: ['name'], properties: { id: { type: 'string' }, name: { type: 'string' } }
      } } }`,
      `sendSuccess(reply, { id: 'x1' });`
    );

    expect(scanFileForRequiredGaps(source, 'x.ts')).toEqual([
      { file: 'x.ts', line: expect.any(Number), field: 'name', statusCode: '200' },
    ]);
  });

  it('se tait sur une charge passée par une variable locale FERMÉE — elle résout, et le résultat est identique au littéral', () => {
    const source = `
      fastify.get('/x', {
        schema: { response: { 200: { type: 'object', properties: { data: {
          type: 'object', required: ['id', 'name'], properties: { id: { type: 'string' }, name: { type: 'string' } }
        } } } } }
      }, async (request, reply) => {
        const p = { id: 'x1' };
        sendSuccess(reply, p);
      });
    `;

    expect(scanFileForRequiredGaps(source, 'x.ts')).toEqual([
      { file: 'x.ts', line: expect.any(Number), field: 'name', statusCode: '200' },
    ]);
  });

  it('se tait sur un jeu OUVERT — reste de déstructuration (le champ manquant peut venir du spread)', () => {
    const source = `
      fastify.get('/x', {
        schema: { response: { 200: { type: 'object', properties: { data: {
          type: 'object', required: ['id', 'name'], properties: { id: { type: 'string' }, name: { type: 'string' } }
        } } } } }
      }, async (request, reply) => {
        const { success: _s, ...p } = result;
        sendSuccess(reply, p);
      });
    `;

    expect(scanFileForRequiredGaps(source, 'x.ts')).toEqual([]);
  });

  it('se tait sur une charge issue d’un appel de fonction — irrésolue par construction', () => {
    const source = wrap(
      `{ type: 'object', properties: { data: {
          type: 'object', required: ['id'], properties: { id: { type: 'string' } }
      } } }`,
      `sendSuccess(reply, buildPayload(x));`
    );

    expect(scanFileForRequiredGaps(source, 'x.ts')).toEqual([]);
  });

  it('se tait sur `sendSuccess(reply, undefined)` — aucune clé `data` ne part', () => {
    const source = wrap(
      `{ type: 'object', properties: { data: {
          type: 'object', required: ['id'], properties: { id: { type: 'string' } }
      } } }`,
      `sendSuccess(reply, undefined);`
    );

    expect(scanFileForRequiredGaps(source, 'x.ts')).toEqual([]);
  });

  it('se tait sur un schéma sans `data` du tout — rien à comparer', () => {
    const source = wrap(
      `{ type: 'object', properties: { success: { type: 'boolean' } } }`,
      `sendSuccess(reply, { id: 'x1' });`
    );

    expect(scanFileForRequiredGaps(source, 'x.ts')).toEqual([]);
  });
});

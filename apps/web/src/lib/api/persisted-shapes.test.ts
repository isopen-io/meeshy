import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import {
  LOCK_FILE,
  describePersistedShapes,
  judgePersistedShapes,
  judgeShapeChange,
  readCacheSchema,
  type PersistedShapesLock,
  type Shape,
  type ShapeField,
} from '../../../scripts/lib/persisted-shapes.mjs';

import { CACHE_SCHEMA } from './query-client';

/**
 * **UNE FORME RANGÉE NE CHANGE QU'AVEC `CACHE_SCHEMA`** (#18923).
 *
 * Le cache du lecteur survit aux versions de l'application : c'est `CACHE_SCHEMA`
 * seul qui le purge. L'empreinte des formes que le registre `PersistedShapes`
 * dérive des fabriques de requête est enregistrée sous le schéma courant
 * (`persisted-shapes.lock.json`). Ce témoin rougit dès qu'une forme change :
 * changement INCOMPATIBLE (un ancien cache ne se lirait plus) ⇒ incrémenter
 * `CACHE_SCHEMA` ; changement compatible ⇒ réenregistrer l'empreinte
 * (`node scripts/record-persisted-shapes.mjs`), pour que la comparaison suivante
 * parte de la forme que les lecteurs rangent réellement.
 */

const lock = JSON.parse(readFileSync(LOCK_FILE, 'utf8')) as PersistedShapesLock;

type Fields = Readonly<Record<string, ShapeField>>;

const field = (type: Shape, optional = false): ShapeField => ({ optional, type });
const object = (fields: Fields): Shape => ({ object: fields });
const primitive = (text: string): Shape => ({ primitive: text });
const tables = { old: {}, current: {} };

describe('le cache persisté ne change de forme qu’avec CACHE_SCHEMA', () => {
  test(
    'l’empreinte enregistrée est celle des fabriques, sous le schéma courant',
    () => {
      const verdict = judgePersistedShapes({ lock, current: describePersistedShapes(), schema: CACHE_SCHEMA });

      expect(verdict.problems).toEqual([]);
      expect(verdict.status).toBe('à-jour');
    },
    60_000,
  );

  test('le script d’enregistrement lit le même CACHE_SCHEMA que l’application', () => {
    expect(readCacheSchema()).toBe(CACHE_SCHEMA);
  });
});

describe('ce qu’un ancien cache supporte, et ce qu’il ne supporte pas', () => {
  const pageFields: Fields = { messages: field({ array: { ref: 'Message' } }), hasOlder: field(primitive('boolean')) };
  const page = object(pageFields);

  test('un champ OPTIONNEL ajouté se lit depuis un ancien cache', () => {
    const current = object({ ...pageFields, cursor: field(primitive('string'), true) });

    expect(judgeShapeChange(page, current, tables)).toEqual([]);
  });

  test('un champ REQUIS ajouté ne se lit pas : l’ancien cache ne le porte pas', () => {
    const current = object({ ...pageFields, nextCursor: field(primitive('string')) });

    expect(judgeShapeChange(page, current, tables)).toEqual(["nextCursor : champ requis absent de l'ancienne forme"]);
  });

  test('un champ devenu requis, un type changé ou un conteneur remplacé ne se lisent pas', () => {
    const before = object({ cursor: field(primitive('string'), true), total: field(primitive('number')), pages: field({ array: page }) });
    const after = object({ cursor: field(primitive('string')), total: field(primitive('string')), pages: field(page) });

    expect(judgeShapeChange(before, after, tables)).toHaveLength(3);
  });

  test('un littéral rangé se lit sous son type élargi, une union rétrécie ne le supporte pas', () => {
    expect(judgeShapeChange(primitive('"group"'), primitive('string'), tables)).toEqual([]);
    expect(judgeShapeChange({ union: [primitive('string'), primitive('null')] }, primitive('string'), tables)).toHaveLength(1);
  });

  test('sous le même schéma, un changement compatible demande un réenregistrement, un changement incompatible un incrément', () => {
    const recorded = { schema: 7, families: { thread: { named: 'Page' } }, types: { Page: page } };
    const compatible = { families: { thread: { named: 'Page' } }, types: { Page: object({ ...pageFields, cursor: field(primitive('string'), true) }) } };
    const incompatible = { families: { thread: { array: { named: 'Page' } } }, types: { Page: page } };

    expect(judgePersistedShapes({ lock: recorded, current: compatible, schema: 7 }).status).toBe('compatible');
    expect(judgePersistedShapes({ lock: recorded, current: incompatible, schema: 7 }).status).toBe('incompatible');
    expect(judgePersistedShapes({ lock: recorded, current: incompatible, schema: 8 }).status).toBe('schéma-incrémenté');
  });
});

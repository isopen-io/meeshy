import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type FieldKind = 'scalar' | 'relation' | 'composite';
type SchemaField = { name: string; kind: FieldKind; type: string };

const SCHEMA_PATH = resolve(__dirname, '../../../../../packages/shared/prisma/schema.prisma');

const blocksOf = (schema: string, keyword: 'model' | 'type'): ReadonlyMap<string, string[]> =>
  new Map(
    [...schema.matchAll(new RegExp(`^${keyword}\\s+(\\w+)\\s*\\{([\\s\\S]*?)^\\}`, 'gm'))].map((match) => [
      match[1],
      match[2].split('\n'),
    ]),
  );

const loadSchema = (): ReadonlyMap<string, ReadonlyMap<string, SchemaField>> => {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  const models = blocksOf(schema, 'model');
  const composites = blocksOf(schema, 'type');
  const kindOf = (type: string): FieldKind =>
    models.has(type) ? 'relation' : composites.has(type) ? 'composite' : 'scalar';
  const fieldsOf = (lines: string[]): ReadonlyMap<string, SchemaField> =>
    new Map(
      lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('@@'))
        .map((line) => line.split(/\s+/))
        .filter((tokens) => tokens.length >= 2)
        .map(([name, rawType]) => {
          const type = rawType.replace(/[?[\]]/g, '');
          return [name, { name, kind: kindOf(type), type }] as const;
        }),
    );
  return new Map([...models, ...composites].map(([name, lines]) => [name, fieldsOf(lines)]));
};

const SCHEMA = loadSchema();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nested = (field: SchemaField, value: unknown, path: string): string[] =>
  field.kind !== 'scalar' && isRecord(value) ? readShapeViolations(field.type, value, path) : [];

/**
 * Ce qu'un faux Prisma ne voit jamais : la FORME d'une lecture confrontée au
 * schéma. Un mock `jest.fn()` accepte n'importe quel argument, et `tsc` laisse
 * passer un objet transmis par variable — c'est ainsi qu'un `PostSelect`
 * (scalaires compris) a été passé sous `include` et que chaque
 * `GET /posts/:id` a rendu 500 en production (#6503). Le client Prisma est
 * remplacé par un stub sous jest et n'expose pas son DMMF à l'exécution : la
 * vérité lue est donc `schema.prisma` lui-même. Règles du moteur : `select` et
 * `include` exclusifs, `include` ne nomme que des relations, `select` ne nomme
 * que des champs du modèle, chaque relation imbriquée vérifiée contre SON
 * modèle.
 */
export function readShapeViolations(modelName: string, args: Record<string, unknown>, path = modelName): string[] {
  const fields = SCHEMA.get(modelName);
  if (!fields) return [`${path} : modèle inconnu du schéma (${modelName})`];
  const { select, include } = args;

  const exclusivity = select !== undefined && include !== undefined
    ? [`${path} : select et include ne peuvent pas coexister`]
    : [];

  const includeViolations = isRecord(include)
    ? Object.entries(include).flatMap(([key, value]) => {
        if (key === '_count') return [];
        const field = fields.get(key);
        if (!field) return [`${path}.include.${key} : champ inconnu du modèle ${modelName}`];
        if (field.kind !== 'relation') return [`${path}.include.${key} : scalaire interdit sous include`];
        return nested(field, value, `${path}.${key}`);
      })
    : [];

  const selectViolations = isRecord(select)
    ? Object.entries(select).flatMap(([key, value]) => {
        if (key === '_count') return [];
        const field = fields.get(key);
        if (!field) return [`${path}.select.${key} : champ inconnu du modèle ${modelName}`];
        return nested(field, value, `${path}.${key}`);
      })
    : [];

  return [...exclusivity, ...includeViolations, ...selectViolations];
}

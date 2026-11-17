import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/**
 * **L'EMPREINTE DES FORMES PERSISTÉES** (#18923) — lue par
 * `src/lib/api/persisted-shapes.test.ts` et réenregistrée par
 * `scripts/record-persisted-shapes.mjs`.
 *
 * Le compilateur TypeScript résout le registre `PersistedShapes`
 * (`src/lib/api/persisted-shapes.ts`) et en tire une description
 * STRUCTURELLE, stable et comparable : objets (champs triés, optionnels
 * marqués), tableaux, unions (membres triés), littéraux. Un type déclaré par
 * l'application web est décrit en entier ; un type venu d'ailleurs
 * (`@meeshy/shared`, une dépendance, une interface de la bibliothèque standard
 * comme `Date`) n'est nommé que par son nom — la frontière que
 * `decisions.md` (D-82, révision #18923) justifie.
 *
 * `judgeShapeChange` dit si l'ancienne forme reste LISIBLE par le code
 * courant : un champ optionnel ajouté l'est (un ancien cache ne le porte pas,
 * le code l'attend absent), un champ requis ajouté, un champ devenu requis, un
 * type changé ou un conteneur remplacé ne le sont pas.
 */

export const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const REGISTRY_FILE = path.join(WEB_ROOT, 'src', 'lib', 'api', 'persisted-shapes.ts');
export const LOCK_FILE = path.join(WEB_ROOT, 'src', 'lib', 'api', 'persisted-shapes.lock.json');
const QUERY_CLIENT_FILE = path.join(WEB_ROOT, 'src', 'lib', 'api', 'query-client.ts');
const WEB_SOURCES = path.join(WEB_ROOT, 'src') + path.sep;
const MAX_DEPTH = 24;

/** `CACHE_SCHEMA` tel que `query-client.ts` le déclare — lu dans la source, le
 * script d'enregistrement tournant sous Node sans transpiler TypeScript. */
export function readCacheSchema() {
  const match = /export const CACHE_SCHEMA = (\d+);/.exec(readFileSync(QUERY_CLIENT_FILE, 'utf8'));
  if (match === null) throw new Error('CACHE_SCHEMA introuvable dans query-client.ts');
  return Number(match[1]);
}

const isTypeScriptLib = (fileName) => /[\\/]typescript[\\/]lib[\\/]/.test(fileName);
const isTanStack = (fileName) => /[\\/]@tanstack[\\/]/.test(fileName);

function declaredIn(symbol) {
  return symbol?.declarations?.[0]?.getSourceFile().fileName ?? '';
}

function createChecker() {
  const configFile = ts.readConfigFile(path.join(WEB_ROOT, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, WEB_ROOT);
  const program = ts.createProgram([REGISTRY_FILE], { ...parsed.options, noEmit: true, types: [] });
  const source = program.getSourceFile(REGISTRY_FILE);
  if (source === undefined) throw new Error(`registre introuvable : ${REGISTRY_FILE}`);
  const registry = source.statements.find((statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === 'PersistedShapes');
  if (registry === undefined) throw new Error('le type PersistedShapes est absent du registre');
  return { checker: program.getTypeChecker(), registry };
}

/**
 * Décrire un type DÉCLARÉ PAR LE WEB en entier, et nommer les autres. Une
 * interface de la bibliothèque standard (`Date`, `Map`) est nommée ; un alias
 * de la bibliothèque (`Record`, `Readonly`) est résolu, sa forme étant celle
 * de ses arguments.
 */
function expands(type) {
  const alias = type.aliasSymbol;
  const symbol = type.getSymbol();
  const owner = alias ?? symbol;
  if (owner === undefined) return true;
  const file = declaredIn(owner);
  if (file === '') return true;
  if (file.startsWith(WEB_SOURCES) || isTanStack(file)) return true;
  if (isTypeScriptLib(file)) return alias !== undefined;
  return false;
}

const byJson = (left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right));

const ANONYMOUS = new Set(['__type', '__object']);

/**
 * La clé d'un type NOMMÉ décrit en entier : son fichier (relatif à `apps/web`)
 * et son nom avec ses arguments — deux homonymes de modules différents ne se
 * confondent pas, et l'empreinte ne porte aucun chemin propre à une machine.
 */
function namedKey(checker, type) {
  const owner = type.aliasSymbol ?? type.getSymbol();
  if (owner === undefined || ANONYMOUS.has(owner.name)) return null;
  const file = declaredIn(owner);
  const where = file.startsWith(WEB_ROOT) ? path.relative(WEB_ROOT, file).split(path.sep).join('/') : owner.name === 'InfiniteData' ? '@tanstack' : path.basename(file);
  return `${where}#${checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)}`;
}

function describeType(context, type, depth) {
  const { checker, types } = context;
  if (depth > MAX_DEPTH) return { deep: checker.typeToString(type) };
  if (type.isUnion()) return { union: type.types.map((member) => describeType(context, member, depth + 1)).sort(byJson) };
  if (type.isIntersection()) return { intersection: type.types.map((member) => describeType(context, member, depth + 1)).sort(byJson) };
  if (type.flags & (ts.TypeFlags.Primitive | ts.TypeFlags.Unknown | ts.TypeFlags.Any | ts.TypeFlags.Never | ts.TypeFlags.NonPrimitive | ts.TypeFlags.TypeParameter)) {
    return { primitive: checker.typeToString(type) };
  }
  if (checker.isTupleType(type)) return { tuple: checker.getTypeArguments(type).map((element) => describeType(context, element, depth + 1)) };
  if (checker.isArrayType(type)) return { array: describeType(context, checker.getTypeArguments(type)[0], depth + 1) };
  if (!expands(type)) return { ref: checker.symbolToString(type.aliasSymbol ?? type.getSymbol()) };
  if (type.getCallSignatures().length > 0) return { callable: checker.typeToString(type) };
  const key = namedKey(checker, type);
  if (key !== null && types.has(key)) return { named: key };
  if (key !== null) types.set(key, null);
  const fields = Object.fromEntries(
    checker
      .getPropertiesOfType(type)
      .map((property) => [
        property.name,
        {
          optional: (property.flags & ts.SymbolFlags.Optional) !== 0,
          type: describeType(context, checker.getTypeOfSymbol(property), depth + 1),
        },
      ])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const indexes = checker.getIndexInfosOfType(type).map((info) => ({ key: checker.typeToString(info.keyType), type: describeType(context, info.type, depth + 1) }));
  const shape = indexes.length === 0 ? { object: fields } : { object: fields, indexes };
  if (key === null) return shape;
  types.set(key, shape);
  return { named: key };
}

const sortedEntries = (map) => Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));

/**
 * La description courante : chaque famille du registre par nom (`families`),
 * et chaque type nommé du web décrit UNE fois (`types`), que les familles
 * désignent par `{ named }`.
 */
export function describePersistedShapes() {
  const { checker, registry } = createChecker();
  const context = { checker, types: new Map() };
  const shapes = checker.getTypeAtLocation(registry.name);
  const families = new Map(checker.getPropertiesOfType(shapes).map((family) => [family.name, describeType(context, checker.getTypeOfSymbol(family), 0)]));
  return { families: sortedEntries(families), types: sortedEntries(context.types) };
}

const sameShape = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const LITERAL_WIDENING = { string: /^".*"$/s, number: /^-?\d/, boolean: /^(true|false)$/ };

function primitiveFits(old, current) {
  if (old === current) return true;
  const widening = LITERAL_WIDENING[current];
  return widening !== undefined && widening.test(old);
}

/**
 * Les raisons pour lesquelles une donnée rangée sous l'ANCIENNE forme ne se
 * lit pas sous la forme COURANTE — vide quand elle se lit. Chaque raison porte
 * le chemin du champ en cause. `{ named }` se résout dans la table de SA
 * description ; une paire déjà en cours d'examen (type récursif) est admise.
 */
export function judgeShapeChange(old, current, tables, where = '', pending = new Set()) {
  if ('named' in old || 'named' in current) {
    const pair = `${old.named ?? JSON.stringify(old)}→${current.named ?? JSON.stringify(current)}`;
    if (pending.has(pair)) return [];
    const resolvedOld = 'named' in old ? tables.old[old.named] : old;
    const resolvedCurrent = 'named' in current ? tables.current[current.named] : current;
    if (resolvedOld === undefined || resolvedCurrent === undefined) return [`${where || '(racine)'} : type nommé introuvable (${pair})`];
    return judgeShapeChange(resolvedOld, resolvedCurrent, tables, where, new Set([...pending, pair]));
  }
  if (sameShape(old, current)) return [];
  if ('union' in old) return old.union.flatMap((member) => judgeShapeChange(member, current, tables, where, pending));
  if ('union' in current) {
    const fits = current.union.some((member) => judgeShapeChange(old, member, tables, where, pending).length === 0);
    return fits ? [] : [`${where || '(racine)'} : ${JSON.stringify(old)} n'entre dans aucun membre de l'union courante`];
  }
  if ('primitive' in old && 'primitive' in current) {
    return primitiveFits(old.primitive, current.primitive) ? [] : [`${where || '(racine)'} : ${old.primitive} devenu ${current.primitive}`];
  }
  if ('array' in old && 'array' in current) return judgeShapeChange(old.array, current.array, tables, `${where}[]`, pending);
  if ('object' in old && 'object' in current) {
    const fields = Object.entries(current.object).flatMap(([name, field]) => {
      const before = old.object[name];
      const at = where === '' ? name : `${where}.${name}`;
      if (before === undefined) return field.optional ? [] : [`${at} : champ requis absent de l'ancienne forme`];
      if (before.optional && !field.optional) return [`${at} : devenu requis`];
      return judgeShapeChange(before.type, field.type, tables, at, pending);
    });
    const oldIndexes = old.indexes ?? [];
    const indexes = (current.indexes ?? []).flatMap((index) => {
      const before = oldIndexes.find((candidate) => candidate.key === index.key);
      return before === undefined ? [] : judgeShapeChange(before.type, index.type, tables, `${where}[${index.key}]`, pending);
    });
    return [...fields, ...indexes];
  }
  return [`${where || '(racine)'} : ${JSON.stringify(old)} remplacé par ${JSON.stringify(current)}`];
}

/**
 * Le verdict de la garde. `à-jour` : la forme enregistrée est la forme
 * courante, sous le schéma courant. Sinon, ce qu'il faut faire : réenregistrer
 * (changement lisible par le code courant), incrémenter `CACHE_SCHEMA` puis
 * réenregistrer (changement illisible), ou réenregistrer après un incrément.
 */
export function judgePersistedShapes({ lock, current, schema }) {
  if (lock.schema !== schema) return { status: 'schéma-incrémenté', problems: [`CACHE_SCHEMA vaut ${schema}, l'empreinte a été enregistrée sous ${lock.schema}`] };
  if (sameShape(lock.families, current.families) && sameShape(lock.types, current.types)) return { status: 'à-jour', problems: [] };
  const tables = { old: lock.types, current: current.types };
  const families = [...new Set([...Object.keys(lock.families), ...Object.keys(current.families)])].sort();
  const problems = families.flatMap((family) => {
    const before = lock.families[family];
    const now = current.families[family];
    if (before === undefined || now === undefined) return [];
    return judgeShapeChange(before, now, tables).map((reason) => `${family} › ${reason}`);
  });
  if (problems.length > 0) return { status: 'incompatible', problems };
  return { status: 'compatible', problems: ['une forme persistée a changé, et un cache existant se lit encore : réenregistrez l’empreinte'] };
}

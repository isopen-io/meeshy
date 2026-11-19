/**
 * Recensement PAR EFFET des écritures qui rendent un membre actif (audit de
 * #19080, E1, #16188).
 *
 * La garde des portes de #17117 recensait les portes par leur APPEL à la loi
 * d'entrée : une porte qui ne l'appelait pas n'existait pas pour elle —
 * « restaurer pour moi » rallumait ainsi un troisième membre dans un
 * tête-à-tête chiffré sans qu'aucune garde rougisse. Ce recensement part de
 * l'EFFET : toute écriture Prisma sur `Participant` (appel direct du délégué,
 * ou écriture imbriquée par une relation) dont la donnée peut laisser
 * `isActive` à vrai.
 *
 * Le jugement est CONSERVATEUR : ce que l'analyse ne sait pas lire (donnée
 * calculée, décomposition d'un objet inconnu, constante ambiguë) compte comme
 * une activation. Une création sans `isActive` active (le défaut du schéma est
 * `true`) ; une mise à jour sans `isActive` n'active pas.
 */
import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

export type ParticipantWrite = {
  readonly file: string;
  readonly line: number;
  readonly operation: string;
  readonly activates: boolean;
};

type Kind = 'create' | 'update';
type ActiveEffect = 'unset' | 'false' | 'true' | 'unknown';

const DELEGATE_WRITES = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert', 'update', 'updateMany', 'updateManyAndReturn']);
const PLURAL_RELATIONS = new Set(['participants', 'participations']);
const SINGULAR_RELATION = 'participant';
const NESTED_WRITES = new Set(['create', 'createMany', 'connectOrCreate', 'upsert', 'update', 'updateMany', 'connect', 'set']);
const MAX_RESOLUTION_DEPTH = 8;
/**
 * #19688 — l'unité PARTAGÉE qui commet une rentrée. Trois portes ne commettent
 * plus par `prisma.participant.update(` mais par elle, et ce recensement « par
 * EFFET » a cessé de les voir le jour où elles ont changé de graphie : trois
 * écritures activantes ont quitté l'inventaire sans qu'il rougisse, et une
 * QUATRIÈME porte qui rallumerait une participation par cette fonction sans
 * appeler aucune loi d'entrée serait passée inaperçue — exactement le défaut de
 * #16188 que ce recensement existe pour attraper.
 *
 * Son premier argument porte un `data` comme un délégué Prisma : il se juge
 * donc comme une mise à jour, avec le même verdict conservateur.
 */
const REJOIN_COMMIT = 'commitParticipantRejoin';

const RAW_COLLECTION = 'Participant';
const RAW_COMMAND_WRITES = new Set(['insert', 'update', 'findAndModify']);
const RAW_DRIVER_WRITES = new Set([
  'insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne', 'bulkWrite', 'findOneAndUpdate', 'findOneAndReplace',
]);

const unwrap = (node: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node)
    ? unwrap(node.expression)
    : node;

const nameOf = (name: ts.PropertyName): string | undefined =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;

const propertyOf = (literal: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined => {
  const found = literal.properties.find((property) => ts.isPropertyAssignment(property) && nameOf(property.name) === name);
  return found && ts.isPropertyAssignment(found) ? found.initializer : undefined;
};

/** Les constantes du fichier, par nom ; un nom déclaré deux fois est ambigu, donc illisible. */
function constantsOf(source: ts.SourceFile): ReadonlyMap<string, ts.Expression | null> {
  const constants = new Map<string, ts.Expression | null>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0) {
      constants.set(node.name.text, constants.has(node.name.text) ? null : node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return constants;
}

const combine = (left: ActiveEffect, right: ActiveEffect): ActiveEffect => (left === right ? left : 'unknown');

function effectOf(expression: ts.Expression, constants: ReadonlyMap<string, ts.Expression | null>, depth: number): ActiveEffect {
  const node = unwrap(expression);
  if (depth > MAX_RESOLUTION_DEPTH) return 'unknown';
  if (ts.isIdentifier(node)) {
    const initializer = constants.get(node.text);
    return initializer ? effectOf(initializer, constants, depth + 1) : 'unknown';
  }
  if (ts.isConditionalExpression(node)) {
    return combine(effectOf(node.whenTrue, constants, depth + 1), effectOf(node.whenFalse, constants, depth + 1));
  }
  if (!ts.isObjectLiteralExpression(node)) return 'unknown';
  return node.properties.reduce<ActiveEffect>((state, property) => {
    if (ts.isSpreadAssignment(property)) {
      const spread = effectOf(property.expression, constants, depth + 1);
      return spread === 'unset' ? state : spread;
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === 'isActive') return 'unknown';
    if (!ts.isPropertyAssignment(property) || nameOf(property.name) !== 'isActive') return state;
    const value = unwrap(property.initializer);
    if (value.kind === ts.SyntaxKind.FalseKeyword) return 'false';
    if (value.kind === ts.SyntaxKind.TrueKeyword) return 'true';
    return 'unknown';
  }, 'unset');
}

function dataActivates(
  data: ts.Expression | undefined,
  kind: Kind,
  constants: ReadonlyMap<string, ts.Expression | null>,
): boolean {
  if (!data) return true;
  const node = unwrap(data);
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.some((element) => ts.isSpreadElement(element) || dataActivates(element, kind, constants));
  }
  if (ts.isIdentifier(node)) {
    const initializer = constants.get(node.text);
    if (initializer && ts.isArrayLiteralExpression(unwrap(initializer))) return dataActivates(initializer, kind, constants);
  }
  const effect = effectOf(node, constants, 0);
  if (effect === 'false') return false;
  if (effect === 'unset') return kind === 'create';
  return true;
}

const asLiteral = (
  expression: ts.Expression | undefined,
  constants: ReadonlyMap<string, ts.Expression | null>,
  depth = 0,
): ts.ObjectLiteralExpression | undefined => {
  const node = expression && unwrap(expression);
  if (!node || depth > MAX_RESOLUTION_DEPTH) return undefined;
  if (ts.isIdentifier(node)) return asLiteral(constants.get(node.text) ?? undefined, constants, depth + 1);
  return ts.isObjectLiteralExpression(node) ? node : undefined;
};

const eachItem = (expression: ts.Expression): readonly ts.Expression[] => {
  const node = unwrap(expression);
  return ts.isArrayLiteralExpression(node) ? node.elements.map((element) => (ts.isSpreadElement(element) ? element.expression : element)) : [node];
};

function delegateWriteActivates(
  operation: string,
  argument: ts.Expression | undefined,
  constants: ReadonlyMap<string, ts.Expression | null>,
): boolean {
  const literal = asLiteral(argument, constants);
  if (!literal) return true;
  if (operation === 'upsert') {
    return dataActivates(propertyOf(literal, 'create'), 'create', constants)
      || dataActivates(propertyOf(literal, 'update'), 'update', constants);
  }
  return dataActivates(propertyOf(literal, 'data'), operation.startsWith('create') ? 'create' : 'update', constants);
}

function nestedWriteActivates(
  operation: string,
  value: ts.Expression,
  plural: boolean,
  constants: ReadonlyMap<string, ts.Expression | null>,
): boolean {
  if (operation === 'connect' || operation === 'set') return plural;
  if (operation === 'create') return dataActivates(value, 'create', constants);
  return eachItem(value).some((item) => {
    const literal = asLiteral(item, constants);
    if (!literal) return true;
    if (operation === 'createMany') return dataActivates(propertyOf(literal, 'data'), 'create', constants);
    if (operation === 'connectOrCreate') return dataActivates(propertyOf(literal, 'create'), 'create', constants);
    if (operation === 'upsert') {
      return dataActivates(propertyOf(literal, 'create'), 'create', constants)
        || dataActivates(propertyOf(literal, 'update'), 'update', constants);
    }
    return dataActivates(propertyOf(literal, 'data'), 'update', constants);
  });
}

const isParticipantCollection = (node: ts.Expression, constants: ReadonlyMap<string, ts.Expression | null>, depth = 0): boolean => {
  const target = unwrap(node);
  if (depth > MAX_RESOLUTION_DEPTH) return false;
  if (ts.isIdentifier(target)) {
    const initializer = constants.get(target.text);
    return initializer ? isParticipantCollection(initializer, constants, depth + 1) : false;
  }
  const call = ts.isAwaitExpression(target) ? unwrap(target.expression) : target;
  return ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression)
    && call.expression.name.text === 'collection'
    && call.arguments.length > 0 && ts.isStringLiteralLike(call.arguments[0]) && call.arguments[0].text === RAW_COLLECTION;
};

/**
 * Une écriture BRUTE de la collection (`$runCommandRaw`, pilote MongoDB) :
 * l'analyse n'en lit pas la donnée, elle compte donc toujours comme une
 * activation.
 */
function rawWriteOf(node: ts.Node, constants: ReadonlyMap<string, ts.Expression | null>): string | undefined {
  if (ts.isPropertyAssignment(node)) {
    const command = nameOf(node.name);
    const value = unwrap(node.initializer);
    return command && RAW_COMMAND_WRITES.has(command) && ts.isStringLiteralLike(value) && value.text === RAW_COLLECTION
      ? `raw.${command}`
      : undefined;
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && RAW_DRIVER_WRITES.has(node.expression.name.text) && isParticipantCollection(node.expression.expression, constants)) {
    return `raw.${node.expression.name.text}`;
  }
  return undefined;
}

/**
 * L'appel de l'unité partagée de rentrée, sous ses deux graphies — nue, et avec
 * ses arguments de type (`commitParticipantRejoin<ParticipantRow>(…)`). La
 * DÉCLARATION de la fonction n'est pas un appel, donc elle ne compte pas.
 */
const isRejoinCommit = (expression: ts.Expression): boolean => {
  const callee = unwrap(expression);
  if (ts.isIdentifier(callee)) return callee.text === REJOIN_COMMIT;
  return ts.isPropertyAccessExpression(callee) && callee.name.text === REJOIN_COMMIT;
};

/** Les écritures de `Participant` d'un texte source, avec leur verdict d'activation. */
export function participantWritesOf(file: string, text: string): readonly ParticipantWrite[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const constants = constantsOf(source);
  const writes: ParticipantWrite[] = [];
  const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const visit = (node: ts.Node): void => {
    const raw = rawWriteOf(node, constants);
    if (raw) writes.push({ file, line: lineOf(node), operation: raw, activates: true });
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && DELEGATE_WRITES.has(node.expression.name.text)
      && ts.isPropertyAccessExpression(node.expression.expression)
      && node.expression.expression.name.text === SINGULAR_RELATION) {
      const operation = node.expression.name.text;
      writes.push({ file, line: lineOf(node), operation, activates: delegateWriteActivates(operation, node.arguments[0], constants) });
    }
    if (ts.isCallExpression(node) && isRejoinCommit(node.expression)) {
      writes.push({
        file,
        line: lineOf(node),
        operation: REJOIN_COMMIT,
        activates: delegateWriteActivates('update', node.arguments[0], constants),
      });
    }
    if (ts.isPropertyAssignment(node)) {
      const relation = nameOf(node.name);
      const plural = relation !== undefined && PLURAL_RELATIONS.has(relation);
      const nested = asLiteral(node.initializer, constants);
      if (nested && (plural || relation === SINGULAR_RELATION)) {
        nested.properties.forEach((property) => {
          const operation = ts.isPropertyAssignment(property) ? nameOf(property.name) : undefined;
          if (!operation || !NESTED_WRITES.has(operation) || !ts.isPropertyAssignment(property)) return;
          if (!plural && (operation === 'connect' || operation === 'set')) return;
          writes.push({
            file,
            line: lineOf(property),
            operation: `${relation}.${operation}`,
            activates: nestedWriteActivates(operation, property.initializer, plural, constants),
          });
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return writes;
}

function productionFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : productionFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts') ? [path] : [];
  });
}

/** Le recensement de tout le code de production sous `root`. */
export function participantWritesUnder(root: string): readonly ParticipantWrite[] {
  return productionFiles(root).flatMap((path) => participantWritesOf(relative(root, path), readFileSync(path, 'utf8')));
}

/** Le nombre d'écritures ACTIVANTES par fichier. */
export function activatingWritesByFile(writes: readonly ParticipantWrite[]): Readonly<Record<string, number>> {
  return writes
    .filter((write) => write.activates)
    .reduce<Record<string, number>>((counts, write) => ({ ...counts, [write.file]: (counts[write.file] ?? 0) + 1 }), {});
}

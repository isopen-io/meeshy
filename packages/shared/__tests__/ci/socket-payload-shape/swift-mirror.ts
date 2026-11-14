// packages/shared/__tests__/ci/socket-payload-shape/swift-mirror.ts
//
// La LECTURE du miroir SWIFT — pendant de `mirror-contract.ts`, qui lit le
// miroir Kotlin. Le CONTRAT, lui, n'est lu qu'une fois : `readContract()` est
// importée depuis ce voisin, jamais recopiée (#18121).
//
// ─── Ce qu'il y a à lire, et pourquoi c'est mécanisable ───────────────────
//
// Le câblage iOS n'a que DEUX idiomes, et c'est une mesure (2026-11-14) :
//
//   · `m.route(.event, Type.self) { … }` — la route DÉCODÉE, seule forme qui
//     nomme un type, donc la seule confrontable ;
//   · `.raw(.event) { data in … }` — décodage manuel, aiguillage sur une clé.
//
// Les onze `socket.on(…)` du SDK portent tous `clientEvent:` (connect,
// disconnect, reconnect, error) : ce sont les événements de Socket.IO lui-même,
// pas des charges du contrat. Il n'y a donc pas de troisième idiome à suivre —
// là où le miroir Kotlin en a cinq dont la garde ne voit que trois (#18123).
//
// ─── La règle appliquée, et son symptôme ──────────────────────────────────
//
// Une propriété STOCKÉE, NON-OPTIONNELLE, SANS valeur par défaut, dans un type
// dont l'`init(from:)` est SYNTHÉTISÉ, est exigée au décodage : son absence
// lève `keyNotFound`, que le `catch` de la route avale. La trame entière est
// perdue, en silence — exactement la panne de #18069 côté Android, et celle de
// #18120 côté iOS.
//
// ─── Les trois formes que la lecture ÉCARTE, et qu'elle ÉNUMÈRE ───────────
//
// Elles sont rendues, pas tues : un trou qu'on ne compte pas se referme sur
// celui qui croit la garde complète.
//
//   1. **Les routes `.raw`** n'ont pas de type unique — elles aiguillent sur
//      une clé de la charge. C'est là que vit la divergence de #18120, donc la
//      forme la plus coûteuse est aussi la moins mécanisable.
//   2. **Les `init(from:)` MANUELS.** Un init manuel n'est PAS une preuve de
//      tolérance : c'est par un `try c.decode(APIAuthor.self, forKey: .author)`
//      manuel que passe l'un des pièges de #18120. Les analyser demanderait de
//      lire leur corps ; la garde les met de côté en le DISANT.
//   3. **Les propriétés CALCULÉES** (`var x: T { … }`) ne sont pas décodées ;
//      elles ne sont pas un trou, elles ne sont simplement pas du sujet.
//
// Les contrats `unknown` ne sont pas une quatrième forme : mesuré le
// 2026-11-14, AUCUN des 176 événements de `ServerToClientEvents` n'a une
// charge opaque à la racine. Les `unknown` du contrat
// (`AttachmentUpdatedEventData.attachment`) sont des champs IMBRIQUÉS, hors du
// critère « premier niveau » que cette garde partage avec sa jumelle (#18116).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import { REPO } from './mirror-contract';

export const SWIFT_ROOTS = ['packages/MeeshySDK/Sources/MeeshySDK', 'apps/ios/Meeshy'] as const;

export const SOCKET_EVENT_SWIFT = 'packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketEvent.swift';

/**
 * Mesuré à 159 couples le 2026-11-14. Seuil volontairement BAS, pour la raison
 * qu'écrit déjà `MINIMUM_ROUTES` côté Kotlin : il ne mesure pas la couverture,
 * il détecte le balayage VIDE — le seul mode de panne silencieux d'une garde
 * qui déduit sa table.
 */
export const MINIMUM_SWIFT_ROUTES = 120;

/**
 * Les événements du contrat réellement confrontés, mesurés le 2026-11-14 — à comparer aux 176 que
 * `ServerToClientEvents` déclare, et aux 110 que la garde Kotlin atteint. Le chiffre vit ICI pour
 * qu'une extension de la lecture ait un endroit où se voir monter, plutôt qu'une prose à vieillir.
 */
export const SWIFT_SWEPT_EVENTS_AT_LAST_MEASURE = 154;

export type SwiftProperty = {
  /** La clé du FIL : le `CodingKeys` s'il existe, sinon le nom Swift. */
  readonly name: string;
  readonly swiftName: string;
  readonly type: string;
  readonly optional: boolean;
  readonly hasDefault: boolean;
};

export type SwiftType = {
  readonly name: string;
  readonly file: string;
  readonly properties: readonly SwiftProperty[];
  /** `init(from:)` écrit à la main — ici ou dans une extension du même module. */
  readonly customDecoder: boolean;
};

export type SwiftRoute = {
  readonly file: string;
  readonly caseName: string;
  readonly event: string | undefined;
  /** Le type décodé, quand la route en nomme UN seul — `route(…, T.self)`, ou un `.raw` à une branche. */
  readonly typeName: string | undefined;
  readonly kind: 'decoding' | 'raw';
  /**
   * Les types qu'une route `.raw` décode dans sa fermeture. Une route `.raw` à PLUSIEURS branches
   * aiguille une charge à plusieurs portées sur une clé ; c'est là que vit #18120, et c'est la seule
   * forme où le NOMBRE de branches veut dire quelque chose.
   */
  readonly candidates: readonly string[];
};

const TEST_MARKERS: readonly string[] = ['/Tests/', 'Tests.swift', 'Test.swift'];

const swiftFiles = (root: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) swiftFiles(path, out);
    else if (extname(path) === '.swift' && !TEST_MARKERS.some((marker) => path.includes(marker))) out.push(path);
  }
  return out;
};

/** Le `[^:]` épargne le `//` d'une URL — même précaution que les gardes voisines. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/**
 * Fin d'un corps `{ … }`, en SAUTANT les littéraux de chaîne : une accolade
 * dans un texte ne ferme rien, et un corps mal fermé décalerait toutes les
 * déclarations suivantes du fichier.
 */
const closingBraceIndex = (source: string, openAt: number): number => {
  let depth = 1;
  let index = openAt;
  while (index < source.length && depth > 0) {
    const char = source[index];
    if (char === '"') {
      index += 1;
      while (index < source.length && source[index] !== '"') index += source[index] === '\\' ? 2 : 1;
    } else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    index += 1;
  }
  return index - 1;
};

type Declaration = { readonly name: string; readonly bodyStart: number; readonly bodyEnd: number };

const DECLARATION = /\b(?:struct|class|enum|actor)\s+(\w+)\s*(?:<[^>\n]*>)?\s*(?::[^{\n]*)?\{/g;

/**
 * Les EXTENSIONS comptent, et ce n'est pas une précaution de principe : `APIMessage` — le type de
 * `message:new`, la charge la plus chargée du contrat — est déclaré `struct APIMessage: Sendable`,
 * et c'est une extension qui porte sa conformité `Decodable` ET son `init(from:)` manuel. Les
 * ignorer aurait fait passer ce type pour synthétisé, donc soumis à une règle qui ne le gouverne
 * pas. Pour la même raison, la garde ne FILTRE pas sur la conformité vue à la déclaration : elle
 * aurait écarté exactement ce type-là.
 */
const EXTENSION = /\bextension\s+([\w.]+)\s*(?:<[^>\n]*>)?\s*(?::[^{\n]*)?\{/g;

const declarations = (source: string): readonly Declaration[] => {
  const found: Declaration[] = [];
  const pattern = new RegExp(DECLARATION.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const bodyStart = pattern.lastIndex;
    found.push({ name: match[1], bodyStart, bodyEnd: closingBraceIndex(source, bodyStart) });
  }
  return found;
};

/** Le corps PROPRE d'un type : le sien, moins celui de ses types imbriqués. */
const ownBody = (source: string, declaration: Declaration, all: readonly Declaration[]): string => {
  const nested = all.filter(
    (other) => other !== declaration && other.bodyStart > declaration.bodyStart && other.bodyEnd <= declaration.bodyEnd,
  );
  let body = '';
  let cursor = declaration.bodyStart;
  for (const child of nested.filter((child) => !nested.some((other) => other !== child && child.bodyStart > other.bodyStart && child.bodyEnd <= other.bodyEnd))) {
    body += source.slice(cursor, child.bodyStart);
    cursor = child.bodyEnd + 1;
  }
  return body + source.slice(cursor, declaration.bodyEnd);
};

const PROPERTY =
  /^(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|internal|private|fileprivate|package)(?:\(set\))?\s+)*(?<storage>static\s+|class\s+|lazy\s+)?(?:let|var)\s+(?<name>\w+)\s*:\s*(?<rest>.+)$/;

const parseProperties = (body: string): readonly SwiftProperty[] => {
  const properties: SwiftProperty[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    const matched = PROPERTY.exec(line);
    if (!matched?.groups || matched.groups.storage) continue;
    const rest = matched.groups.rest;
    const braceAt = rest.indexOf('{');
    /* `{ didSet`/`{ willSet` observe une propriété STOCKÉE ; tout autre `{` ouvre un calcul. */
    if (braceAt >= 0 && !/\{\s*(didSet|willSet)/.test(rest)) continue;
    const beforeBrace = braceAt >= 0 ? rest.slice(0, braceAt) : rest;
    const equalsAt = beforeBrace.search(/(^|[^=!<>])=(?!=)/);
    const type = (equalsAt >= 0 ? beforeBrace.slice(0, equalsAt + 1) : beforeBrace).trim();
    properties.push({
      name: matched.groups.name,
      swiftName: matched.groups.name,
      type,
      optional: /[?!]$/.test(type) || /^Optional</.test(type),
      hasDefault: equalsAt >= 0,
    });
  }
  return properties;
};

/** `case a = "b"` et `case a, b, c` — la forme nue garde le nom Swift comme clé du fil. */
const codingKeys = (body: string): ReadonlyMap<string, string> => {
  const keys = new Map<string, string>();
  for (const line of body.split('\n')) {
    const cases = line.trim().match(/^case\s+(.+)$/);
    if (!cases) continue;
    for (const entry of cases[1].split(',')) {
      const renamed = entry.trim().match(/^(\w+)\s*=\s*"([^"]+)"$/);
      if (renamed) keys.set(renamed[1], renamed[2]);
      else {
        const plain = entry.trim().match(/^(\w+)$/);
        if (plain) keys.set(plain[1], plain[1]);
      }
    }
  }
  return keys;
};

/**
 * Les types qu'une fermeture décode — en suivant UN niveau d'indirection.
 *
 * Trois routes `.raw` du SDK ne décodent pas sur place : elles délèguent à un gestionnaire nommé
 * (`m?.handleConversationLifecyclePayload(data)`), qui porte le `decode`. S'arrêter à la fermeture
 * les aurait rangées parmi les routes « sans type nommé », donc hors confrontation — alors que leur
 * charge est parfaitement nommée, un cran plus bas. On suit donc le relais, et UN seul cran : au
 * deuxième, il faudrait un graphe d'appels, et une garde qui approxime un graphe d'appels se trompe
 * en silence. Ce qui reste hors de portée est ÉNUMÉRÉ par la garde, jamais supposé vide.
 */
const decodedTypes = (body: string, source: string): readonly string[] => {
  const inline = [...new Set([...body.matchAll(/\bdecode\(\s*(\w+)\.self/g)].map((hit) => hit[1]))];
  if (inline.length > 0) return inline;
  const relayed = new Set<string>();
  for (const call of body.matchAll(/\.(\w+)\(\s*data\s*\)/g)) {
    const handler = new RegExp(`\\bfunc\\s+${call[1]}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
    if (!handler) continue;
    const start = (handler.index as number) + handler[0].length;
    for (const hit of source.slice(start, closingBraceIndex(source, start)).matchAll(/\bdecode\(\s*(\w+)\.self/g)) {
      relayed.add(hit[1]);
    }
  }
  return [...relayed];
};

export const readSwift = () => {
  const files = SWIFT_ROOTS.flatMap((root) => swiftFiles(join(REPO, root)));
  const types = new Map<string, SwiftType>();
  const ambiguous = new Set<string>();
  const customDecoders = new Set<string>();

  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const all = declarations(source);
    /* Un `init(from:)` posé par une extension décode AUSSI à la main — voir [EXTENSION]. */
    const extensionPattern = new RegExp(EXTENSION.source, 'g');
    let extended: RegExpExecArray | null;
    while ((extended = extensionPattern.exec(source)) !== null) {
      const body = source.slice(extensionPattern.lastIndex, closingBraceIndex(source, extensionPattern.lastIndex));
      if (/\binit\s*\(\s*from\s+\w*\s*:/.test(body)) {
        customDecoders.add(extended[1].split('.').pop() as string);
      }
    }
    for (const declaration of all) {
      const body = ownBody(source, declaration, all);
      if (/\binit\s*\(\s*from\s+\w*\s*:/.test(body)) customDecoders.add(declaration.name);
      const nestedKeys = all.find(
        (other) =>
          other.name === 'CodingKeys' && other.bodyStart > declaration.bodyStart && other.bodyEnd <= declaration.bodyEnd,
      );
      const keys = nestedKeys ? codingKeys(source.slice(nestedKeys.bodyStart, nestedKeys.bodyEnd)) : new Map();
      const properties = parseProperties(body).map((property) => ({
        ...property,
        name: keys.get(property.swiftName) ?? property.swiftName,
      }));
      if (types.has(declaration.name)) ambiguous.add(declaration.name);
      types.set(declaration.name, { name: declaration.name, file, properties, customDecoder: false });
    }
  }

  const events = new Map(
    [...stripComments(readFileSync(join(REPO, SOCKET_EVENT_SWIFT), 'utf8')).matchAll(/case\s+(\w+)\s*=\s*"([^"]+)"/g)].map(
      (match) => [match[1], match[2]] as const,
    ),
  );

  const routes: SwiftRoute[] = [];
  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(/\broute\(\s*\.(\w+)\s*,\s*(\w+)\.self/g)) {
      routes.push({
        file,
        caseName: match[1],
        event: events.get(match[1]),
        typeName: match[2],
        kind: 'decoding',
        candidates: [match[2]],
      });
    }
    for (const match of source.matchAll(/\braw\(\s*\.(\w+)\s*\)\s*\{/g)) {
      const bodyStart = (match.index as number) + match[0].length;
      const body = source.slice(bodyStart, closingBraceIndex(source, bodyStart));
      const candidates = decodedTypes(body, source);
      routes.push({
        file,
        caseName: match[1],
        event: events.get(match[1]),
        /* Une seule branche ⇒ la route NOMME sa charge, donc elle rejoint la confrontation ordinaire. */
        typeName: candidates.length === 1 ? candidates[0] : undefined,
        kind: 'raw',
        candidates,
      });
    }
  }

  const resolveType = (name: string | undefined): SwiftType | undefined => {
    if (name === undefined) return undefined;
    const found = types.get(name);
    if (!found) return undefined;
    return { ...found, customDecoder: customDecoders.has(name) };
  };

  return { routes, resolveType, typeCount: types.size, ambiguousTypeNames: [...ambiguous].sort(), eventCount: events.size };
};

/**
 * « Exigé au décodage » au sens de Swift : une propriété stockée non-optionnelle et sans valeur
 * par défaut, dans un type à `init(from:)` synthétisé. Un `T!` compte comme optionnel — la
 * synthèse y emploie `decodeIfPresent` —, et c'est dit plutôt que supposé.
 */
export const isSwiftRequired = (property: SwiftProperty): boolean => !property.optional && !property.hasDefault;

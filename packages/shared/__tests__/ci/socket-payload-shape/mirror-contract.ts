// packages/shared/__tests__/ci/socket-payload-shape/mirror-contract.ts
//
// L'EXTRACTEUR partagé des deux gardes de forme des charges socket.
//
// Il rend trois choses, et rien d'autre : les ROUTES déduites du Kotlin (le
// couple « nom d'événement → classe de charge »), le CONTRAT résolu par le
// compilateur TypeScript (« quelles clés `ServerToClientEvents` déclare, et
// lesquelles sont optionnelles »), et de quoi les confronter.
//
// ─── Pourquoi un module, et pas deux copies ────────────────────────────────
//
// La même lecture sert DEUX questions opposées, et c'est leur seul point commun :
//
//   · `socket-payload-shape-gate` (#18070) — le miroir EXIGE-t-il plus que le
//     contrat ne DÉCLARE ? Un champ Kotlin requis absent du contrat fait lever
//     `MissingFieldException` : la trame entière tombe, en silence.
//   · `socket-payload-dead-field-gate` (#18124) — le miroir DÉCLARE-t-il ce que
//     le contrat ne porte NULLE PART ? Un champ optionnel que personne n'émet se
//     décode en `null` sans bruit, et désactive la branche qui le lit.
//
// Deux extracteurs jumeaux auraient dérivé — c'est exactement la faute que ces
// gardes existent pour interdire (`CLAUDE.md` § Maintenabilité : « aucune
// jumelle divergente »). Le doc-comment de chaque garde porte SA question ;
// celui-ci porte la LECTURE.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '../../../../..');

/**
 * Les racines Kotlin balayées : les miroirs (`core/model`) et les sites qui les
 * branchent sur un nom d'événement (`sdk-core`). Un troisième module qui
 * routerait un événement devrait rejoindre cette liste — et l'invariant de
 * minimum ci-dessous est ce qui rend l'oubli visible, puisqu'il compte les
 * routes trouvées.
 *
 * Que deux racines SUFFISENT est une mesure, pas une hypothèse (2026-11-14) :
 * hors d'elles, un seul fichier Android cite `SocketEventNames`
 * (`app/.../TalkieWakeService.kt`), et c'est une ÉMISSION client→serveur — donc
 * aucun décodage, donc hors du champ de cette garde. Refaire la mesure :
 * `grep -rln 'SocketInboundRoute\.\(decoding\|subject\)\|SocketEventNames\.'
 * --include=*.kt apps/android --exclude-dir=test`.
 */
export const KOTLIN_ROOTS = ['apps/android/core/model/src/main', 'apps/android/sdk-core/src/main'] as const;

export const EVENT_NAMES_KT = 'apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/socket/SocketEventNames.kt';

export const EVENT_MAPS_TS = 'packages/shared/types/socketio-events/event-maps.ts';

/**
 * Mesuré à 119 le 2026-11-13. Le seuil est volontairement BAS : il n'est pas un
 * cliquet de couverture (qu'une route retirée ferait rougir à tort), mais un
 * détecteur de balayage VIDE — le seul mode de panne silencieux d'une garde qui
 * déduit sa table.
 */
export const MINIMUM_ROUTES = 100;

/**
 * Les événements du contrat réellement confrontés, mesurés le 2026-11-14 — à comparer aux 176 que
 * `ServerToClientEvents` déclare. Le chiffre vit ICI, et pas seulement dans une prose, pour qu'une
 * extension de l'extracteur (#18123) ait un endroit où se voir monter.
 */
export const SWEPT_EVENTS_AT_LAST_MEASURE = 110;

export type KotlinField = {
  readonly name: string;
  readonly kotlinName: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
  /** `@Required` : kotlinx exige la clé MÊME quand le champ porte un défaut. */
  readonly annotatedRequired: boolean;
};

export type KotlinClass = {
  readonly file: string;
  readonly fields: readonly KotlinField[];
  readonly customSerializer: boolean;
};

export type Route = {
  readonly file: string;
  readonly constName: string;
  readonly event: string | undefined;
  readonly className: string | undefined;
};

const kotlinFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) kotlinFiles(path, out);
    else if (path.endsWith('.kt')) out.push(path);
  }
  return out;
};

/**
 * Les commentaires sont retirés AVANT toute recherche, pour la raison que les
 * gardes voisines écrivent déjà : une classe citée en PROSE (« l'ancienne forme
 * `TranslationEvent(messageId, targetLanguage)` ») passerait pour une
 * déclaration, et la garde bénirait le défaut qu'elle interdit. Le `[^:]` du
 * second remplacement épargne le `//` d'une URL.
 */
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');

/** Découpe une liste d'arguments sur les virgules de PREMIER niveau (`Map<String, List<T>>` reste entier). */
const splitTopLevel = (source: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of source) {
    if ('<([{'.includes(char)) depth += 1;
    if ('>)]}'.includes(char)) depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
};

/** Fin de la liste de paramètres d'une `data class`, par équilibrage des délimiteurs. */
const closingParenIndex = (source: string, openAt: number): number => {
  let depth = 1;
  let index = openAt;
  while (index < source.length && depth > 0) {
    const char = source[index];
    if ('([{<'.includes(char)) depth += 1;
    else if (')]}>'.includes(char)) depth -= 1;
    index += 1;
  }
  return index - 1;
};

const parseField = (declaration: string): KotlinField | null => {
  const serialName = declaration.match(/@SerialName\(\s*"([^"]+)"\s*\)/)?.[1];
  const matched = declaration.match(/\b(?:val|var)\s+(\w+)\s*:\s*([\s\S]+)$/);
  if (!matched) return null;
  const [, kotlinName, rest] = matched;
  /* Un `=` d'affectation, jamais celui de `==`, `!=`, `<=` ou `>=`. */
  const hasDefault = /(^|[^=!<>])=(?!=)/.test(rest);
  const type = (hasDefault ? rest.split(/(^|[^=!<>])=(?!=)/)[0] : rest).trim();
  return {
    name: serialName ?? kotlinName,
    kotlinName,
    type,
    nullable: /\?\s*$/.test(type),
    hasDefault,
    annotatedRequired: /@Required\b/.test(declaration),
  };
};

export const readKotlin = () => {
  const files = KOTLIN_ROOTS.flatMap((root) => kotlinFiles(join(REPO, root)));
  const classes = new Map<string, KotlinClass>();
  const aliases = new Map<string, string>();

  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const alias of source.matchAll(/typealias\s+(\w+)\s*=\s*([\w.]+)/g)) {
      aliases.set(alias[1], alias[2].split('.').pop() as string);
    }
    const declaration = /@Serializable(?:\([^)]*\))?[\s\S]{0,400}?\bdata class\s+(\w+)\s*\(/g;
    let found: RegExpExecArray | null;
    while ((found = declaration.exec(source)) !== null) {
      const header = source.slice(found.index, declaration.lastIndex);
      /* `@Serializable` suivi d'autre chose qu'une `data class` : l'annotation porte ailleurs. */
      if (/\b(fun|object|enum)\b/.test(header.replace(/data class[\s\S]*/, ''))) continue;
      const end = closingParenIndex(source, declaration.lastIndex);
      const fields = splitTopLevel(source.slice(declaration.lastIndex, end))
        .map((part) => parseField(part.trim()))
        .filter((field): field is KotlinField => field !== null);
      classes.set(found[1], { file, fields, customSerializer: /@Serializable\(\s*with/.test(header) });
    }
  }

  const constants = new Map(
    [...stripComments(readFileSync(join(REPO, EVENT_NAMES_KT), 'utf8')).matchAll(
      /const\s+val\s+(\w+)\s*(?::\s*String\s*)?=\s*"([^"]+)"/g,
    )].map((match) => [match[1], match[2]] as const),
  );

  const routes: Route[] = [];
  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    /* Le sujet porte la classe de charge ; il est déclaré dans le même fichier que sa route. */
    const subjects = new Map(
      [...source.matchAll(/val\s+(\w+)\s*(?::[^=\n]+)?=\s*SocketInboundRoute\.subject<(\w+)>\(\)/g)].map(
        (match) => [match[1], match[2]] as const,
      ),
    );
    for (const typed of source.matchAll(/val\s+(\w+)\s*:\s*RouteSubject<(\w+)>/g)) {
      if (!subjects.has(typed[1])) subjects.set(typed[1], typed[2]);
    }
    const add = (constName: string, className: string | undefined) =>
      routes.push({ file, constName, event: constants.get(constName), className });

    for (const match of source.matchAll(/\broute<(\w+)>\(\s*SocketEventNames\.(\w+)/g)) add(match[2], match[1]);
    for (const match of source.matchAll(/\broute\(\s*SocketEventNames\.(\w+)\s*,\s*(\w+)/g))
      add(match[1], subjects.get(match[2]));
    for (const match of source.matchAll(
      /SocketInboundRoute\.decoding\(\s*SocketEventNames\.(\w+)\s*,\s*json\s*,\s*(\w+)(\.serializer\(\))?/g,
    ))
      add(match[1], match[3] ? match[2] : subjects.get(match[2]));
  }

  const resolveClass = (name: string | undefined): KotlinClass | undefined => {
    if (name === undefined) return undefined;
    return classes.get(name) ?? (aliases.has(name) ? classes.get(aliases.get(name) as string) : undefined);
  };

  return { routes, resolveClass, classCount: classes.size };
};

/**
 * La SURFACE de l'API du compilateur que cette garde emploie — déclarée, et pas `any` : le dépôt
 * interdit `any`, et une surface nommée dit aussi, en une lecture, de quoi la garde dépend.
 */
type TsSymbol = {
  readonly flags: number;
  readonly valueDeclaration: unknown;
  getName(): string;
};
type TsType = {
  getCallSignatures(): readonly { getParameters(): readonly TsSymbol[] }[];
  /** Une charge peut être une UNION de portées — `user:preferences-updated` en a trois. */
  isUnion?(): boolean;
  readonly types?: readonly TsType[];
};
type TsChecker = {
  getPropertiesOfType(type: TsType): readonly TsSymbol[];
  /** Un tableau se confronte par son ÉLÉMENT — `translations: TranslationData[]` porte `TranslationData`. */
  isArrayType?(type: TsType): boolean;
  getTypeArguments?(type: TsType): readonly TsType[];
  getTypeAtLocation(node: unknown): TsType;
  getTypeOfSymbolAtLocation(symbol: TsSymbol, node: unknown): TsType;
};
type TsApi = {
  readonly sys: unknown;
  readonly SymbolFlags: { readonly Optional: number };
  readonly TypeFlags: { readonly Nullable: number };
  readConfigFile(path: string, read: (p: string) => string | undefined): { config: unknown };
  parseJsonConfigFileContent(config: unknown, host: unknown, basePath: string): { options: Record<string, unknown> };
  createProgram(roots: readonly string[], options: unknown): {
    getTypeChecker(): TsChecker;
    getSourceFile(path: string): unknown;
  };
  forEachChild(node: unknown, visit: (child: unknown) => void): void;
  isInterfaceDeclaration(node: unknown): node is { name: { text: string } };
};

/**
 * TypeScript 7 (épinglé par `packages/shared`) est le portage natif : il
 * n'expose pas `createProgram`. La racine du dépôt épingle la 6, qui l'expose.
 * On essaie les deux, et on ÉCHOUE si aucune ne répond — jamais de `skip`.
 */
const loadTypeScript = (): TsApi => {
  const candidates = [import.meta.url, join(REPO, 'package.json')];
  for (const from of candidates) {
    try {
      const loaded = createRequire(from)('typescript') as Partial<TsApi>;
      if (typeof loaded?.createProgram === 'function') return loaded as TsApi;
    } catch {
      /* candidat suivant */
    }
  }
  throw new Error(
    "Aucune installation de TypeScript n'expose l'API JS du compilateur (`createProgram`). " +
      'La garde de forme ne peut pas résoudre les types de charge — elle échoue plutôt que de se taire.',
  );
};

export type ContractField = {
  readonly name: string;
  readonly optional: boolean;
  /**
   * Les clés de l'OBJET que ce champ porte, quand il en porte un — un cran, pas davantage (#18116).
   *
   * Un champ imbriqué tue la trame exactement comme un champ de premier niveau : le décodeur
   * descend dans l'objet, n'y trouve pas une clé que le miroir exige, et l'ÉVÉNEMENT ENTIER est
   * perdu. `SocketPostCreatedData.post`, `SocketCommentAddedData.comment`, `ApiNotification.actor`
   * sont des documents complets derrière une seule clé.
   *
   * `undefined` ⇒ rien à confronter (primitif, carte opaque, `unknown`) : la garde se TAIT plutôt
   * que de deviner. Le tableau est pris à son ÉLÉMENT, et une union à ses propriétés COMMUNES —
   * la sémantique de `getPropertiesOfType`, qui est exactement « ce que la valeur porte à coup sûr ».
   */
  readonly nested?: readonly ContractField[];
};

/**
 * Ce que le contrat dit d'UN événement : les clés que sa charge porte à coup sûr, et le nombre de
 * PORTÉES qu'elle peut prendre.
 *
 * `variantCount` existe pour une panne que les clés seules ne peuvent pas décrire : une charge à
 * plusieurs portées (`user:preferences-updated` en a trois — conversation, communauté, catégorie)
 * se discrimine côté client, et un aiguillage qui n'implémente QUE la moitié de son discriminant
 * envoie une portée entière au mauvais décodeur. Les clés communes, elles, restent justes — c'est
 * exactement pourquoi #18120 a survécu à une confrontation champ par champ.
 */
export type ContractPayload = {
  readonly fields: readonly ContractField[];
  readonly variantCount: number;
};

/**
 * Le programme TypeScript coûte quelques secondes ; les deux gardes et leurs invariants le
 * demandent plusieurs fois. Il est construit UNE fois par processus, et les deux lectures ci-dessous
 * en sont des projections.
 */
let contractCache: Map<string, ContractPayload> | undefined;

/**
 * Les clés d'un objet PORTÉ par un champ — après avoir retiré `null`/`undefined` et ouvert un
 * tableau sur son élément. Rend `undefined` dès qu'il n'y a pas d'objet à confronter : zéro
 * propriété ne veut pas dire « objet vide », ça veut dire « je ne sais pas », et une garde qui
 * confond les deux rougit sur tout un domaine à la fois.
 */
const nestedFields = (ts: TsApi, checker: TsChecker, type: TsType): readonly ContractField[] | undefined => {
  const withoutNullish = type.isUnion?.()
    ? (type.types ?? []).filter((member) => !(((member as { flags?: number }).flags ?? 0) & ts.TypeFlags.Nullable))
    : [type];
  const opened = withoutNullish.map((member) => {
    const element = checker.getTypeArguments?.(member)?.[0];
    return checker.isArrayType?.(member) && element ? element : member;
  });
  const carried = opened.length === 1 ? opened[0] : undefined;
  if (!carried) return undefined;
  const properties = checker.getPropertiesOfType(carried);
  if (properties.length === 0) return undefined;
  return properties.map((property) => ({
    name: property.getName(),
    optional: Boolean(property.flags & ts.SymbolFlags.Optional),
  }));
};

export const readContract = (): Map<string, readonly ContractField[]> =>
  new Map([...readContractPayloads()].map(([event, payload]) => [event, payload.fields] as const));

export const readContractPayloads = (): Map<string, ContractPayload> => {
  if (contractCache) return contractCache;
  const ts = loadTypeScript();
  const sharedDir = join(REPO, 'packages/shared');
  const system = ts.sys as { readFile(path: string): string | undefined };
  const configFile = ts.readConfigFile(join(sharedDir, 'tsconfig.json'), (path) => system.readFile(path));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, sharedDir);
  const entry = join(REPO, EVENT_MAPS_TS);
  const program = ts.createProgram([entry], { ...parsed.options, noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(entry);
  if (!sourceFile) throw new Error(`Le contrat ${EVENT_MAPS_TS} est introuvable pour le compilateur.`);

  let declaration: { name: { text: string } } | undefined;
  ts.forEachChild(sourceFile, (node: unknown) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'ServerToClientEvents') declaration = node;
  });
  if (!declaration) throw new Error('`ServerToClientEvents` est introuvable dans le contrat.');

  const contract = new Map<string, ContractPayload>();
  for (const event of checker.getPropertiesOfType(checker.getTypeAtLocation(declaration.name))) {
    const handler = checker.getTypeOfSymbolAtLocation(event, event.valueDeclaration);
    const signature = handler.getCallSignatures()[0];
    if (!signature) continue;
    const parameter = signature.getParameters()[0];
    if (!parameter) {
      contract.set(event.getName(), { fields: [], variantCount: 1 });
      continue;
    }
    const payload = checker.getTypeOfSymbolAtLocation(parameter, parameter.valueDeclaration);
    contract.set(event.getName(), {
      fields: checker.getPropertiesOfType(payload).map((field) => {
        const declaredAt = field.valueDeclaration ?? parameter.valueDeclaration;
        const carried = nestedFields(ts, checker, checker.getTypeOfSymbolAtLocation(field, declaredAt));
        return {
          name: field.getName(),
          optional: Boolean(field.flags & ts.SymbolFlags.Optional),
          ...(carried ? { nested: carried } : {}),
        };
      }),
      variantCount: payload.isUnion?.() ? (payload.types?.length ?? 1) : 1,
    });
  }
  contractCache = contract;
  return contract;
};

/**
 * « Requis au décodage » au sens de kotlinx : pas de défaut et pas de `?`, OU `@Required`, qui
 * exige la clé malgré un défaut. L'annotation n'est utilisée nulle part aujourd'hui — et c'est
 * précisément pourquoi elle est traitée ici : un piège qu'on n'a pas encore déclenché reste un
 * piège, et celui-ci rendrait la garde VERTE à tort.
 */
export const isRequired = (field: KotlinField): boolean =>
  field.annotatedRequired || (!field.nullable && !field.hasDefault);

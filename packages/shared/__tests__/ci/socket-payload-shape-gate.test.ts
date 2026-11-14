// packages/shared/__tests__/ci/socket-payload-shape-gate.test.ts
//
// Les NOMS d'événements socket ont trois gardes ; la FORME de leurs charges
// n'en avait aucune (#18070).
//
// ─── D'où vient cette garde ────────────────────────────────────────────────
//
// Le dépôt garde complètement les NOMS : aucun client n'écoute hors contrat
// (`socket-event-name-gate`), la passerelle n'émet que par constante
// (`socket-event-emitter-gate`), l'enum Swift suit le contrat
// (`ios-socket-event-enum-parity`). Mesure du 2026-11-13 : zéro divergence de
// nom sur les trois clients.
//
// La FORME, elle, n'était tenue par rien — et c'est là que vivent les
// divergences coûteuses. Le dépôt les a payées deux fois :
//
//  1. `participant:role-updated` — la passerelle émet `newRole`, Android
//     exigeait `role`. « Aucun changement de rang n'a jamais atteint le
//     trombinoscope Android, et le témoin était vert »
//     (`services/gateway/CLAUDE.md`). Réparé.
//  2. `message:translation` — #18069. Même forme, même silence, mêmes témoins
//     verts : le Prisme Linguistique, principe fondateur du produit, devenait
//     fonction d'un rechargement REST sur Android.
//
// ─── Le mécanisme exact attrapé ────────────────────────────────────────────
//
// Le `Json` injecté côté Android (`sdk-core/.../di/SdkModule.kt`) pose
// `ignoreUnknownKeys = true` : les clés EN TROP sont tolérées — la passerelle
// peut enrichir librement. Mais une clé MANQUANTE pour un champ Kotlin
// non-nullable et sans défaut lève `MissingFieldException`, que
// `SocketInboundRoute.guarded` avale dans une ligne Timber qui ne nomme ni la
// charge ni le message. L'événement n'arrive jamais, et rien ne rougit.
//
//   Le contrat dit ce qui est ÉMIS ; le miroir décide ce qui est EXIGÉ.
//   Rien ne comparait les deux.
//
// ─── Ce que la garde vérifie ───────────────────────────────────────────────
//
// Pour chaque événement serveur→client qu'Android décode : tout champ du
// miroir Kotlin NON-NULLABLE et SANS DÉFAUT (après `@SerialName`) doit exister
// comme clé du type de charge déclaré par `ServerToClientEvents`, et y être
// NON-OPTIONNEL. Un champ requis absent ⇒ rouge ; un champ requis en face d'un
// `?:` du contrat ⇒ rouge aussi (le contrat déclare alors que la clé peut
// manquer, donc le décodage Kotlin peut lever).
//
// ─── Pourquoi le compilateur TypeScript, et pas une lecture de texte ───────
//
// Le type de charge d'un événement n'est pas toujours une `interface` écrite à
// plat : il y a des alias, des `extends`, des intersections, des unions, et des
// types qui vivent hors de `types/socketio-events/`. Une lecture textuelle
// devrait les suivre — ce serait réécrire un vérificateur de types, et il se
// tromperait. `ts.getPropertiesOfType` les résout tous, et rend d'une UNION
// les seules propriétés COMMUNES : exactement la sémantique voulue ici,
// « ce que la charge porte à COUP SÛR ».
//
// La résolution se fait depuis la racine du dépôt parce que `packages/shared`
// épingle TypeScript 7 (le portage natif), qui n'expose pas l'API JS du
// compilateur. Si aucune des deux n'offre `createProgram`, la garde ÉCHOUE —
// elle ne se saute pas : un agrégateur qui n'a rien exécuté conclurait vert
// par absence d'échec (`tasks/lessons/`).
//
// ─── Les invariants de BALAYAGE, et pourquoi ils sont des assertions ───────
//
// La leçon du cycle 155 : « un gate indexé sur une RELATION ne balaie pas les
// sites qui n'ont pas de relation déclarée ». Cette garde n'a donc AUCUNE table
// à tenir à la main — le couple (événement, classe) se DÉDUIT des sites de
// routage. Mais une déduction peut se vider en silence : un renommage de
// `route(` ou de `SocketInboundRoute.decoding(` rendrait zéro route, et zéro
// route ne rougit jamais. Quatre invariants ferment cette porte, et chacun est
// un `expect` :
//
//   · le balayage rend au moins `MINIMUM_ROUTES` routes ;
//   · toute constante d'événement citée par un site de routage se résout ;
//   · toute classe de charge citée par un site de routage se résout ;
//   · tout événement routé est déclaré dans `ServerToClientEvents`.
//
// ─── Ce que la garde ne couvre PAS (dit à voix haute) ──────────────────────
//
// Les champs IMBRIQUÉS. `SocketPostCreatedData.post`, `SocketCommentAddedData.
// comment` portent des objets entiers dont un seul champ requis tue le document
// de la même façon. Le critère retenu est celui de #18070 — le PREMIER niveau —
// et l'extension est suivie par sa propre issue. De même, une classe à
// sérialiseur de classe (`@Serializable(with = …)`) n'est pas analysable par la
// liste de ses paramètres : c'est le sérialiseur qui décide, et la garde la
// laisse de côté en le DISANT (`classesWithCustomSerializer`).
//
// ─── Placement ─────────────────────────────────────────────────────────────
//
// Même arbitrage que `ios-socket-event-enum-parity.test.ts`, son voisin de
// dossier : `packages/shared` tourne sur CHAQUE PR (`ci.yml`, matrice `test`),
// alors qu'`android.yml` ne tourne que sur les chemins `apps/android/**`. Une
// divergence introduite par le CONTRAT (un champ rendu optionnel côté TS) doit
// rougir chez celui qui l'écrit, pas seulement chez celui qui la subit.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../..');

/**
 * Les racines Kotlin balayées : les miroirs (`core/model`) et les sites qui les
 * branchent sur un nom d'événement (`sdk-core`). Un troisième module qui
 * routerait un événement devrait rejoindre cette liste — et l'invariant de
 * minimum ci-dessous est ce qui rend l'oubli visible, puisqu'il compte les
 * routes trouvées.
 */
const KOTLIN_ROOTS = ['apps/android/core/model/src/main', 'apps/android/sdk-core/src/main'] as const;

const EVENT_NAMES_KT = 'apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/socket/SocketEventNames.kt';

const EVENT_MAPS_TS = 'packages/shared/types/socketio-events/event-maps.ts';

/**
 * Mesuré à 119 le 2026-11-13. Le seuil est volontairement BAS : il n'est pas un
 * cliquet de couverture (qu'une route retirée ferait rougir à tort), mais un
 * détecteur de balayage VIDE — le seul mode de panne silencieux d'une garde qui
 * déduit sa table.
 */
const MINIMUM_ROUTES = 100;

type KotlinField = {
  readonly name: string;
  readonly kotlinName: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
};

type KotlinClass = {
  readonly file: string;
  readonly fields: readonly KotlinField[];
  readonly customSerializer: boolean;
};

type Route = {
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
  return { name: serialName ?? kotlinName, kotlinName, type, nullable: /\?\s*$/.test(type), hasDefault };
};

const readKotlin = () => {
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
type TsType = { getCallSignatures(): readonly { getParameters(): readonly TsSymbol[] }[] };
type TsChecker = {
  getPropertiesOfType(type: TsType): readonly TsSymbol[];
  getTypeAtLocation(node: unknown): TsType;
  getTypeOfSymbolAtLocation(symbol: TsSymbol, node: unknown): TsType;
};
type TsApi = {
  readonly sys: unknown;
  readonly SymbolFlags: { readonly Optional: number };
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

type ContractField = { readonly name: string; readonly optional: boolean };

const readContract = (): Map<string, readonly ContractField[]> => {
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

  const contract = new Map<string, readonly ContractField[]>();
  for (const event of checker.getPropertiesOfType(checker.getTypeAtLocation(declaration.name))) {
    const handler = checker.getTypeOfSymbolAtLocation(event, event.valueDeclaration);
    const signature = handler.getCallSignatures()[0];
    if (!signature) continue;
    const parameter = signature.getParameters()[0];
    if (!parameter) {
      contract.set(event.getName(), []);
      continue;
    }
    const payload = checker.getTypeOfSymbolAtLocation(parameter, parameter.valueDeclaration);
    contract.set(
      event.getName(),
      checker.getPropertiesOfType(payload).map((field) => ({
        name: field.getName(),
        optional: Boolean(field.flags & ts.SymbolFlags.Optional),
      })),
    );
  }
  return contract;
};

const kotlin = readKotlin();
const contract = readContract();

describe("la FORME des charges socket — ce qu'Android EXIGE, ce que le contrat DÉCLARE (#18070)", () => {
  it('balaie un nombre plausible de routes — une table déduite qui se vide ne rougit jamais toute seule', () => {
    expect(kotlin.classCount).toBeGreaterThan(0);
    expect(kotlin.routes.length).toBeGreaterThanOrEqual(MINIMUM_ROUTES);
  });

  it('résout la constante et la classe de charge de CHAQUE site de routage', () => {
    const unresolved = kotlin.routes
      .filter((route) => route.event === undefined || kotlin.resolveClass(route.className) === undefined)
      .map(
        (route) =>
          `${route.file.replace(`${REPO}/`, '')} — SocketEventNames.${route.constName} ⇒ ` +
          `${route.event === undefined ? 'constante inconnue' : `classe « ${route.className ?? '?'} » non résolue`}`,
      );
    expect(unresolved, unresolved.join('\n')).toEqual([]);
  });

  it('ne route que des événements déclarés par `ServerToClientEvents`', () => {
    const undeclared = [
      ...new Set(
        kotlin.routes
          .filter((route) => route.event !== undefined && !contract.has(route.event))
          .map((route) => route.event as string),
      ),
    ];
    expect(undeclared, `hors contrat : ${undeclared.join(', ')}`).toEqual([]);
  });

  it('tout champ REQUIS du miroir Kotlin existe au contrat, et y est REQUIS', () => {
    const divergences = new Map<string, string>();

    for (const route of kotlin.routes) {
      const mirror = kotlin.resolveClass(route.className);
      const declared = route.event === undefined ? undefined : contract.get(route.event);
      if (!mirror || !declared || mirror.customSerializer) continue;

      const byName = new Map(declared.map((field) => [field.name, field] as const));
      for (const required of mirror.fields.filter((field) => !field.nullable && !field.hasDefault)) {
        const counterpart = byName.get(required.name);
        if (counterpart && !counterpart.optional) continue;
        divergences.set(
          `${route.event}|${required.name}`,
          `${route.event} — « ${required.name} » est REQUIS par ${route.className} ` +
            `(${mirror.file.replace(`${REPO}/`, '')}) mais ` +
            `${counterpart ? 'OPTIONNEL' : 'ABSENT'} au contrat (${EVENT_MAPS_TS}). ` +
            'Une charge sans cette clé lève `MissingFieldException`, que `SocketInboundRoute.guarded` avale : ' +
            "l'événement n'arrive jamais et rien ne rougit.",
        );
      }
    }

    const report = [...divergences.values()].sort();
    expect(report, `\n${report.join('\n')}\n`).toEqual([]);
  });
});

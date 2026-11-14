// packages/shared/__tests__/ci/socket-payload-shape/kotlin-manual-parser.ts
//
// Le CINQUIÈME idiome de routage Android (#18123) : la route qui ne décode pas
// par kotlinx, mais appelle un PARSEUR écrit à la main.
//
// ─── Pourquoi il a sa place dans la garde de forme ────────────────────────
//
// Toute la famille `call:*` sociale passe par là — douze événements que la
// garde de #18070 ne voyait pas, parce qu'elle cherche une classe
// `@Serializable` et qu'il n'y en a aucune sur ce chemin.
//
// La QUESTION ne change pas : « le miroir exige-t-il une clé que le contrat ne
// garantit pas ? ». Seule la PREUVE change. Un parseur manuel dit son exigence
// par une forme régulière, et c'est elle qu'on lit :
//
//     callId = o.str("callId") ?: return@decode null
//
// `?: return@decode null` ⇒ sans cette clé, le parseur rend `null`, l'événement
// est écarté, et rien ne rougit. C'est la panne de `MissingFieldException` par
// un autre mécanisme, avec le même silence.
//
// ─── Ce que cette lecture ne voit PAS, et qui est dit ─────────────────────
//
//   · les clés lues SANS garde (`o.str("x") ?: ""`) — elles ne sont pas exigées,
//     donc elles ne sont pas du sujet ;
//   · les clés d'un objet IMBRIQUÉ (`invitee.str("userId")`) — même critère de
//     premier niveau que les deux gardes voisines (#18116 les traite pour les
//     miroirs typés ; un parseur manuel imbriqué n'est pas couvert) ;
//   · une exigence exprimée autrement qu'`?: return@decode null` — un `require`,
//     un `when` qui retourne. **Ce qui n'est pas reconnu est un faux NÉGATIF**,
//     c'est-à-dire un silence : la garde ne peut qu'en couvrir moins, jamais
//     conclure à tort. C'est l'arbitrage inverse de celui d'un appariement par
//     proximité, qu'on refuse précisément parce qu'il conclut faux.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { KOTLIN_ROOTS, REPO, kotlinFiles, withoutComments } from './mirror-contract';

export type ManualParserRoute = {
  /** Le fichier qui ROUTE l'événement. */
  readonly file: string;
  /** Le fichier qui DÉCLARE le parseur — c'est là que vit l'exigence, donc c'est lui qu'on nomme. */
  readonly parserFile: string;
  readonly constName: string;
  readonly event: string | undefined;
  readonly parser: string;
  readonly fn: string;
  /** Les clés de PREMIER niveau dont l'absence fait rendre `null` au parseur. */
  readonly requiredKeys: readonly string[];
  /**
   * Le parseur ne lit AUCUNE clé lui-même : il délègue (`previewSignal` rend
   * `CallSignalMapper.signalEnvelope(raw)`). Ses exigences vivent un cran plus bas, hors de
   * portée de cette lecture — la route est donc ÉNUMÉRÉE comme non confrontée, jamais comptée
   * comme balayée. Un zéro qu'on ne distingue pas d'une absence est le mode de panne silencieux
   * d'une garde qui déduit sa table.
   */
  readonly delegated: boolean;
};

/** `o.str("x") ?: return@decode null`, y compris enveloppé — `Emoji.from(o.str("emoji")) ?: return@decode null`. */
const REQUIRED_KEY = /\bo\.(?:str|bool|child|int)\(\s*"(\w+)"\s*\)[^\n]{0,60}?\?:\s*return@decode\s+null/g;

const parserFunctionBodies = (source: string): ReadonlyMap<string, string> => {
  const bodies = new Map<string, string>();
  const declaration = /\bfun\s+(\w+)\(/g;
  const starts: Array<{ readonly name: string; readonly at: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(source)) !== null) starts.push({ name: match[1], at: match.index });
  starts.forEach((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].at : source.length;
    bodies.set(start.name, source.slice(start.at, end));
  });
  return bodies;
};

export const readManualParserRoutes = (): readonly ManualParserRoute[] => {
  const files = KOTLIN_ROOTS.flatMap((root) => kotlinFiles(join(REPO, root)));
  const sources = new Map(files.map((file) => [file, withoutComments(readFileSync(file, 'utf8'))] as const));

  const constants = new Map(
    [...withoutComments(
      readFileSync(join(REPO, 'apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/socket/SocketEventNames.kt'), 'utf8'),
    ).matchAll(/const\s+val\s+(\w+)\s*(?::\s*String\s*)?=\s*"([^"]+)"/g)].map((match) => [match[1], match[2]] as const),
  );

  /*
   * Le corps d'une fonction se cherche dans le fichier qui DÉCLARE l'objet nommé par la route —
   * jamais dans un index global par nom. Mesuré : `recordingStarted`, `recordingStopped` et
   * `previewSignal` existent aussi ailleurs dans le dépôt, et un index global rendait le DERNIER
   * homonyme, donc un corps sans aucune exigence, donc une route silencieusement non gardée.
   * C'est la faute des deux `struct Update` du miroir Swift, dans l'autre langage.
   */
  const declaringFile = new Map<string, string>();
  for (const [file, source] of sources) {
    for (const match of source.matchAll(/\bobject\s+(\w+)\s*\{/g)) declaringFile.set(match[1], file);
  }
  const bodiesByFile = new Map<string, ReadonlyMap<string, string>>();
  const fileOf = (owner: string): string | undefined => declaringFile.get(owner);
  const bodyOf = (owner: string, fn: string): string | undefined => {
    const file = declaringFile.get(owner);
    if (!file) return undefined;
    const cached = bodiesByFile.get(file) ?? parserFunctionBodies(sources.get(file) as string);
    bodiesByFile.set(file, cached);
    return cached.get(fn);
  };

  const routes: ManualParserRoute[] = [];
  for (const [file, source] of sources) {
    for (const match of source.matchAll(
      /\b(?:route|SocketInboundRoute\.raw)\(\s*SocketEventNames\.(\w+)\s*\)[\s\S]{0,300}?(\w+)\.(\w+)\(\s*raw/g,
    )) {
      const body = bodyOf(match[2], match[3]);
      if (!body) continue;
      routes.push({
        file,
        parserFile: fileOf(match[2]) ?? file,
        constName: match[1],
        event: constants.get(match[1]),
        parser: match[2],
        fn: match[3],
        requiredKeys: [...new Set([...body.matchAll(new RegExp(REQUIRED_KEY.source, 'g'))].map((hit) => hit[1]))],
        delegated: !/\bo\.(?:str|bool|child|int)\(/.test(body),
      });
    }
  }
  return routes;
};

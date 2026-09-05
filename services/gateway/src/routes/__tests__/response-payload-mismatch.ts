import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import { stripComments } from './response-schema-sweep';

/**
 * Le balayage des schémas qui ne décrivent PAS ce que leur handler envoie.
 *
 * `response-schema-sweep.ts` cherche les objets NUS — `{ type: 'object' }` sans
 * `properties`. C'est une seule des deux façons dont fast-json-stringify vide
 * une réponse, et le cycle 91 a découvert l'autre en tirant sur la première :
 *
 * > un bloc `data` qui déclare des propriétés supprime TOUTES celles qu'il ne
 * > nomme pas. Si aucune des clés déclarées n'est celle que le handler envoie,
 * > la réponse sort à `{}` — et le balayage des objets nus ne voit rien, parce
 * > que le schéma est parfaitement bien formé. Il décrit simplement une AUTRE
 * > charge utile.
 *
 * Trois exemplaires, tous en production, tous invisibles au premier balayage :
 *
 * | route | déclaré | envoyé |
 * |---|---|---|
 * | `POST /auth/login` (2FA) | `user, token, sessionToken, session, expiresIn` | `requires2FA, twoFactorToken, rememberDevice, user, message` |
 * | `POST /auth/register` (conflit) | `user, token, expiresIn` | `phoneOwnershipConflict, phoneOwnerInfo, pendingRegistration` |
 * | `DELETE /…/messages/:id` | `message` (string) | `messageId, deleted, meta` |
 *
 * Le premier cassait la connexion à deux facteurs ; le deuxième tuait la modale
 * de transfert de numéro ; le troisième ne rendait même pas `deleted: true`.
 *
 * ## Les TROIS formes que la sonde distingue
 *
 * | `kind` | ce qui se passe | ce que voit l'appelant |
 * |---|---|---|
 * | `envelope` | le schéma d'un statut 2xx déclare des `properties` où `data` ne figure PAS | `{"success":true}` — la charge entière est supprimée |
 * | `total` | `data` est déclaré, mais AUCUNE clé envoyée n'y figure | `{"success":true,"data":{}}` |
 * | `partial` | une partie des clés envoyées n'est pas déclarée | la charge amputée, sans erreur |
 *
 * La forme `envelope` a été ajoutée après #4139 : les trois routes du parcours
 * de réinitialisation par SMS déclaraient `tokenId` et `maskedUserInfo` **à la
 * racine** du schéma 200, là où `sendSuccess` écrit `{ success, data }`. `data`
 * n'étant pas déclaré, fast-json-stringify le supprimait EN BLOC — tout le
 * parcours SMS était coupé sur les deux clients, et un code SMS était consommé
 * pour un jeton qui n'atteignait jamais l'appelant. Le balayage d'alors ne
 * regardait que l'intérieur d'un bloc `data:` : quand ce bloc n'existe pas, il
 * ne trouvait rien à comparer et passait son chemin, l'inventaire gelé restant
 * vide pendant toute la vie du défaut.
 *
 * ## Ce que l'outil sait faire
 *
 * Il apparie un bloc `response:` avec les `sendSuccess(reply, …)` qui le
 * SUIVENT, jusqu'au prochain bloc `response:` — le handler d'une route vit
 * toujours entre les deux.
 *
 * Il lit DEUX formes de charge utile :
 *
 * - le littéral d'objet, `sendSuccess(reply, { a, b })` ;
 * - la **variable locale simple** que le handler compose sous ses propres yeux,
 *   `const p = { a, b }` ou `const { success: _s, ...p } = result`, suivie de
 *   `sendSuccess(reply, p)`. C'est la forme des trois routes SMS, et elle a
 *   coûté #4139 : la limite était documentée, donc jamais rouge.
 *
 * Un jeu de clés est OUVERT dès qu'il porte un `...spread`, qu'il vienne du
 * littéral (`{ ...message, meta }`), du reste d'une déstructuration
 * (`const { a, ...p } = result` — `result` est un objet INCONNU) ou d'une
 * mutation de la variable entre sa déclaration et l'envoi. Sur un jeu ouvert,
 * l'outil ne conclut JAMAIS à `total` : le spread peut apporter les clés
 * déclarées, et un faux positif sur une charge dynamique coûterait plus cher
 * que le trou qu'on ferme.
 *
 * ## Ce qu'il ne sait TOUJOURS pas — la limite qui subsiste
 *
 * Elle a bougé avec l'élargissement de #4192, donc elle se redit, sinon elle
 * redevient l'angle mort silencieux qu'elle était :
 *
 * - **Il ne résout que ce que le handler DÉCLARE lui-même.** Un appel de
 *   fonction (`sendSuccess(reply, buildPayload(x))`), un import, un paramètre,
 *   une variable déclarée hors du handler (module, closure parente) ou un
 *   ternaire (`sendSuccess(reply, a ?? b)`) laissent la charge inconnue : la
 *   sonde se TAIT plutôt que de deviner.
 * - **Il ne type rien.** Une déstructuration de reste rend le jeu ouvert quelle
 *   que soit la forme réelle de la source ; connaître les clés de `result`
 *   demanderait un typeur, pas un balayage.
 * - **L'appariement schéma ↔ handler reste TEXTUEL** : le handler d'une route
 *   qui ne déclare aucun bloc `response:` est rattaché au bloc précédent.
 * - **Il ne lit que `sendSuccess(reply, …)`** : un `reply.send(…)` direct ou un
 *   nom de réponse autre que `reply` lui échappe.
 * - **La forme `envelope` se tait dès que le schéma est ouvert** : `200: ref`,
 *   `{ ...enveloppe }`, ou `additionalProperties` non `false` — dans ces trois
 *   cas fast-json-stringify peut laisser passer `data`, donc on ne conclut pas.
 * - **Elle se tait aussi sur `sendSuccess(reply, undefined | null)`** : aucune
 *   clé `data` ne part, un schéma qui ne déclare que `success` y dit vrai. Une
 *   route qui répond ainsi n'est donc pas examinée du tout pour l'enveloppe.
 * - **Il ne lit que `services/gateway/src/routes`** : les schémas de
 *   `packages/shared`, dont un défaut se propage le plus loin, lui échappent.
 *
 * **La limite a une TAILLE, et c'est ce qui la rend actionnable.** Mesuré sur
 * `routes/` au moment de #4192 : 268 charges littérales, 124 passées par une
 * variable — dont 20 explicitement vides, 14 que la sonde résout désormais
 * (11 littéraux locaux, et les 3 déstructurations du parcours SMS qui ont coûté
 * #4139), et **90 qui restent hors de portée**. C'est le chiffre à confronter
 * au prochain élargissement ; « une limite assumée » sans chiffre ne dit pas
 * s'il y a quelque chose derrière.
 */

export type PayloadMismatch = {
  readonly file: string;
  readonly line: number;
  /**
   * `envelope` : le statut 2xx ne déclare pas `data` ⇒ la charge ENTIÈRE saute.
   * `total` : aucune clé envoyée n'est déclarée ⇒ `data` sort à `{}`.
   */
  readonly kind: 'envelope' | 'total' | 'partial';
  readonly declared: readonly string[];
  /** Les clés que le handler envoie et que le schéma supprime. */
  readonly dropped: readonly string[];
};

/** Fin (exclusive) de l'objet littéral ouvert à `openIndex`. */
function matchBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

const SPREAD = '...SPREAD';

/** Une entrée de premier niveau d'un objet littéral, avec la POSITION de sa valeur. */
type ObjectEntry = {
  readonly key: string | null;
  readonly spread: boolean;
  /** Offset absolu du premier caractère non blanc de la valeur. */
  readonly valueStart: number;
};

const KEYED = /^(?:([A-Za-z_$][\w$]*)|'([^']*)'|"([^"]*)"|(\d+))\s*:/;

/**
 * Les entrées de PREMIER niveau d'un objet littéral. Découpe sur les virgules
 * de profondeur zéro — un objet, un tableau ou un appel imbriqué ne produit
 * donc aucune entrée propre.
 *
 * La position de la valeur est ce qui permet de DESCENDRE dans un schéma
 * (`response:` → `200:` → `properties:`) sans écrire une expression régulière
 * par étage : c'est ce qui rend la forme `envelope` lisible.
 */
function topLevelEntries(source: string, openIndex: number): readonly ObjectEntry[] {
  const bodyStart = openIndex + 1;
  const body = source.slice(bodyStart, matchBrace(source, openIndex));
  const parts: { readonly text: string; readonly offset: number }[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push({ text: body.slice(start, i), offset: bodyStart + start });
      start = i + 1;
    }
  }
  parts.push({ text: body.slice(start), offset: bodyStart + start });

  return parts.flatMap(({ text, offset }): readonly ObjectEntry[] => {
    const lead = text.length - text.trimStart().length;
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('...')) return [{ key: null, spread: true, valueStart: offset + lead }];

    const keyed = KEYED.exec(trimmed);
    if (keyed) {
      const key = keyed[1] ?? keyed[2] ?? keyed[3] ?? keyed[4];
      const afterColon = offset + lead + keyed[0].length;
      const rest = trimmed.slice(keyed[0].length);
      return [{ key, spread: false, valueStart: afterColon + (rest.length - rest.trimStart().length) }];
    }

    // Forme abrégée `{ userId, role }`.
    const short = /^([A-Za-z_$][\w$]*)$/.exec(trimmed);
    return short ? [{ key: short[1], spread: false, valueStart: offset + lead }] : [];
  });
}

/** Les clés de premier niveau d'un objet littéral, `...spread` sous sentinelle. */
export function topLevelKeys(source: string, openIndex: number): readonly string[] {
  return topLevelEntries(source, openIndex).flatMap((entry) =>
    entry.spread ? [SPREAD] : entry.key ? [entry.key] : []
  );
}

/** Les propriétés que le bloc `data:` d'un schéma de réponse déclare. */
function declaredDataKeys(code: string, responseOpen: number, responseEnd: number): readonly string[] | null {
  const block = code.slice(responseOpen, responseEnd);
  const match = /\bdata\s*:\s*\{\s*(?:type\s*:\s*'object'\s*,\s*)?properties\s*:\s*\{/.exec(block);
  if (!match) return null;

  const propsOpen = responseOpen + block.indexOf('{', match.index + match[0].length - 1);
  const keys = topLevelKeys(code, propsOpen);
  return keys.length > 0 ? keys : null;
}

type EnvelopeGap = {
  readonly at: number;
  readonly declared: readonly string[];
};

const STATUS_2XX = /^2\d\d$/;

/**
 * Les statuts 2xx dont le schéma déclare des `properties` SANS `data`.
 *
 * `sendSuccess` écrit `{ success, data }` : déclarer `tokenId` à la racine ne
 * décrit pas une charge appauvrie, il en décrit une AUTRE — et fast-json-stringify
 * supprime `data` en entier. C'est le défaut #4139, et il est plus grave que
 * `total` parce qu'aucune clé n'a besoin de diverger pour qu'il frappe.
 *
 * On se tait sur tout schéma OUVERT (référence, spread, `additionalProperties`
 * non `false`) : là, `data` peut survivre, et un faux positif coûterait plus
 * cher que le trou.
 */
function envelopeGaps(code: string, responseOpen: number): readonly EnvelopeGap[] {
  return topLevelEntries(code, responseOpen).flatMap((status): readonly EnvelopeGap[] => {
    if (status.spread || !status.key || !STATUS_2XX.test(status.key)) return [];
    if (code[status.valueStart] !== '{') return [];

    const schema = topLevelEntries(code, status.valueStart);
    if (schema.some((entry) => entry.spread)) return [];

    const additional = schema.find((entry) => entry.key === 'additionalProperties');
    if (additional && !code.startsWith('false', additional.valueStart)) return [];

    const props = schema.find((entry) => entry.key === 'properties');
    if (!props || code[props.valueStart] !== '{') return [];

    const declared = topLevelEntries(code, props.valueStart);
    if (declared.length === 0 || declared.some((entry) => entry.spread)) return [];
    if (declared.some((entry) => entry.key === 'data')) return [];

    return [{ at: status.valueStart, declared: declared.flatMap((entry) => (entry.key ? [entry.key] : [])) }];
  });
}

/** Ce que la sonde a pu lire d'une charge utile ; `open` ⇒ des clés inconnues s'y ajoutent. */
type SentPayload = {
  readonly keys: readonly string[];
  readonly open: boolean;
};

function escapeIdent(ident: string): string {
  return ident.replace(/\$/g, '\\$');
}

/**
 * Ce que le handler a mis dans `ident`, en ne lisant QUE ce qu'il compose sous
 * ses propres yeux : la DERNIÈRE déclaration de `ident` avant l'envoi.
 *
 * - `const p = { … }` ⇒ jeu de clés fermé (sauf spread dans le littéral).
 * - `const { a, ...p } = result` ⇒ jeu OUVERT : `result` est inconnu, donc on
 *   ne conclura jamais à une perte totale — c'est la forme des trois routes SMS.
 * - toute autre origine (appel, paramètre, module) ⇒ `null`, la sonde se tait.
 *
 * Une mutation de `p` entre sa déclaration et l'envoi rouvre le jeu : un
 * `p.extra = x` ajoute une clé que le littéral ne dit pas, et conclure `total`
 * là-dessus serait un faux positif.
 */
function resolveLocalPayload(code: string, ident: string, from: number, to: number): SentPayload | null {
  const name = escapeIdent(ident);
  const literal = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*(?::[^=;{]*)?=\\s*`, 'g');
  const rest = new RegExp(`\\b(?:const|let|var)\\s*\\{[^{}]*\\.\\.\\.\\s*${name}\\s*\\}\\s*(?::[^=;]*)?=`, 'g');
  const region = code.slice(from, to);

  const lastOf = (pattern: RegExp): RegExpExecArray | null => {
    let last: RegExpExecArray | null = null;
    let hit: RegExpExecArray | null;
    while ((hit = pattern.exec(region)) !== null) last = hit;
    return last;
  };

  const fromLiteral = lastOf(literal);
  const fromRest = lastOf(rest);
  const winner = (fromLiteral?.index ?? -1) > (fromRest?.index ?? -1) ? fromLiteral : fromRest;
  if (!winner) return null;

  const declaredAt = from + winner.index;
  if (winner === fromRest) return { keys: [], open: true };

  const valueStart = declaredAt + winner[0].length;
  if (code[valueStart] !== '{') return null;

  const mutated = new RegExp(`\\b${name}\\s*(?:\\.[\\w$]+\\s*=[^=]|\\[[^\\]]*\\]\\s*=[^=]|=[^=>])`).test(
    code.slice(valueStart, to)
  );

  return { keys: topLevelKeys(code, valueStart), open: mutated };
}

/** La charge utile d'un `sendSuccess`, littérale ou passée par une variable locale. */
function sentPayload(code: string, argStart: number, regionStart: number): SentPayload | null {
  if (code[argStart] === '{') return { keys: topLevelKeys(code, argStart), open: false };
  if (!carriesPayload(code, argStart)) return null;

  const ident = /^[A-Za-z_$][\w$]*(?=\s*[,)])/.exec(code.slice(argStart, argStart + 120))?.[0];
  return ident ? resolveLocalPayload(code, ident, regionStart, argStart) : null;
}

const NO_PAYLOAD = /^(?:undefined|null|void\s+0)\s*[,)]/;

/**
 * `sendSuccess(reply, undefined)` et `sendSuccess(reply, null)` n'écrivent AUCUNE
 * clé `data` sur le fil : un schéma qui ne déclare que `success` y dit vrai.
 *
 * Sans cette question, la forme `envelope` signalait dix accusés de réception
 * parfaitement corrects pour quatre vrais défauts — et un balayage qui crie plus
 * souvent qu'il n'a raison finit gelé en bloc, ce qui coûte plus cher que le
 * trou qu'il ferme.
 */
function carriesPayload(code: string, argStart: number): boolean {
  return !NO_PAYLOAD.test(code.slice(argStart, argStart + 16));
}

function lineOf(code: string, index: number): number {
  return code.slice(0, index).split('\n').length;
}

/** Les désaccords schéma ↔ charge utile d'un fichier. */
export function scanFileForMismatches(source: string, file: string): readonly PayloadMismatch[] {
  const code = stripComments(source);
  const found: PayloadMismatch[] = [];

  const responses = /response\s*:\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = responses.exec(code)) !== null) {
    const responseOpen = code.indexOf('{', match.index);
    const responseEnd = matchBrace(code, responseOpen);

    // Le handler s'étend jusqu'à la route SUIVANTE — et « suivante » se lit sur
    // la DÉCLARATION de route, pas sur le prochain bloc `response:`.
    //
    // L'appariement d'origine s'arrêtait au `response:` suivant, ce qui suppose
    // que TOUTE route du fichier en déclare un. Dans un fichier où une seule le
    // fait — l'état nominal d'un fichier qu'on est en train de mettre en
    // conformité —, la sonde attribuait à ce schéma unique les `sendSuccess` de
    // toutes les routes d'après, et rapportait un désaccord `total` par charge
    // utile étrangère. Le premier schéma posé dans un fichier rendait donc la
    // garde rouge, ce qui décourage exactement le geste qu'elle réclame.
    //
    // Borner sur `fastify.<methode>(` referme la fenêtre à la route réelle.
    const suivants = [/response\s*:\s*\{/g, /fastify\s*\.\s*(?:get|post|put|patch|delete|options|head)\s*\(/g]
      .map((re) => {
        re.lastIndex = responseEnd;
        const m = re.exec(code);
        return m ? m.index : code.length;
      });
    const handlerEnd = Math.min(...suivants);

    const sends = /sendSuccess\s*\(\s*reply\s*,\s*/g;
    sends.lastIndex = responseEnd;
    const calls: number[] = [];
    let send: RegExpExecArray | null;
    while ((send = sends.exec(code)) !== null && send.index < handlerEnd) {
      calls.push(send.index + send[0].length);
    }

    // L'enveloppe d'abord : quand `data` n'est pas déclaré, comparer les clés
    // INTÉRIEURES n'a plus de sens — il n'y a plus d'intérieur.
    if (calls.some((argStart) => carriesPayload(code, argStart))) {
      for (const gap of envelopeGaps(code, responseOpen)) {
        found.push({ file, line: lineOf(code, gap.at), kind: 'envelope', declared: gap.declared, dropped: ['data'] });
      }
    }

    const declared = declaredDataKeys(code, responseOpen, responseEnd);
    if (!declared) continue;

    for (const argStart of calls) {
      const sent = sentPayload(code, argStart, responseEnd);
      if (!sent) continue;

      const open = sent.open || sent.keys.includes(SPREAD);
      const literal = sent.keys.filter((key) => key !== SPREAD);
      if (literal.length === 0) continue;

      const dropped = literal.filter((key) => !declared.includes(key));
      if (dropped.length === 0) continue;

      found.push({
        file,
        line: lineOf(code, argStart),
        // Un jeu OUVERT peut apporter les clés déclarées : jamais « total ».
        kind: !open && dropped.length === literal.length ? 'total' : 'partial',
        declared,
        dropped,
      });
    }
  }

  return found;
}

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

/** Tous les désaccords du répertoire de routes, chemins relatifs à `routesDir`. */
export function sweepPayloadMismatches(routesDir: string): readonly PayloadMismatch[] {
  return walk(routesDir).flatMap((full) =>
    scanFileForMismatches(readFileSync(full, 'utf8'), relative(routesDir, full))
  );
}

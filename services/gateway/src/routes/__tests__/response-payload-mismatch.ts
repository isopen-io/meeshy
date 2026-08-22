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
 * ## Ce que l'outil sait faire, et ce qu'il ne sait pas
 *
 * Il apparie un bloc `response:` avec les `sendSuccess(reply, { … })` qui le
 * SUIVENT, jusqu'au prochain bloc `response:` — le handler d'une route vit
 * toujours entre les deux. Il ne lit que les littéraux d'objet : un
 * `sendSuccess(reply, maVariable)` lui échappe, et c'est assumé — remonter
 * jusqu'à la variable demanderait un typeur, pas un balayage.
 *
 * Un `...spread` dans la charge utile rend le jeu de clés OUVERT : l'outil ne
 * conclut alors JAMAIS à une perte totale (le spread peut apporter les clés
 * déclarées), et ne signale que les clés littérales manquantes.
 */

export type PayloadMismatch = {
  readonly file: string;
  readonly line: number;
  /** `total` : aucune clé envoyée n'est déclarée ⇒ `data` sort à `{}`. */
  readonly kind: 'total' | 'partial';
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

/**
 * Les clés de PREMIER niveau d'un objet littéral, `...spread` compris (rendu
 * sous la sentinelle `SPREAD`). Découpe sur les virgules de profondeur zéro —
 * un objet, un tableau ou un appel imbriqué ne produit donc aucune clé.
 */
export function topLevelKeys(source: string, openIndex: number): readonly string[] {
  const body = source.slice(openIndex + 1, matchBrace(source, openIndex));
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));

  return parts.flatMap((part) => {
    const trimmed = part.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('...')) return [SPREAD];
    const named = /^([A-Za-z_$][\w$]*)\s*:/.exec(trimmed)?.[1]
      // Forme abrégée `{ userId, role }`.
      ?? /^([A-Za-z_$][\w$]*)$/.exec(trimmed)?.[1];
    return named ? [named] : [];
  });
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

/** Les désaccords schéma ↔ charge utile d'un fichier. */
export function scanFileForMismatches(source: string, file: string): readonly PayloadMismatch[] {
  const code = stripComments(source);
  const found: PayloadMismatch[] = [];

  const responses = /response\s*:\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = responses.exec(code)) !== null) {
    const responseOpen = code.indexOf('{', match.index);
    const responseEnd = matchBrace(code, responseOpen);

    const declared = declaredDataKeys(code, responseOpen, responseEnd);
    if (!declared) continue;

    // Le handler s'étend jusqu'au bloc `response:` de la route suivante.
    const next = /response\s*:\s*\{/g;
    next.lastIndex = responseEnd;
    const following = next.exec(code);
    const handlerEnd = following ? following.index : code.length;

    const sends = /sendSuccess\s*\(\s*reply\s*,\s*\{/g;
    sends.lastIndex = responseEnd;
    let send: RegExpExecArray | null;

    while ((send = sends.exec(code)) !== null && send.index < handlerEnd) {
      const payloadOpen = code.indexOf('{', send.index + send[0].length - 1);
      const sent = topLevelKeys(code, payloadOpen);
      const spreads = sent.includes(SPREAD);
      const literal = sent.filter((k) => k !== SPREAD);
      if (literal.length === 0) continue;

      const dropped = literal.filter((k) => !declared.includes(k));
      if (dropped.length === 0) continue;

      found.push({
        file,
        line: code.slice(0, payloadOpen).split('\n').length,
        // Un spread peut apporter les clés déclarées : jamais « total ».
        kind: !spreads && dropped.length === literal.length ? 'total' : 'partial',
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

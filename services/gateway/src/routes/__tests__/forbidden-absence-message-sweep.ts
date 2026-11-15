import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import { stripComments } from './response-schema-sweep';

/**
 * Le balayage des messages d'ABSENCE servis sous un 403 (#4856).
 *
 * `services/gateway/decisions.md:640` explique pourquoi certaines portes
 * répondent délibérément 403 plutôt que 404 : distinguer « interdit » d'
 * « inexistant » ferait de la route un oracle d'existence. Cette décision ne
 * protège rien si le TEXTE qui accompagne le 403 dit lui-même « Conversation
 * not found » — le statut tait ce que le message révèle.
 *
 * Le balayage cherche donc, dans TOUT appel `sendForbidden(...)` du répertoire
 * de routes, un littéral de chaîne qui nomme une absence — anglaise ou
 * française. Il regarde CHAQUE littéral de l'appel (pas seulement le premier
 * argument) pour attraper la forme la plus discrète trouvée en écrivant ce
 * cliquet : `sendForbidden(reply, isAnonymous ? 'Participant not found' :
 * 'Access denied to this conversation')` — un ternaire dont une seule branche
 * fuit, invisible à un `grep` qui n'ancre que `sendForbidden(reply, '...'`.
 *
 * C'est un cliquet à inventaire VIDE (critère de fin #5 de #4856) : il n'y a
 * pas de 403 « not found » légitime à porter. Un site qui a vraiment besoin de
 * dire « ça n'existe pas » sert un 404, jamais un 403.
 */

/**
 * Les tournures qui nomment une ABSENCE, anglaises et françaises. Volontairement
 * étroit — `not found` / `n'existe pas`, pas `found` seul, qui rendrait un faux
 * positif sur une phrase comme « No accessible messages found » (un résultat
 * de LOT agrégé, qui ne nomme aucune ressource précise et ne fuit donc rien).
 */
const ABSENCE_PATTERNS: readonly RegExp[] = [
  /\bnot found\b/i,
  /\bdoes(?:n't| not) exist\b/i,
  /n'existe pas/i,
  /n'existent pas/i,
  /introuvable/i,
];

export type ForbiddenAbsenceSite = {
  readonly file: string;
  readonly line: number;
  readonly literal: string;
};

function isAbsenceMessage(literal: string): boolean {
  return ABSENCE_PATTERNS.some((re) => re.test(literal));
}

/** Les littéraux de chaîne (simple/double/gabarit) au premier niveau d'un texte. */
function stringLiterals(source: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let body = '';
      while (j < source.length && source[j] !== c) {
        if (source[j] === '\\') {
          body += source[j + 1];
          j += 2;
          continue;
        }
        body += source[j];
        j++;
      }
      out.push(body);
      i = j;
    }
  }
  return out;
}

/** Fin (exclusive) de la liste d'arguments ouverte à `openParenIndex`. */
function matchParen(source: string, openParenIndex: number): number {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) {
        if (source[j] === '\\') j += 2;
        else j++;
      }
      i = j;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

/** Le numéro de ligne (1-indexé) de l'offset `index` dans `source`. */
function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/** Tous les sites `sendForbidden(...)` d'un fichier dont un littéral nomme une absence. */
export function scanForbiddenAbsenceMessages(source: string, file: string): ReadonlyArray<ForbiddenAbsenceSite> {
  const code = stripComments(source);
  const sites: ForbiddenAbsenceSite[] = [];

  const callRe = /\bsendForbidden\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(code)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(code, open);
    const args = code.slice(open + 1, close);

    for (const literal of stringLiterals(args)) {
      if (isAbsenceMessage(literal)) {
        sites.push({ file, line: lineOf(code, m.index), literal });
      }
    }
  }

  return sites;
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

/** Tous les messages d'absence servis sous un 403, dans tout le répertoire de routes. */
export function sweepForbiddenAbsenceMessages(routesDir: string): ReadonlyArray<ForbiddenAbsenceSite> {
  return walk(routesDir).flatMap((full) =>
    scanForbiddenAbsenceMessages(readFileSync(full, 'utf8'), relative(routesDir, full))
  );
}

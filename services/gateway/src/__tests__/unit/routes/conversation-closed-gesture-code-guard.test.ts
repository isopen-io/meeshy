import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  writeRefusalHttpResponse,
  type ConversationWriteRefused,
} from '../../../services/messaging/conversationWriteAdmission';

/**
 * Un 410 NOMME sa raison (audit #19352 A6). Sans code, le client Android
 * substitue `HTTP_410`, classe le refus en panne passagère et rejoue le geste
 * cinq fois — épingler dans un fil terminé le faisait encore, par un message
 * DYNAMIQUE qu'aucune phrase littérale ne reconnaissait.
 *
 * La garde porte donc sur ce que la réponse PORTE, pas sur sa phrase :
 * - le point de convergence des refus d'écriture (`writeRefusalHttpResponse`,
 *   que l'épingle, le partage de traduction et le message de lien relaient)
 *   rend un code avec chacun de ses 410 ;
 * - tout 410 écrit par une route ou par le middleware nomme sa raison, sous
 *   ses trois formes — `sendError(reply, 410, …)`, `sendGone(reply, …)` et
 *   `reply.status(410).send(…)` : un `code`, ou un motif en capitales dans
 *   `error` (les routes de lien et la révocation d'un invité, lues ainsi par
 *   leurs clients depuis toujours).
 */
const SRC = join(__dirname, '../../..');
const WRITERS = ['routes', 'middleware'].map((dir) => join(SRC, dir));

function sourcesUnder(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourcesUnder(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

/** Les arguments d'un appel, parenthèses imbriquées et chaînes comprises. */
function callArguments(source: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (quote !== null) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

/** Les trois formes d'un 410, et où commencent les arguments qui doivent nommer sa raison. */
const GONE_FORMS: readonly { readonly form: string; readonly pattern: RegExp; readonly named: RegExp }[] = [
  { form: 'sendError', pattern: /sendError\(\s*reply\s*,\s*410\s*,/g, named: /^\s*reply\s*,\s*410\s*,\s*'[A-Z][A-Z0-9_]+'/ },
  { form: 'sendGone', pattern: /sendGone\(/g, named: /^\s*reply\s*,\s*'[A-Z][A-Z0-9_]+'/ },
  { form: 'reply.status(410)', pattern: /reply\.(?:status|code)\(\s*410\s*\)\s*\.send\(/g, named: /\berror\s*:\s*'[A-Z][A-Z0-9_]+'/ },
];

const goneSitesOf = (path: string, source: string) =>
  GONE_FORMS.flatMap(({ form, pattern, named }) =>
    [...source.matchAll(pattern)].map((match) => {
      const open = (match.index ?? 0) + match[0].lastIndexOf('(');
      return { file: relative(SRC, path), form, named, args: callArguments(source, form === 'sendError' ? (match.index ?? 0) + 'sendError'.length : open) };
    }),
  );

const REFUSALS: readonly ConversationWriteRefused[] = [
  { admitted: false, reason: 'conversation-closed' },
  { admitted: false, reason: 'write-role-insufficient' },
  { admitted: false, reason: 'minor-global' },
  { admitted: false, reason: 'slow-mode-active', retryAfterSeconds: 3 },
  { admitted: false, reason: 'newcomer-slow-mode', retryAfterSeconds: 3 },
];

describe('un 410 nomme toujours sa raison', () => {
  it.each(REFUSALS.map((refusal) => [refusal.reason, refusal] as const))(
    'refus d’écriture « %s » : un 410 porte un code',
    (_reason, refusal) => {
      const response = writeRefusalHttpResponse(refusal);
      if (response.status !== 410) return;
      expect('code' in response ? response.code : undefined).toBe('CONVERSATION_CLOSED');
    },
  );

  const sites = WRITERS.flatMap(sourcesUnder).flatMap((path) => goneSitesOf(path, readFileSync(path, 'utf8')));

  it.each(GONE_FORMS.map(({ form }) => form))('trouve les 410 écrits sous la forme %s (la garde ne garde pas un ensemble vide)', (form) => {
    expect(sites.filter((site) => site.form === form).length).toBeGreaterThan(0);
  });

  it('trouve les 410 écrits par les routes et le middleware', () => {
    expect(sites.length).toBeGreaterThanOrEqual(30);
  });

  it('aucune route ni le middleware n’écrit un 410 sans nommer sa raison', () => {
    const unnamed = sites.filter((site) => !/\bcode\s*:/.test(site.args) && !site.named.test(site.args));
    expect(unnamed.map((site) => `${site.file} (${site.form}): ${site.args.replace(/\s+/g, ' ').trim()}`)).toEqual([]);
  });
});

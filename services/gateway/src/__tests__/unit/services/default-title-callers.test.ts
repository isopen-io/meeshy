import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * GARDE DE SOURCE (#8970) — tout appelant de `generateDefaultConversationTitle`
 * passe `firstName` ET `lastName`.
 *
 * La fonction nomme un membre `displayName` → `firstName lastName` →
 * `username` (`packages/shared/utils/conversation-helpers.ts`). Un appelant qui
 * omet le nom réel ne dégrade pas le titre : il le rend IMPOSSIBLE — la
 * fonction ne peut retomber que sur `@username`, et rien ne rougit, ni au
 * compilateur (les quatre champs sont optionnels) ni à l'exécution. C'est
 * exactement ce qui était arrivé à `routes/conversations/search.ts`, seule des
 * quatre portes à ne passer que deux champs, son `select` Prisma ne chargeant
 * même pas les deux autres.
 *
 * Portée assumée, dite ici plutôt que devinée plus tard : cette garde lit du
 * TEXTE, pas un graphe de types. Elle vérifie que les deux identifiants
 * apparaissent dans les arguments de l'appel, commentaires retirés — elle ne
 * vérifie pas que la valeur passée provient d'un `select` qui les charge. Un
 * appelant pourrait donc passer `firstName: undefined` et rester vert. Ce
 * qu'elle attrape est le défaut RÉEL observé : l'oubli pur et simple.
 *
 * Les commentaires sont retirés AVANT analyse : le commentaire du `select` de
 * `search.ts` contient la prose « `firstName lastName` », et un garde qui lit
 * la prose se croit vert sur un appelant fautif (leçon 2026-07-26-216i).
 */

const GATEWAY_SRC = join(__dirname, '../../..');
const NEEDLE = 'generateDefaultConversationTitle(';

/** Retire les commentaires de ligne et de bloc. Seules les lignes de code restent. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

/** Le texte des arguments d'un appel commençant à `start` (parenthèses équilibrées). */
function callArguments(code: string, start: number): string {
  let depth = 0;
  for (let i = start; i < code.length; i += 1) {
    const char = code[i];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return code.slice(start + NEEDLE.length, i);
    }
  }
  return code.slice(start);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === '__tests__' || entry === 'node_modules' ? [] : sourceFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

/** Chaque appel de production, avec son fichier et le texte de ses arguments. */
function productionCalls(): { file: string; args: string }[] {
  const calls: { file: string; args: string }[] = [];
  for (const file of sourceFiles(GATEWAY_SRC)) {
    const code = stripComments(readFileSync(file, 'utf8'));
    let from = code.indexOf(NEEDLE);
    while (from !== -1) {
      // L'import nommé porte le symbole sans parenthèse ouvrante : il ne peut
      // pas matcher NEEDLE. Un appel, si.
      calls.push({ file: file.slice(GATEWAY_SRC.length + 1), args: callArguments(code, from) });
      from = code.indexOf(NEEDLE, from + NEEDLE.length);
    }
  }
  return calls;
}

const carriesRealName = (args: string): boolean =>
  /\bfirstName\b/.test(args) && /\blastName\b/.test(args);

describe('generateDefaultConversationTitle — garde de câblage des appelants (#8970)', () => {
  it('le détecteur se valide sur un échantillon avant de juger le dépôt', () => {
    const forbidden = [
      'members.map((m) => ({ id: m.userId, displayName: m.user?.displayName, username: m.user?.username })), userId',
      'others.map((u) => ({ id: u.id, displayName: u.displayName })), viewerId',
      'members.map((m) => ({ id: m.userId, firstName: m.user?.firstName })), userId',
      'members.map((m) => ({ id: m.userId, lastName: m.user?.lastName })), userId',
    ];
    const permitted = [
      'members.map((m) => ({ id: m.userId, displayName: m.user?.displayName, username: m.user?.username, firstName: m.user?.firstName, lastName: m.user?.lastName })), userId',
      'others.map((u) => ({ id: u.id, firstName: u.firstName ?? undefined, lastName: u.lastName ?? undefined })), viewerUserId ?? \'\'',
    ];
    expect(forbidden.filter(carriesRealName)).toEqual([]);
    expect(permitted.filter((sample) => !carriesRealName(sample))).toEqual([]);
  });

  it('la prose d’un commentaire ne suffit pas à rendre un appelant vert', () => {
    const code = stripComments(
      [
        '// on nomme par firstName lastName puis username',
        '/* firstName et lastName sont chargés ailleurs */',
        'const title = generateDefaultConversationTitle(members.map((m) => ({ id: m.userId, username: m.username })), userId);',
      ].join('\n'),
    );
    expect(carriesRealName(callArguments(code, code.indexOf(NEEDLE)))).toBe(false);
  });

  it('trouve les appels de production attendus', () => {
    const files = productionCalls().map((call) => call.file).sort();
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files).toContain('routes/conversations/search.ts');
    expect(files).toContain('services/conversationCard.ts');
  });

  it('chaque appelant passe firstName ET lastName', () => {
    const offenders = productionCalls()
      .filter((call) => !carriesRealName(call.args))
      .map((call) => call.file);
    expect(offenders).toEqual([]);
  });
});

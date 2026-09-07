/**
 * GARDE DE SOURCE (#3646) — un seul hook lit les messages d'une conversation.
 *
 * `hooks/use-conversation-messages.ts` était un second chemin de lecture,
 * jamais importé en production — seul son propre test mort
 * (`__tests__/hooks/use-conversation-messages.test.tsx`) le référençait, et
 * `hooks/index.ts` n'a jamais exporté que le hook React Query
 * (`useConversationMessagesRQ as useConversationMessages`). Même
 * configuration que celle réparée par `reading-mode-single-store-guard.test.ts` :
 * un second chemin qui ne sert plus personne, laissé en place, est ce qui
 * permet à un troisième d'apparaître sans que personne ne le remarque.
 *
 * Ce fichier a donc été retiré (#3646, avec son test mort) ; cette garde
 * interdit à un second hook de lecture — sous CE nom ou un autre — de
 * revenir en silence.
 */
import * as fs from 'fs';
import * as path from 'path';

const WEB_ROOT = path.join(__dirname, '..', '..');
const CANONICAL_HOOK = 'hooks/queries/use-conversation-messages-rq.ts';
const REMOVED_LEGACY_HOOK = path.join(WEB_ROOT, 'hooks/use-conversation-messages.ts');

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  '__tests__',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

const isTestFile = (filePath: string): boolean => /\.(test|spec)\.[jt]sx?$/.test(filePath);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    const ext = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    if (isTestFile(fullPath)) continue;
    files.push(fullPath);
  }
  return files;
}

/** Même parti pris que les autres gardes de source : le CODE est gardé, pas le texte qui l'explique. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe("garde de source — un seul hook lit les messages d'une conversation (#3646)", () => {
  it('un seul fichier exporte un hook de lecture `use…[Cc]onversation[Mm]essages…`', () => {
    const offenders = walk(WEB_ROOT)
      .filter((file) =>
        /export\s+(function|const)\s+use\w*[Cc]onversation[Mm]essages/.test(
          stripComments(fs.readFileSync(file, 'utf8')),
        ),
      )
      .map((file) => path.relative(WEB_ROOT, file))
      .sort();

    expect(offenders).toEqual([CANONICAL_HOOK]);
  });

  it("`hooks/index.ts` n'expose qu'une seule façade de lecture des messages, celle du hook React Query", () => {
    const code = stripComments(fs.readFileSync(path.join(WEB_ROOT, 'hooks/index.ts'), 'utf8'));
    const occurrences = code.match(/useConversationMessages\b/g) ?? [];

    expect(occurrences.length).toBe(1);
    expect(code).toContain("useConversationMessagesRQ as useConversationMessages } from './queries/use-conversation-messages-rq'");
  });

  it("le hook legacy retiré (#3646) ne réapparaît pas à son ancien chemin", () => {
    expect(fs.existsSync(REMOVED_LEGACY_HOOK)).toBe(false);
  });
});

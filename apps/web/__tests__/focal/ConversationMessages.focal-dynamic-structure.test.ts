/**
 * WF-110 — garde structurelle du chargement paresseux du mux Focal, MÊME
 * patron que `ConversationList.lentille-dynamic-structure.test.ts` (WL-101).
 */
import * as fs from 'fs';
import * as path from 'path';

const CONVERSATION_MESSAGES_PATH = path.join(
  __dirname,
  '../../components/conversations/ConversationMessages.tsx'
);

const SOURCE = fs.readFileSync(CONVERSATION_MESSAGES_PATH, 'utf8');

const STATIC_IMPORT_LINES = SOURCE.split('\n').filter((line) => /^\s*import\s/.test(line));

describe('ConversationMessages — chargement paresseux de la sous-arborescence Focal', () => {
  it('importe `dynamic` depuis next/dynamic', () => {
    expect(SOURCE).toMatch(/import\s+dynamic\s+from\s+['"]next\/dynamic['"]/);
  });

  it('charge FocalThread via dynamic(() => import(...))', () => {
    expect(SOURCE).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*\n?\s*import\(['"]\.\/focal\/FocalThread['"]\)/
    );
  });

  it("n'importe JAMAIS FocalThread de façon statique (aucune ligne `import ... from './focal/...'`)", () => {
    const staticFocalImports = STATIC_IMPORT_LINES.filter((line) =>
      /from\s+['"]\.\/focal\//.test(line)
    );
    expect(staticFocalImports).toEqual([]);
  });

  it("le module FocalThread n'est référencé QUE par sa cible dynamic() — aucun second point d'entrée", () => {
    const moduleReferences = SOURCE.match(/import\(['"]\.\/focal\/FocalThread['"]\)/g);
    expect(moduleReferences).toHaveLength(1);
  });
});

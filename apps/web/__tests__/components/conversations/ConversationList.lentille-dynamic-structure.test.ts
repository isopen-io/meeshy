/**
 * WL-101 (LWS-10) — garde structurelle du chargement paresseux.
 *
 * Contrat : « Coût nul pour qui n'active pas. Sous-arborescence chargée en
 * `next/dynamic` : drapeau off ⇒ bundle non téléchargé. »
 *
 * Sous Jest, `next/dynamic` ne prouve rien à l'exécution : la transformation
 * SWC/babel de Next peut résoudre l'`import()` de façon synchrone dans
 * l'environnement de test, ce qui rendrait un test « le bundle n'est pas
 * chargé » vert ou rouge pour de mauvaises raisons. La preuve fiable est
 * STRUCTURELLE (même idiome que `ios-pr-compile-gate.test.ts` et
 * `video-calls/index.test.ts` de ce dépôt) : on lit le SOURCE de
 * `ConversationList.tsx` et on vérifie que le composant Lentille n'est
 * atteignable que par `dynamic(() => import(...))`, jamais par un `import`
 * statique en tête de fichier — un `import` statique forcerait le bundler à
 * inclure le module dans le chunk parent, drapeau ou pas.
 */
import * as fs from 'fs';
import * as path from 'path';

const CONVERSATION_LIST_PATH = path.join(
  __dirname,
  '../../../components/conversations/ConversationList.tsx'
);

const SOURCE = fs.readFileSync(CONVERSATION_LIST_PATH, 'utf8');

/** Lignes d'import statiques classiques, en tête de fichier. */
const STATIC_IMPORT_LINES = SOURCE.split('\n').filter(line =>
  /^\s*import\s/.test(line)
);

describe('ConversationList — chargement paresseux de la sous-arborescence Lentille', () => {
  it('importe `dynamic` depuis next/dynamic', () => {
    expect(SOURCE).toMatch(/import\s+dynamic\s+from\s+['"]next\/dynamic['"]/);
  });

  it('charge le point de montage Lentille via dynamic(() => import(...))', () => {
    expect(SOURCE).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*\n?\s*import\(['"]\.\/lentille\/LentilleConversationListMount['"]\)/
    );
  });

  it("n'importe JAMAIS le point de montage Lentille de façon statique (aucune ligne `import ... from './lentille/...'`)", () => {
    const staticLentilleImports = STATIC_IMPORT_LINES.filter(line =>
      /from\s+['"]\.\/lentille\//.test(line)
    );

    expect(staticLentilleImports).toEqual([]);
  });

  it("le module Lentille n'est référencé QUE par sa cible dynamic() — aucun second point d'entrée", () => {
    // Toutes les occurrences du chemin du module doivent être dans un appel
    // `import('./lentille/LentilleConversationListMount')` — jamais dans un
    // `import ... from` statique (déjà couvert ci-dessus), et jamais dans un
    // second `dynamic()` qui dupliquerait le point de montage.
    const moduleReferences = SOURCE.match(
      /import\(['"]\.\/lentille\/LentilleConversationListMount['"]\)/g
    );

    expect(moduleReferences).toHaveLength(1);
  });
});

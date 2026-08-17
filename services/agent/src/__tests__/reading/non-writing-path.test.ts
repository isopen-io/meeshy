import fs from 'node:fs';
import path from 'node:path';

// G-126 — TÉMOIN STRUCTUREL du chemin non écrivant (contrat §5.1, C3).
//
// Les tests de comportement prouvent que le débouché de lecture n'écrit pas AUJOURD'HUI.
// Celui-ci prouve qu'il ne le PEUT pas : on referme la clôture d'imports du chemin de
// lecture et on constate qu'aucun module écrivant n'y figure. Pour livrer dans le fil il
// faudrait `generator`, `delivery`, le publisher ZMQ ou un client réseau ; aucun n'est
// atteignable depuis l'entrée du chemin, et rien ne peut y entrer sans faire rougir ce test.
//
// C'est cette forme, et pas un second graphe LangGraph : dans un graphe, les nœuds et les
// arêtes s'ajoutent à l'exécution — « par construction » y serait une promesse d'intention.
// Une clôture d'imports, elle, est vérifiable sur le disque et ne ment pas.

const SRC_ROOT = path.resolve(__dirname, '../..');

const READING_ENTRY_POINTS = [
  'reading/bridge-reading-outlet.ts',
  'routes/reading.ts',
];

/** Les modules par lesquels une écriture dans le fil passe forcément aujourd'hui. */
const WRITING_MODULES = [
  'agents/generator.ts',
  'agents/strategist.ts',
  'agents/quality-gate.ts',
  'agents/fresh-topic.ts',
  'graph/graph.ts',
  'delivery/redis-delivery-queue.ts',
  'delivery/delay-resolver.ts',
  'routes/delivery.ts',
  'zmq/zmq-publisher.ts',
  'zmq/zmq-listener.ts',
  'scheduler/conversation-scanner.ts',
  'reactive/reactive-handler.ts',
  'memory/mongo-persistence.ts',
  'memory/redis-state.ts',
  'server.ts',
];

/** Seuls paquets externes tolérés sur le chemin de lecture : validation d'entrée et types HTTP. */
const ALLOWED_EXTERNAL_PACKAGES = ['zod', 'fastify'];

/** Retire commentaires de ligne et de bloc — leçon S-003 : une garde ne lit jamais la prose. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readCode(relativePath: string): string {
  return stripComments(fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8'));
}

function importSpecifiersOf(code: string): string[] {
  const specifiers: string[] = [];
  const staticImport = /(?:from|import)\s+['"]([^'"]+)['"]/g;
  const dynamicImport = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [staticImport, dynamicImport]) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveRelative(fromRelative: string, specifier: string): string | null {
  const base = path.join(path.dirname(path.join(SRC_ROOT, fromRelative)), specifier.replace(/\.js$/, ''));
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return path.relative(SRC_ROOT, candidate);
  }
  return null;
}

/** Clôture transitive des imports relatifs, entrées comprises. */
function importClosure(entryPoints: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entryPoints];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const specifier of importSpecifiersOf(readCode(current))) {
      if (!specifier.startsWith('.')) continue;
      const resolved = resolveRelative(current, specifier);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen].sort();
}

describe('le chemin de lecture ne peut PAS atteindre generator/delivery (G-126, C3)', () => {
  it('les modules écrivants cités par la garde existent tous — la garde ne se vide pas en silence', () => {
    for (const relativePath of [...WRITING_MODULES, ...READING_ENTRY_POINTS]) {
      expect(fs.existsSync(path.join(SRC_ROOT, relativePath))).toBe(true);
    }
  });

  it('aucun module écrivant n\'apparaît dans la clôture d\'imports du chemin de lecture', () => {
    const closure = importClosure(READING_ENTRY_POINTS);
    const intersection = closure.filter((module) => WRITING_MODULES.includes(module));
    expect(intersection).toEqual([]);
  });

  it('la clôture reste minuscule et entièrement adossée à l\'observer', () => {
    const closure = importClosure(READING_ENTRY_POINTS);
    expect(closure).toContain('agents/observer.ts');
    expect(closure.length).toBeLessThanOrEqual(8);
  });

  // [Q-146/R6-1] La clôture d'imports EXACTE — pas un plafond de taille.
  //
  // La garde ci-dessus (`length <= 8`) borne la TAILLE de la clôture, pas son
  // CONTENU : un module écrivant absent de `WRITING_MODULES` (donc hors de
  // l'intersection testée deux témoins plus haut) peut s'y glisser tant que
  // le total reste sous la barre. Preuve retenue (R6-1) : importer
  // `topics/TopicUsageService` (un écrivain Mongo réel — `agentTopicUsageLog
  // .create` — absent de `WRITING_MODULES`) depuis `bridge-reading-outlet.ts`
  // porte la clôture à 8 modules (lui + `topics/types.ts`) : encore ≤ 8, et
  // toujours zéro intersection avec `WRITING_MODULES` puisque son propre nom
  // n'y figure dans aucune des deux listes — les huit témoins de cette suite
  // restaient tous VERTS avant ce durcissement.
  //
  // Une ALLOWLIST exacte ferme ce trou : toute nouvelle entrée, écrivante ou
  // non, fait rougir ce test et devient une décision relue plutôt qu'un
  // import qui se glisse sous un plafond numérique.
  it('la clôture est EXACTEMENT les 6 modules légitimes du chemin de lecture — allowlist', () => {
    const closure = importClosure(READING_ENTRY_POINTS);
    expect(closure).toEqual([
      'agents/observer.ts',
      'graph/state.ts',
      'llm/types.ts',
      'reading/bridge-reading-outlet.ts',
      'routes/reading.ts',
      'utils/parse-json-llm.ts',
    ]);
  });

  it('le chemin de lecture n\'ouvre aucune autre porte de sortie : pas de client réseau, pas de base', () => {
    for (const entry of READING_ENTRY_POINTS) {
      const externals = importSpecifiersOf(readCode(entry)).filter((s) => !s.startsWith('.'));
      for (const external of externals) {
        expect(ALLOWED_EXTERNAL_PACKAGES).toContain(external);
      }
    }
  });

  it('le chemin de lecture ne charge rien à l\'exécution — ni require, ni import dynamique', () => {
    for (const entry of READING_ENTRY_POINTS) {
      const code = readCode(entry);
      expect(code).not.toMatch(/\brequire\s*\(/);
      expect(code).not.toMatch(/\bimport\s*\(/);
    }
  });

  it('le chemin de lecture ne nomme aucune identité d\'emprunt', () => {
    for (const entry of READING_ENTRY_POINTS) {
      const code = readCode(entry);
      for (const token of ['asUserId', 'controlledUsers', 'PendingAction', 'PendingMessage', 'interventionPlan']) {
        expect(code).not.toContain(token);
      }
    }
  });

  // TÉMOIN — le câblage de production lui-même. Le débouché est construit sur un port de
  // lecture et remis à la seule route de lecture : il n'est jamais tendu à la file de livraison,
  // au scanner ni au gestionnaire réactif. Toute autre ligne le mentionnant fait rougir ce test.
  it('le câblage de production ne remet le débouché qu\'à la route de lecture', () => {
    const server = readCode('server.ts');
    const mentions = server
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes('bridgeReadingOutlet'));

    expect(mentions.length).toBeGreaterThan(0);
    for (const line of mentions) {
      expect(line).toMatch(/createBridgeReadingOutlet|readingRoutes/);
    }
    expect(server).toContain('messageReaderFromStore(stateManager)');
  });

  it('le graphe d\'animation reste INTACT — le débouché de lecture ne s\'y greffe pas', () => {
    const graph = readCode('graph/graph.ts');
    expect(graph).not.toMatch(/reading/i);
    expect(graph).toMatch(/addEdge\('observe', 'strategist'\)/);
  });
});

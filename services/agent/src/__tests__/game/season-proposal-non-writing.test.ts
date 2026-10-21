import fs from 'node:fs';
import path from 'node:path';

// #10234 — TÉMOIN STRUCTUREL : la proposition de saison est une proposition PURE.
//
// Les tests de comportement montrent qu'elle ne publie, n'écrit ni ne planifie rien
// AUJOURD'HUI. Celui-ci montre qu'elle ne le PEUT pas : on referme la clôture d'imports
// du chemin (service + route, et la loi partagée qu'il lit) et on constate qu'aucun module
// écrivant, aucune base, aucun client réseau, aucune file n'y figure. Un humain valide
// ensuite, ailleurs (gateway / admin) : rien ici ne l'y substitue.
// Même méthode que `reading/non-writing-path.test.ts` (G-126).

const SRC_ROOT = path.resolve(__dirname, '../..');
const SHARED_ROOT = path.resolve(SRC_ROOT, '../../../packages/shared');

const ENTRY_POINTS = ['game/season-proposal.ts', 'routes/season-proposal.ts'];

const WRITING_MODULES = [
  'agents/generator.ts',
  'agents/strategist.ts',
  'graph/graph.ts',
  'delivery/redis-delivery-queue.ts',
  'routes/delivery.ts',
  'zmq/zmq-publisher.ts',
  'zmq/zmq-listener.ts',
  'scheduler/conversation-scanner.ts',
  'memory/mongo-persistence.ts',
  'memory/redis-state.ts',
  'server.ts',
];

/** La loi partagée lue par le chemin : seuls ces modules purs, en lecture. */
const ALLOWED_SHARED = [
  '@meeshy/shared/utils/game/season-schedule',
  '@meeshy/shared/utils/game/season',
  '@meeshy/shared/utils/game/day-prng',
];
const ALLOWED_EXTERNAL = ['zod', 'fastify', ...ALLOWED_SHARED];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readAbs(abs: string): string {
  return stripComments(fs.readFileSync(abs, 'utf8'));
}

function importSpecifiersOf(code: string): string[] {
  const specifiers: string[] = [];
  for (const re of [/(?:from|import)\s+['"]([^'"]+)['"]/g, /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g]) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) specifiers.push(match[1]!);
  }
  return specifiers;
}

function resolveTs(fromAbs: string, specifier: string): string | null {
  const base = path.join(path.dirname(fromAbs), specifier.replace(/\.js$/, ''));
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Clôture des imports relatifs, côté agent. */
function agentClosure(): string[] {
  const seen = new Set<string>();
  const queue = ENTRY_POINTS.map((p) => path.join(SRC_ROOT, p));
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const s of importSpecifiersOf(readAbs(current))) {
      if (!s.startsWith('.')) continue;
      const resolved = resolveTs(current, s);
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen].map((abs) => path.relative(SRC_ROOT, abs)).sort();
}

/** Clôture de la loi partagée lue par le chemin, et les imports NON relatifs qu'elle contient. */
function sharedClosure(): { modules: string[]; externals: string[] } {
  const seen = new Set<string>();
  const externals: string[] = [];
  const queue = ALLOWED_SHARED.map((s) => path.join(SHARED_ROOT, `${s.replace('@meeshy/shared/', '')}.ts`));
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const s of importSpecifiersOf(readAbs(current))) {
      if (!s.startsWith('.')) {
        externals.push(s);
        continue;
      }
      const resolved = resolveTs(current, s);
      if (resolved) queue.push(resolved);
    }
  }
  return { modules: [...seen].map((abs) => path.relative(SHARED_ROOT, abs)).sort(), externals };
}

describe('la proposition de saison ne peut ni publier, ni écrire, ni planifier (#10234)', () => {
  it('les modules cités par la garde existent — la garde ne se vide pas en silence', () => {
    for (const p of [...WRITING_MODULES, ...ENTRY_POINTS]) {
      expect(fs.existsSync(path.join(SRC_ROOT, p))).toBe(true);
    }
  });

  it('la clôture d\'imports côté agent est EXACTEMENT celle-ci — allowlist', () => {
    expect(agentClosure()).toEqual([
      'game/season-proposal.ts',
      'llm/types.ts',
      'routes/internal-auth.ts',
      'routes/season-proposal.ts',
      'utils/parse-json-llm.ts',
    ]);
  });

  it('aucun module écrivant dans la clôture', () => {
    expect(agentClosure().filter((m) => WRITING_MODULES.includes(m))).toEqual([]);
  });

  it('les entrées n\'importent que zod, fastify et la loi partagée — pas de base, pas de réseau', () => {
    for (const entry of ENTRY_POINTS) {
      for (const external of importSpecifiersOf(readAbs(path.join(SRC_ROOT, entry))).filter((s) => !s.startsWith('.'))) {
        expect(ALLOWED_EXTERNAL).toContain(external);
      }
    }
  });

  it('la loi partagée lue est pure : sa clôture n\'importe aucun paquet (ni prisma, ni client réseau)', () => {
    const { modules, externals } = sharedClosure();
    expect(modules).toContain('utils/game/season-schedule.ts');
    expect(externals).toEqual([]);
    for (const m of modules) expect(m).not.toMatch(/prisma|client|service/i);
  });

  it('les entrées ne chargent rien à l\'exécution et ne nomment aucune écriture', () => {
    for (const entry of ENTRY_POINTS) {
      const code = readAbs(path.join(SRC_ROOT, entry));
      expect(code).not.toMatch(/\brequire\s*\(/);
      expect(code).not.toMatch(/\bimport\s*\(/);
      expect(code).not.toMatch(/\bfetch\s*\(/);
      for (const token of ['prisma', 'redis', 'deliveryQueue', 'zmq', 'applySeasonEdit', 'publish', 'schedule(']) {
        expect(code.toLowerCase()).not.toContain(token.toLowerCase());
      }
    }
  });

  it('le câblage de production ne remet à la route que le LLM et le secret interne', () => {
    const lines = readAbs(path.join(SRC_ROOT, 'server.ts'))
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.includes('seasonProposalRoutes'));
    expect(lines).toEqual([
      "import { seasonProposalRoutes } from './routes/season-proposal';",
      'server.register((instance) => seasonProposalRoutes(instance, llm, { internalToken: env.AGENT_INTERNAL_TOKEN }));',
    ]);
  });
});

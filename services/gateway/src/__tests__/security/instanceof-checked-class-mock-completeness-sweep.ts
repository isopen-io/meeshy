import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * GARDE #6296 — généralise la garde #6294 (`withMutationLog-mock-spread-guard.test.ts`)
 * à TOUT module local qui exporte une classe réellement testée par `instanceof`
 * depuis un AUTRE fichier de production.
 *
 * #6294 a fermé un cas précis : un double total de `utils/withMutationLog`
 * laisse `MutationResultGone` à `undefined`, et `instanceof undefined` lève un
 * `TypeError` qui se déguise en 500 sur un chemin d'erreur sans rapport. #6296
 * a mesuré que 93 des 397 modules totalement doublés du gateway exportent au
 * moins une classe — mais exporter une classe ne suffit pas : le risque
 * n'existe que si un fichier AUTRE que le module lui-même fait
 * `instanceof CetteClasse` sur une erreur qui peut venir d'un collaborateur
 * mocké. `GuestAccessRevokedError` (108 doubles de `middleware/auth`) est
 * lancée ET vérifiée DANS `middleware/auth.ts` lui-même : un double total de
 * ce module retire les deux à la fois, donc le motif ne peut jamais se
 * déclencher depuis l'extérieur. C'est le discriminant retenu.
 *
 * Cinq modules confirmés au 2026-09-13 :
 * `services/CallService.ts` (`CallAlreadyEndedError`, vérifiée dans
 * `AuthHandler.ts` / `CallEventsHandler.ts` / `calls-lifecycle.ts`),
 * `services/AgentHttpClient.ts` (`AgentUnavailableError`, dans
 * `routes/admin/agent-delivery-queue.ts` / `agent-configs.ts`),
 * `services/conversationPreferencesSync.ts`
 * (`ConversationPreferencesScopeError`, dans `routes/conversation-preferences.ts`),
 * `services/AudioTranslateService.ts` (`AudioTranslateError`, dans
 * `routes/voice/analysis.ts` / `translation.ts`), et
 * `routes/conversations/delete-for-me.ts`
 * (`ConversationDeleteForMeNotAParticipantError`, dans `routes/user-deletions.ts`
 * — la seule des cinq dont la classe est AUSSI vérifiée dans son propre
 * fichier, ce qui ne retire rien au risque externe).
 *
 * Les 88 autres modules à classe (services métier sans `instanceof` externe
 * mesuré) restent des doubles totaux ACCEPTÉS — décision et méthode dans
 * `services/gateway/decisions.md` § « Doubles de test partiels (#6296) ».
 */

const SRC = join(__dirname, '..', '..');
const SELF = 'instanceof-checked-class-mock-completeness-sweep.ts';

function walk(dir: string, skip: readonly string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (skip.includes(name)) return [];
    const st = statSync(path);
    if (st.isDirectory()) return walk(path, skip);
    return name.endsWith('.ts') ? [path] : [];
  });
}

/** Fichiers de PRODUCTION seulement — exclut les suites elles-mêmes. */
function productionFiles(): string[] {
  return walk(SRC, ['node_modules', 'dist', '__tests__']);
}

/** Tous les fichiers `.ts`, suites comprises — pour trouver les sites de double. */
function allFiles(): string[] {
  return walk(SRC, ['node_modules', 'dist']);
}

const EXPORTED_CLASS = /export\s+(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/g;
const INSTANCEOF_USE = /instanceof\s+(\w+)/g;

type ClassSite = { readonly className: string; readonly file: string };

function exportedClassSites(files: readonly string[]): readonly ClassSite[] {
  return files.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(EXPORTED_CLASS)].map((m) => ({ className: m[1] ?? '', file }));
  });
}

function instanceofSites(files: readonly string[]): readonly ClassSite[] {
  return files.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(INSTANCEOF_USE)].map((m) => ({ className: m[1] ?? '', file }));
  });
}

export type SensitiveModule = { readonly modulePath: string; readonly className: string; readonly usedIn: readonly string[] };

/** Un module est SENSIBLE s'il exporte une classe vérifiée par `instanceof`
 * dans au moins un fichier DIFFÉRENT de celui qui la déclare. */
export function sensitiveModules(): readonly SensitiveModule[] {
  const prod = productionFiles();
  const classes = exportedClassSites(prod);
  const usages = instanceofSites(prod);

  const byClassName = new Map<string, string[]>();
  for (const c of classes) {
    if (!byClassName.has(c.className)) byClassName.set(c.className, []);
    byClassName.get(c.className)!.push(c.file);
  }

  const result: SensitiveModule[] = [];
  for (const [className, declaringFiles] of byClassName) {
    if (declaringFiles.length !== 1) continue; // ambigu (redéclaré) : hors de portée de ce balayage
    const declaringFile = declaringFiles[0]!;
    const externalUses = usages.filter((u) => u.className === className && u.file !== declaringFile);
    if (externalUses.length === 0) continue;
    result.push({
      modulePath: declaringFile,
      className,
      usedIn: [...new Set(externalUses.map((u) => relative(SRC, u.file)))],
    });
  }
  return result;
}

function callBody(source: string, from: number): string {
  const open = source.indexOf('(', from);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

function resolveLocalModule(fromFile: string, modulePath: string): string | null {
  if (!modulePath.startsWith('.')) return null;
  const dir = dirname(fromFile);
  const stripped = modulePath.replace(/\.js$/, '');
  const resolved = resolve(dir, stripped);
  for (const candidate of [`${resolved}.ts`, join(resolved, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // pas ce candidat
    }
  }
  return null;
}

export type Offender = { readonly site: string; readonly modulePath: string; readonly className: string };

const FACTORY_START = /jest\.mock\(\s*'([^']+)'/g;

/** Chaque site `jest.mock('<module sensible>', () => ({ ... }))` qui n'étale
 * pas `jest.requireActual` du MÊME module — patron #6294, appliqué à tous les
 * modules sensibles plutôt qu'à `withMutationLog` seul. */
export function offenders(): readonly Offender[] {
  const sensitive = sensitiveModules();
  const bySensitivePath = new Map(sensitive.map((s) => [s.modulePath, s]));
  const found: Offender[] = [];

  for (const file of allFiles()) {
    if (file.endsWith(SELF)) continue;
    const source = readFileSync(file, 'utf8');
    FACTORY_START.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FACTORY_START.exec(source))) {
      const rawModulePath = m[1] ?? '';
      const resolved = resolveLocalModule(file, rawModulePath);
      if (!resolved) continue;
      const sensitiveEntry = bySensitivePath.get(resolved);
      if (!sensitiveEntry) continue;
      const body = callBody(source, m.index);
      if (!/=>\s*\(?\{/.test(body)) continue; // pas une fabrique d'objet
      if (body.includes('jest.requireActual')) continue; // étale déjà le réel
      // Un site peut RECONSTRUIRE la classe à la main (même nom, `extends Error`,
      // rendue dans l'objet exporté) plutôt que d'étaler le module réel — c'est
      // une alternative valide, pas une omission : `instanceof` fonctionne tant
      // que throw et catch lisent la MÊME classe mockée, ce que Jest garantit à
      // l'intérieur d'un seul registre de module. Ne pas la signaler comme fautive.
      if (new RegExp(`class\\s+${sensitiveEntry.className}\\b`).test(body)) continue;
      found.push({
        site: `${relative(SRC, file)}:${source.slice(0, m.index).split('\n').length}`,
        modulePath: relative(SRC, resolved),
        className: sensitiveEntry.className,
      });
    }
  }
  return found;
}

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Un module de PRODUCTION qui écoute des événements clients sur un socket dont
 * le type ne dérive pas de `ClientToServerEvents`.
 */
export interface UngovernedReceiveDoor {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /** Ce qui l'a fait entrer — l'import fautif, dépouillé. */
  readonly declaration: string;
}

/**
 * Le discriminant : **importer un `Socket` NU de `socket.io` ET s'en servir
 * pour écouter.**
 *
 * Le type nu porte `DefaultEventsMap`, c'est-à-dire
 * `[event: string]: (...args: any[]) => void` — sous lui,
 * `socket.on(n'importe quoi, (data: n'importe quoi) => …)` compile. C'est
 * exactement ce qui a laissé `call:analytics` être écouté, validé et agrégé sans
 * figurer dans `ClientToServerEvents` (cycle 107).
 *
 * **Les deux conditions sont nécessaires, et c'est ce qui rend l'inventaire
 * VIDE plutôt qu'exempté.** Trois services de la passerelle
 * (`CallCleanupService`, `StoryTextObjectTranslationService`,
 * `NotificationService`) importent le `Server` nu pour ÉMETTRE, jamais pour
 * écouter : la porte de réception ne les concerne pas, et les exempter par leur
 * NOM aurait fabriqué une liste tenue à la main, en retard par construction
 * (règle du cycle 105 sur l'`include` du tsconfig). Leur porte d'ÉMISSION est
 * gardée par son propre balayage, qui est le bon endroit pour eux.
 *
 * `MeeshySocketIOManager` est le seul module qui a une raison d'importer
 * `Server` de `socket.io` — il le CONSTRUIT — et il le paramètre aussitôt par
 * les deux cartes du contrat. Il n'est pas exempté pour autant : il n'importe
 * plus le `Socket` nu, ses paramètres de socket dérivant de `typed-socket`
 * comme partout ailleurs.
 */
const NU_SOCKET_TYPE_IMPORT = /\bSocket\b(?![\w$])(?![^\n]*typed-socket)/;
const FROM_SOCKET_IO = /from\s+['"]socket\.io['"]/;
const REGISTERS_LISTENER = /\.\s*on\s*\(/;

/** Les commentaires citent la forme fautive pour l'expliquer — c'est leur rôle. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walk(full, out);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * Balaye `src/` ENTIER — pas seulement `src/socketio/`.
 *
 * Même raison qu'au balayage jumeau : la porte que ce lot ferme vivait dans
 * `CallEventsHandler.ts`, mais rien n'empêche la prochaine d'apparaître sous
 * `routes/` ou `services/`. Un balayage borné au répertoire qui a l'air concerné
 * déclare l'inventaire vide en en laissant une vivante.
 */
export function sweepUngovernedReceiveDoors(srcDir: string): UngovernedReceiveDoor[] {
  const found: UngovernedReceiveDoor[] = [];

  for (const file of walk(srcDir)) {
    const relative = file.slice(srcDir.length + 1);
    // Les témoins construisent des doubles, et un double a le droit d'être
    // permissif : ce qu'on garde ici, c'est la PRODUCTION.
    if (relative.includes('__tests__') || relative.endsWith('.test.ts')) continue;

    const source = stripComments(readFileSync(file, 'utf8'));
    if (!REGISTERS_LISTENER.test(source)) continue;

    for (const line of source.split('\n')) {
      if (!FROM_SOCKET_IO.test(line)) continue;
      if (!NU_SOCKET_TYPE_IMPORT.test(line)) continue;
      found.push({ file: relative, declaration: line.trim() });
    }
  }

  return found;
}

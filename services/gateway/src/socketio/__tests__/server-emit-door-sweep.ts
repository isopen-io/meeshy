import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Une porte d'émission écrite à la main : une signature `emit` dont le nom
 * d'événement est un `string` NU et/ou la charge un `unknown` / `any` /
 * `Record<string, unknown>` NU.
 */
export interface UntypedEmitDoor {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /** La ligne SOURCE, dépouillée — jamais un numéro de ligne (cf. ci-dessous). */
  readonly declaration: string;
}

/**
 * `emit` suivi d'un premier paramètre `string` — la marque d'une porte qui ne
 * dérive pas de `ServerToClientEvents`.
 *
 * Le discriminant est le TYPE du premier paramètre, pas son nom : `event`,
 * `ev`, `eventName` et `type` ont tous été employés dans le dépôt. Un `emit`
 * dont le premier paramètre est autre chose qu'un `string` nu — un
 * `ServerEventName`, un `E extends ServerEventName`, un `...args:
 * ServerEmitArgs` — est par construction rattaché au contrat.
 *
 * **DEUX formes, parce qu'une porte ne s'ouvre pas que par déclaration**
 * (cycle 105). La première rédaction ne connaissait que la méthode abrégée
 * — `emit(event: string, …)`, celle des huit interfaces du cycle 104 — et une
 * NEUVIÈME porte lui a échappé pour cette seule raison : le rejeu hors ligne
 * l'ouvrait par ASSERTION DE TYPE, en forme de propriété-flèche.
 *
 * ```ts
 * const userRoom = this.io.to(ROOMS.user(userId)) as unknown as {
 *   emit: (event: string, payload: unknown) => void;   // ← invisible au balayage
 * };
 * ```
 *
 * Un cast est une porte : il produit exactement la même liberté que la
 * déclaration, sur exactement le même appel, et il est plus discret puisqu'il
 * ne crée pas de type nommé qu'on puisse chercher. Le balayage voit désormais
 * `emit(ev: string` ET `emit: (ev: string`.
 */
const UNTYPED_EMIT =
  /\bemit\s*(?::\s*)?(?:<[^>]*>)?\s*\(\s*(?:readonly\s+)?[A-Za-z_$][\w$]*\s*:\s*string\b/;

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
 * Balaye `src/` — pas seulement `src/socketio/`.
 *
 * `utils/socket-broadcast.ts` portait la huitième copie, à deux répertoires de
 * la septième. Un balayage borné au répertoire qui a l'air concerné aurait
 * déclaré l'inventaire vide en en laissant une vivante.
 */
export function sweepUntypedEmitDoors(srcDir: string): UntypedEmitDoor[] {
  const found: UntypedEmitDoor[] = [];

  for (const file of walk(srcDir)) {
    const relative = file.slice(srcDir.length + 1);
    // Les témoins construisent des doubles, et un double a le droit d'être
    // permissif : ce qu'on garde ici, c'est la PRODUCTION.
    if (relative.includes('__tests__') || relative.endsWith('.test.ts')) continue;

    for (const line of stripComments(readFileSync(file, 'utf8')).split('\n')) {
      if (!UNTYPED_EMIT.test(line)) continue;
      found.push({ file: relative, declaration: line.trim() });
    }
  }

  return found;
}

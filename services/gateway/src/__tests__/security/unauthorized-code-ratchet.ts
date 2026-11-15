import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * #4857 — inventaire des appels `sendUnauthorized` de PRODUCTION qui ne
 * passent PAS de `code` explicite, et se reposent donc sur le défaut
 * `AUTH_ERROR_CODES.UNAUTHORIZED` de `utils/response.ts`.
 *
 * Ce n'est PAS une garde à inventaire vide : se reposer sur le défaut est
 * légitime pour le sens qu'il nomme (« aucune créance reconnue »), et rien
 * n'oblige chaque site à répéter le code par défaut. C'est un cliquet de
 * DETTE, sur le modèle des cliquets de taille (`tasks/lessons.md`, § « Une
 * limite assumée sans chiffre ne dit pas s'il y a un trou d'un site ou de
 * quatre-vingt-dix ») : le nombre de sites qui n'ont PAS encore été
 * confrontés à la question « quel sens précis ce refus porte-t-il ? » est
 * borné, et ne peut que descendre à mesure qu'un site de plus rejoint l'un
 * des sens nommés dans `utils/auth-error-codes.ts`.
 *
 * **Quand ce témoin tombe parce que le compte AUGMENTE** : un site NEUF
 * appelle `sendUnauthorized` sans code. Ce n'est pas nécessairement une
 * régression — le défaut reste un choix valide pour « aucune créance » —
 * mais la borne se relève seulement après avoir posé la question : ce site
 * porte-t-il un sens déjà nommé ?
 */
export interface UnauthorizedCallSite {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /** Le `code` explicite passé en options, ou `null` s'il est absent. */
  readonly explicitCode: string | null;
}

function blankOutComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }
    if (c === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      out += '  ';
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
      walk(full, out);
      continue;
    }
    if (!entry.endsWith('.ts')) continue;
    if (entry.endsWith('.d.ts') || entry.endsWith('.test.ts')) continue;
    // Le producteur lui-même n'est pas un APPELANT.
    if (full.endsWith(join('utils', 'response.ts'))) continue;
    out.push(full);
  }
  return out;
}

export function sweepUnauthorizedCallSites(srcDir: string): UnauthorizedCallSite[] {
  const found: UnauthorizedCallSite[] = [];
  for (const file of walk(srcDir).sort()) {
    const raw = readFileSync(file, 'utf8');
    const code = blankOutComments(raw);
    const callRegex = /sendUnauthorized\(/g;
    let m: RegExpExecArray | null;
    while ((m = callRegex.exec(code)) !== null) {
      const start = m.index + m[0].length;
      let depth = 1;
      let i = start;
      while (depth > 0 && i < code.length) {
        if (code[i] === '(') depth += 1;
        else if (code[i] === ')') depth -= 1;
        i += 1;
      }
      const args = code.slice(start, i - 1);
      const codeMatch = args.match(/\bcode\s*:\s*(?:AUTH_ERROR_CODES\.(\w+)|['"]([^'"]+)['"])/);
      const explicitCode = codeMatch ? (codeMatch[1] ?? codeMatch[2]) : null;
      found.push({
        file: relative(srcDir, file).split(sep).join('/'),
        explicitCode,
      });
    }
  }
  return found;
}

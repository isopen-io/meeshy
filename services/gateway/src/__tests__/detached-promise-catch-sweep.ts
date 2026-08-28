import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * Une promesse DÉTACHÉE dont le rejet n'a pas d'écouteur.
 *
 * `void p` abandonne `p` : plus personne n'attend sa résolution, donc plus
 * personne ne voit son rejet. Le `try/catch` qui entoure le site d'appel
 * n'attrape qu'un `throw` SYNCHRONE — il ne peut rien contre un rejet, qui
 * arrive après que la pile a été dépilée. Sous le
 * `--unhandled-rejections=throw` par défaut de Node 22, un tel rejet **termine
 * le process** : la passerelle entière tombée pour un canal dont tout le
 * contrat est d'être best-effort.
 *
 * Règle du dépôt depuis la leçon 230 (`services/gateway/CLAUDE.md`
 * § Critical Gotchas) : les deux gardes sont DISJOINTES et aucune ne subsume
 * l'autre — `try/catch` pour l'APPEL, `.catch` pour la PROMESSE.
 */
export interface DetachedPromise {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /**
   * L'expression détachée, dépouillée et bornée — jamais un numéro de ligne.
   * Une clé de ligne dérive à la première édition et transforme le cliquet en
   * bruit (règle du cycle 87 bis).
   */
  readonly expression: string;
}

/**
 * Longueur de l'extrait retenu comme clé.
 *
 * Assez long pour distinguer deux appels voisins au MÊME helper (les deux
 * `_enqueueOfflineReactionEvent` de `ReactionHandler` ne diffèrent que par leur
 * troisième argument), assez court pour qu'un remaniement d'arguments plus bas
 * dans l'appel ne fasse pas dériver la clé.
 */
const EXPRESSION_KEY_LENGTH = 120;

/**
 * Neutralise commentaires et CONTENUS de chaînes **en préservant les indices**.
 *
 * Chaque caractère retiré est remplacé par une espace (ou par le saut de ligne
 * qu'il portait), si bien que le texte rendu a exactement la longueur du texte
 * source. C'est ce qui permet de DÉTECTER sur la version dépouillée et de
 * RAPPORTER depuis la version brute, aux mêmes offsets : la clé d'inventaire
 * garde alors ses littéraux — sans quoi les deux appels voisins de
 * `ReactionHandler` deviendraient indiscernables.
 *
 * Les commentaires sont dépouillés parce qu'ils CITENT la forme fautive pour
 * l'expliquer — c'est leur rôle, et le doc-comment de `broadcastLinkMessage` en
 * porte trois. Les chaînes le sont parce qu'un `'void x()'` dans un message de
 * journal n'est pas du code.
 */
function blankOutNonCode(source: string): string {
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
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          out += quote;
          i += 1;
          break;
        }
        out += source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * `void` en position d'INSTRUCTION — jamais en position de TYPE.
 *
 * Le discriminant est ce qui PRÉCÈDE. Un `void` de type est toujours introduit
 * par un `:` (`(): void {`), un `<` (`Promise<void>`) ou une virgule d'union ;
 * un `void` d'instruction suit une fin d'instruction (`;`), une ouverture ou
 * une fermeture de bloc (`{`, `}`), ou le début du fichier.
 *
 * La première rédaction cherchait `void` précédé de « n'importe quoi qui ne soit
 * pas un mot » et rendait plus de cent faux positifs, tous des annotations de
 * retour. Un balayage qui cherche UN idiome mesure sa popularité, pas une
 * propriété (cycle 107) : ici la propriété est la POSITION, pas le mot-clé.
 */
const VOID_STATEMENT = /(?:^|[;{}])[ \t\r\n]*void[ \t\n]/g;

/**
 * Lit l'expression détachée à partir de l'offset qui suit `void`, en s'arrêtant
 * à la fin d'INSTRUCTION — un `;` ou une `,` au niveau 0, ou la fermeture du
 * bloc englobant.
 *
 * Le comptage de profondeur est ce qui distingue le `;` qui termine
 * l'instruction de ceux qu'un corps de fonction fléchée passé en argument
 * contient (`void run(() => { a(); b(); })`).
 */
function readStatementExpression(source: string, start: number): { text: string; end: number } {
  let depth = 0;
  let i = start;
  let text = '';
  while (i < source.length) {
    const c = source[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break;
      depth -= 1;
    } else if ((c === ';' || c === ',') && depth === 0) break;
    text += c;
    i += 1;
  }
  return { text, end: i };
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
    out.push(full);
  }
  return out;
}

/**
 * Toutes les promesses détachées de PRODUCTION dont le rejet n'est pas gardé.
 *
 * Deux conditions, et les deux comptent :
 *
 * 1. **l'expression contient un appel** — `void 0` et `void someValue` ne
 *    détachent rien, et les inclure mesurerait la popularité d'un mot-clé ;
 * 2. **elle ne porte pas de `.catch(`** — la garde du SITE, celle que la règle
 *    exige. Un `.catch` posé DANS le callee est une propriété du collaborateur,
 *    pas une garantie du site d'appel : elle peut changer sans que le site
 *    rougisse, et elle est déjà fausse dès que le callee a UNE instruction non
 *    gardée avant son propre `try` (`CallEventsHandler.onDisconnectGraceExpired`
 *    en avait trois). Le balayage ne suit donc pas l'appel — c'est délibéré.
 *
 * Les répertoires `__tests__` sont hors du balayage : un double a le droit de
 * détacher ce qu'il veut, et c'est la production qu'on protège.
 */
export function sweepDetachedPromises(srcDir: string): DetachedPromise[] {
  const found: DetachedPromise[] = [];
  for (const file of walk(srcDir).sort()) {
    const raw = readFileSync(file, 'utf8');
    const code = blankOutNonCode(raw);
    VOID_STATEMENT.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = VOID_STATEMENT.exec(code)) !== null) {
      const start = match.index + match[0].length;
      const { text, end } = readStatementExpression(code, start);
      // Reprendre l'index pile après l'instruction lue : sans cela un `void`
      // imbriqué dans l'expression serait relu comme un site à part entière.
      VOID_STATEMENT.lastIndex = Math.max(end, start);
      if (!text.includes('(')) continue;
      if (text.includes('.catch(')) continue;
      found.push({
        file: relative(srcDir, file).split(sep).join('/'),
        expression: raw
          .slice(start, end)
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, EXPRESSION_KEY_LENGTH),
      });
    }
  }
  return found;
}

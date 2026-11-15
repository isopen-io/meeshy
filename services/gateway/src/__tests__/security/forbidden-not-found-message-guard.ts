import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * Un `sendForbidden` dont le TEXTE annonce une ABSENCE (#4856).
 *
 * Le dépôt DÉCIDE, par écrit (`decisions.md:640`), de répondre 403 plutôt
 * que 404 sur certaines portes pour ne pas faire de la route un ORACLE
 * D'EXISTENCE. Cette décision protège le STATUT ; elle ne protège rien si le
 * TEXTE qui l'accompagne dit, mot pour mot, ce que le statut refusait de
 * dire — « Conversation not found », « Share link not found »… Un attaquant
 * qui lit le corps apprend exactement ce que le 403 devait lui cacher.
 *
 * Cinq sites vivaient dans ce cas au moment de l'issue, un sixième
 * (`attachments/metadata.ts`, branche anonyme d'une galerie) est apparu
 * entretemps sous la même forme — une ternaire que le premier balayage,
 * manuel, n'avait pas ouverte. Les six sont désormais des `sendNotFound`
 * (404) : dans chacun, la ressource recherchée est soit un identifiant qui
 * ne résout à RIEN (pas d'énumération possible), soit la ligne propre de
 * l'APPELANT (son propre `User`, son propre `Participant` de session, son
 * propre lien de partage) — jamais un tiers dont l'existence se
 * découvrirait en sondant la route.
 */
export interface ForbiddenAbsenceHit {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /** Le message littéral servi, tel qu'écrit dans le code. */
  readonly message: string;
}

/**
 * Un texte qui annonce une absence, dans les deux langues du dépôt.
 *
 * `not found` est le seul idiome anglais mesuré en production (§ ci-dessus).
 * `introuvable` et les deux formes de négation existentielle française
 * (« n'existe/n'existent pas ») couvrent le reste du vocabulaire d'absence
 * déjà en usage ailleurs dans le dépôt (`sendNotFound`, `errors/custom-errors.ts`).
 */
const ABSENCE_PATTERN = /\bnot found\b|introuvable|n['’]existe(?:nt)? pas/i;

/**
 * Neutralise commentaires et contenus de chaînes AUTRES QUE celles portées
 * par un appel `sendForbidden`, en préservant les indices (repris de
 * `detached-promise-catch-sweep.ts` — même contrainte : détecter sur une
 * version dépouillée, rapporter depuis la version brute aux mêmes offsets).
 *
 * Sans ce dépouillement, un commentaire qui CITE la forme fautive pour
 * l'expliquer — exactement ce que ce lot en laisse dans son sillage —
 * se lirait comme un site de production.
 */
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
    out.push(full);
  }
  return out;
}

/**
 * Extrait le premier argument LITTÉRAL (chaîne simple, sans interpolation)
 * de chaque appel `sendForbidden(reply, …)` de PRODUCTION.
 *
 * Ne relève que les littéraux — un appel dont le message vient d'une
 * variable, d'un appel (`error.message`, `verdict.reason`) ou d'une
 * ternaire reste hors de portée : le balayage ne devine pas un message
 * composé à l'exécution, il attrape ce qu'un lecteur du corps verrait tel
 * quel. C'est délibérément le même compromis que les balayages voisins de
 * ce répertoire (`response-payload-mismatch.ts`, `error-schema-sweep.ts`) :
 * une limite ASSUMÉE, mesurée, jamais une prétention d'exhaustivité.
 */
const SEND_FORBIDDEN_LITERAL = /sendForbidden\(\s*reply\s*,\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/gs;

export function sweepForbiddenAbsenceMessages(srcDir: string): ForbiddenAbsenceHit[] {
  const found: ForbiddenAbsenceHit[] = [];
  for (const file of walk(srcDir).sort()) {
    const raw = readFileSync(file, 'utf8');
    const code = blankOutComments(raw);
    SEND_FORBIDDEN_LITERAL.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SEND_FORBIDDEN_LITERAL.exec(code)) !== null) {
      const message = match[2];
      if (!ABSENCE_PATTERN.test(message)) continue;
      found.push({
        file: relative(srcDir, file).split(sep).join('/'),
        message,
      });
    }
  }
  return found;
}

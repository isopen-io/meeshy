/**
 * #20020 — les lectures de « qui est VIVANT dans CETTE conversation ? » qui
 * n'ont AUCUNE borne.
 *
 * ## Pourquoi un balayage, et pas un type
 *
 * `scanLiveParticipants` (`conversationAudienceRooms.ts`) est le site UNIQUE de
 * la borne, de la sonde `cap + 1`, du journal de troncature et du verdict de
 * complétude. Rien n'OBLIGE un site neuf à l'importer : une porte se ferme, une
 * porte se contourne, et une porte peut aussi n'avoir jamais été construite
 * parce qu'on a réécrit la requête (cycle 108, forme 3). La seule garde
 * possible est donc un inventaire.
 *
 * ## Le discriminant, et ce qu'il ne mesure PAS
 *
 * Est relevée toute lecture `participant.findMany` dont le `where` porte à la
 * fois un `conversationId` SCALAIRE et la clause de participation vivante, et
 * dont le bloc ne porte pas de `take`. La PROJECTION n'entre pas dans le
 * discriminant, et
 * c'est une décision : elle est la seule chose qui varie légitimement entre les
 * consommateurs de cette question, et la faire entrer mesurerait la popularité
 * d'un `select` au lieu d'une propriété (cycle 107, dont le balayage fut JETÉ
 * pour cette faute). `conversationId: { in: [...] }` sort par CONSTRUCTION :
 * une lecture multi-conversation est une autre question, dont la borne par
 * conversation n'a pas de sens.
 *
 * Et il ne mesure pas non plus la JUSTESSE du plafond choisi : `cap` est un
 * paramètre, parce que ce qu'une lecture tronquée peut prouver dépend du site
 * (`EARLY_BURN_GATE_SCAN_CAP` vaut 500 pour un verdict universel). Un vert ici
 * dit que la borne existe et passe par le site unique — rien de plus.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type UnboundedLiveRead = {
  /** Chemin relatif à `services/gateway`, la forme dont un inventaire se lit. */
  readonly file: string;
  /**
   * La ligne, pour le message d'erreur SEULEMENT — jamais pour la clé gelée :
   * une clé de ligne dérive à la première édition et transforme le cliquet en
   * bruit (règle du cycle 87 bis).
   */
  readonly line: number;
};

const SRC = join(__dirname, '..', '..');
const GATEWAY = join(SRC, '..');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(full);
    return entry.endsWith('.ts') && !entry.endsWith('.test.ts') ? [full] : [];
  });

/**
 * Les noms sous lesquels la clause de participation vivante s'écrit — la
 * PROPRIÉTÉ, pas un identifiant.
 *
 * Le premier relevé ne cherchait que `PARTICIPATION_VIVANTE` et rendait un
 * inventaire sans `translationReaders`, dont les TROIS lectures de la même
 * question portent `ADMITTED_FILE_READER_WHERE` — qui **est**
 * `PARTICIPATION_VIVANTE` (`fileReaderAdmission.ts:61`, une affectation
 * directe). Chercher une clause par son NOM, c'est manquer tous les sites qui
 * l'écrivent autrement (cycle 105, porté d'une porte d'émission à un `where`).
 *
 * Une quatrième façon de l'écrire — la clause à la main, `isActive: true` plus
 * `bannedAt` — sortirait encore de ce discriminant ; le témoin de ce balayage
 * garde l'alias par une fixture, et un alias NEUF se déclare ici.
 */
const LIVE_PARTICIPATION_CLAUSES = ['PARTICIPATION_VIVANTE', 'ADMITTED_FILE_READER_WHERE'];

/** Le bloc d'arguments d'un appel, par équilibrage des accolades. */
const argumentBlock = (source: string, openBrace: number): string => {
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openBrace, index + 1);
    }
  }
  return source.slice(openBrace);
};

const whereClause = (block: string): string | null => {
  const at = block.indexOf('where:');
  if (at < 0) return null;
  const open = block.indexOf('{', at);
  return open < 0 ? null : argumentBlock(block, open);
};

/**
 * Les commentaires sont DÉPOUILLÉS avant toute recherche : sans cela on
 * retrouve les commentaires des cycles précédents au lieu des défauts
 * (règle du cycle 87 bis).
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

export function sweepUnboundedLiveReads(): UnboundedLiveRead[] {
  const found: UnboundedLiveRead[] = [];

  for (const file of sourceFiles(SRC)) {
    const source = withoutComments(readFileSync(file, 'utf8'));
    const marker = /participant\.findMany\(\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = marker.exec(source)) !== null) {
      const open = source.indexOf('{', match.index + match[0].length - 1);
      const block = argumentBlock(source, open);
      if (!LIVE_PARTICIPATION_CLAUSES.some((clause) => block.includes(clause))) continue;
      if (block.includes('take:')) continue;

      const where = whereClause(block);
      if (where === null) continue;
      // `conversationId` SCALAIRE : une lecture multi-conversation est une
      // autre question (voir le doc-comment).
      if (!/conversationId\s*[,:}]/.test(where)) continue;
      if (/conversationId\s*:\s*\{/.test(where)) continue;

      found.push({
        file: file.slice(GATEWAY.length + 1),
        line: source.slice(0, match.index).split('\n').length,
      });
    }
  }

  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

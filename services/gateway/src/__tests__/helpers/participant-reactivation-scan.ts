/**
 * LE BALAYAGE des écritures qui rallument une participation — une fois, pour
 * les deux cliquets qui en dépendent.
 *
 * Deux inventaires posent deux questions sur le MÊME ensemble de sites :
 * `participant-reactivation-writers-sweep` demande « cette écriture peut-elle
 * rallumer un banni ? » (#10436), `participant-reactivation-rejoins-room-sweep`
 * demande « l'appareil qu'elle réintègre reçoit-il encore les événements du
 * fil ? » (#16964). Chacun portait sa propre copie du scanner.
 *
 * #19688 a mesuré ce que coûte la copie. Quand les trois portes de rentrée sont
 * passées par `commitParticipantRejoin`, leur écriture a cessé d'être un
 * `prisma.participant.update(` : les DEUX scanners les ont perdues d'un coup —
 * le premier est resté VERT avec un inventaire vidé de ses trois rentrées, le
 * second n'a rougi que par sa sonde de non-vacuité (« ≥ 5 sites », tombée à 2).
 *
 * > **Un cliquet qui cherche une graphie mesure cette graphie, pas la
 * > propriété** — et deux cliquets qui portent la même copie du scanner
 * > deviennent aveugles ENSEMBLE, sans qu'une ligne de leurs inventaires
 * > bouge. C'est la règle du cycle 105 (« chercher une forme par son NOM de
 * > déclaration manque tous les sites qui l'obtiennent autrement ») prise par
 * > l'autre bout : ici, c'est la RÉPARATION qui a rendu les sites invisibles.
 *
 * Le scanner vit donc ici, et les deux openers y sont déclarés ensemble : la
 * prochaine façon d'écrire une rentrée se déclare UNE fois.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/** Les marqueurs d'une écriture qui RALLUME une participation. */
export const REACTIVATION_MARKERS = ['isActive: true', 'REJOIN_PARTICIPANT_STATE', 'unban.data'] as const;

/**
 * L'unité partagée qui COMMET une rentrée (#19688). Elle porte la garde de
 * bannissement dans son `where` et reçoit sa charge en PARAMÈTRE : elle ne
 * porte donc aucun marqueur, et n'entre dans aucun des deux inventaires — les
 * deux propriétés inventoriées (refuser un banni, rebrancher les sockets) sont
 * celles des PORTES, qui seules connaissent le compte et la conversation.
 */
export const REJOIN_COMMIT_FILE = 'services/conversations/rejoinParticipantWrite.ts';

/** Les DEUX graphies d'une écriture de rentrée : le `update` nu, et l'unité partagée. */
const ANY_WRITE = /\.participant\.(update|updateMany|upsert)\(|commitParticipantRejoin(?:<[^>]*>)?\(/;
/** Le `update` NU seul — ce qu'aucune porte de rentrée ne doit plus employer. */
const NUDE_WRITE = /\.participant\.(update|updateMany|upsert)\(/;

export function productionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'node_modules' ? [] : productionFiles(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts') ? [path] : [];
  });
}

function bodiesMatching(source: string, pattern: RegExp): string[] {
  const opener = new RegExp(pattern.source, 'g');
  const bodies: string[] = [];
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    while (end < source.length && depth > 0) {
      if (source[end] === '(') depth += 1;
      if (source[end] === ')') depth -= 1;
      end += 1;
    }
    bodies.push(source.slice(start, end));
  }
  return bodies;
}

/** Les corps de TOUTE écriture de participation, quelle que soit sa graphie. */
export const callBodies = (source: string): string[] => bodiesMatching(source, ANY_WRITE);

/** Les corps des `prisma.participant.update(` NUS seulement. */
export const nudeWriteBodies = (source: string): string[] => bodiesMatching(source, NUDE_WRITE);

/** Ce que l'appel ÉCRIT : un `isActive: true` du `where` filtre, il ne rallume rien. */
export function writtenPart(body: string): string {
  const written = /\b(data|update)\s*:/.exec(body);
  return written ? body.slice(written.index) : body;
}

export type ReactivationSite = { readonly file: string; readonly marker: string };

/** Chaque (fichier, marqueur) dont une écriture peut rallumer une participation. */
export function reactivationSites(src: string): ReactivationSite[] {
  return productionFiles(src).flatMap((path) => {
    const file = relative(src, path);
    return callBodies(readFileSync(path, 'utf8')).map(writtenPart).flatMap((written) =>
      REACTIVATION_MARKERS.filter((marker) => written.includes(marker)).map((marker) => ({ file, marker }))
    );
  });
}

/** Les fichiers qui rallument, dédoublonnés et triés. */
export function reactivatingFiles(src: string): string[] {
  return [...new Set(reactivationSites(src).map((site) => site.file))].sort();
}

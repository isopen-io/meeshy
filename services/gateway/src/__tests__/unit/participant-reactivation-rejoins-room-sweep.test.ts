/**
 * #16964 — inventaire des écritures qui RALLUMENT une participation et ne
 * remettent pas les sockets du compte dans `conversation:<id>`.
 *
 * Jumeau de `participant-reactivation-writers-sweep.test.ts`, sur le MÊME
 * inventaire de sites et pour une AUTRE propriété. Celui-là demande « cette
 * écriture peut-elle rallumer un banni ? » ; celui-ci demande « l'appareil
 * qu'elle réintègre reçoit-il encore les événements du fil ? ».
 *
 * Pourquoi la question ne se répond pas au site : l'ÉVICTION est partagée et
 * explicite (`endConversationMembership`, qui sort TOUTES les sockets du compte
 * — appelée par le départ, le bannissement et `delete-for-me`), la
 * RÉINTÉGRATION ne l'est pas. Chaque porte doit rebrancher chez elle, et une
 * porte qui l'oublie laisse l'appareil dans l'état que
 * `participant-ban-core.ts` décrit : `connectedUsers` le rapporte EN LIGNE,
 * donc tout expéditeur saute la file de remise hors ligne pour lui, pendant
 * qu'aucun événement de room ne l'atteint. Rien ne rejoue : les messages,
 * réactions, éditions et accusés émis entre-temps sont perdus, pas différés.
 *
 * Quatre des cinq portes rebranchaient ; `restore-for-me` était la cinquième,
 * et le symptôme n'avait aucun signal — c'est le propre d'une absence
 * d'événement. Le balayage ne garde donc pas un bug, il garde une PORTE : la
 * prochaine écriture qui rallume une participation doit dire ce qu'elle fait
 * des sockets avant d'entrer.
 *
 * L'inventaire des exemptions est VIDE, et il n'y a pas de réintégration muette
 * légitime à y porter : quand ce test tombe, la réparation est l'appel, jamais
 * une ligne de plus ci-dessous.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..', '..');

/** Les marqueurs d'une écriture qui RALLUME, repris du balayage frère (#10436). */
const MARKERS = ['isActive: true', 'REJOIN_PARTICIPANT_STATE', 'unban.data'] as const;

/**
 * Le verbe qui remet les sockets du compte dans la room du fil.
 * `MeeshySocketIOManager.joinUserToConversationRoom` en est l'unique
 * implémentation ; les noyaux de gestes le reçoivent par la passerelle typée
 * (`PasserelleSocketDeConversation`).
 */
const REJOIN = 'joinUserToConversationRoom';

/**
 * Un site peut déléguer sa jointure au module qui décide de l'admission plutôt
 * que de l'appeler lui-même. La délégation se DÉCLARE ici, elle ne se devine
 * pas — sans quoi « le fichier n'appelle pas » et « quelqu'un d'autre appelle
 * pour lui » seraient indistinguables.
 */
const REJOIN_DELEGATE: Readonly<Record<string, string>> = {};

/** VIDE, et à défendre : voir l'en-tête. */
const SANS_REJOIN: ReadonlyArray<{ readonly file: string; readonly raison: string }> = [];

function productionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'node_modules' ? [] : productionFiles(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts') ? [path] : [];
  });
}

function callBodies(source: string): string[] {
  const opener = /\.participant\.(update|updateMany|upsert)\(/g;
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

/** Ce que l'appel ÉCRIT : un `isActive: true` du `where` filtre, il ne rallume rien. */
function writtenPart(body: string): string {
  const written = /\b(data|update)\s*:/.exec(body);
  return written ? body.slice(written.index) : body;
}

function reactivatingFiles(): string[] {
  const files = productionFiles(SRC)
    .filter((path) =>
      callBodies(readFileSync(path, 'utf8'))
        .map(writtenPart)
        .some((written) => MARKERS.some((marker) => written.includes(marker)))
    )
    .map((path) => relative(SRC, path));
  return [...new Set(files)].sort();
}

function rejoins(file: string): boolean {
  const delegate = REJOIN_DELEGATE[file];
  const sources = [file, ...(delegate ? [delegate] : [])];
  return sources.some((candidate) => readFileSync(join(SRC, candidate), 'utf8').includes(REJOIN));
}

describe('toute porte qui rallume une participation rebranche ses sockets (#16964)', () => {
  it('le balayage voit bien des écritures de réintégration (sans quoi il resterait vert à vide)', () => {
    // La moitié qui donne son sens à un inventaire vide : sans elle, exclure un
    // fichier du balayage suffirait à rendre le test vert.
    expect(reactivatingFiles().length).toBeGreaterThanOrEqual(5);
  });

  it('le verbe de jointure existe bien sous ce nom (un balayage de chaîne ne vaut que par sa cible)', () => {
    const manager = readFileSync(join(SRC, 'socketio/MeeshySocketIOManager.ts'), 'utf8');
    expect(manager).toContain(`async ${REJOIN}(`);
  });

  it('aucune porte de réintégration ne laisse ses sockets hors de la room du fil', () => {
    const muettes = reactivatingFiles().filter((file) => !rejoins(file));
    expect(muettes).toEqual(SANS_REJOIN.map((entry) => entry.file).sort());
  });

  it('restore-for-me rebranche, et sur la conversation qu’il vient de rendre', () => {
    const source = readFileSync(join(SRC, 'routes/user-deletions.ts'), 'utf8');
    expect(source).toContain(`${REJOIN}(userId, conversationId)`);
  });
});

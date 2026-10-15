/**
 * #10436 — inventaire des écritures qui RALLUMENT une participation.
 *
 * Une ligne `Participant` active ET bannie est lue comme vivante par toute
 * lecture `userId + isActive: true` (liste des conversations, envoi REST, push,
 * aperçu socket). La seule façon d'en fabriquer une est une écriture qui pose
 * `isActive: true` sur une ligne existante sans regarder `bannedAt`.
 * `restore-for-me` le faisait.
 *
 * Ce balayage lit chaque `participant.update / updateMany / upsert` de
 * production et rend ceux qui peuvent rallumer une ligne : `isActive: true`
 * écrit en littéral, l'état de réintégration partagé
 * (`REJOIN_PARTICIPANT_STATE`) ou la transition de débannissement
 * (`unban.data`). Chacun est inscrit ci-dessous avec la garde qui l'empêche de
 * rallumer un banni. Une écriture NEUVE fait rougir le test : elle doit dire sa
 * garde avant d'entrer. Les `create` ne sont pas balayés — une ligne neuve n'a
 * pas de `bannedAt`.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..', '..');

type Reactivation = { readonly file: string; readonly marker: string };

const GUARDED: ReadonlyArray<Reactivation & { readonly guard: string }> = [
  {
    file: 'routes/user-deletions.ts',
    marker: 'isActive: true',
    guard: 'refuse un banni (403 BANNED) et porte unsetOrNull(bannedAt) dans le where (#10436)',
  },
  {
    file: 'routes/conversations/link-admission.ts',
    marker: 'REJOIN_PARTICIPANT_STATE',
    guard: "resolveConversationEntry (via services/conversations/linkAdmission.ts) refuse 'banned' en 403 BANNED",
  },
  {
    file: 'routes/conversations/participants-writes.ts',
    marker: 'REJOIN_PARTICIPANT_STATE',
    guard: "resolveConversationEntry rend 'banned' avant toute réintégration",
  },
  {
    file: 'routes/conversations/sharing-invite.ts',
    marker: 'REJOIN_PARTICIPANT_STATE',
    guard: "resolveConversationEntry rend 'banned' avant toute réintégration",
  },
  {
    file: 'routes/conversations/participant-ban-core.ts',
    marker: 'unban.data',
    guard: 'le débannissement remet bannedAt à null dans la même écriture (resolveUnbanWrite)',
  },
];

const MARKERS = ['isActive: true', 'REJOIN_PARTICIPANT_STATE', 'unban.data'] as const;

const ENTRY_DECIDER: Readonly<Record<string, string>> = {
  'routes/conversations/link-admission.ts': 'services/conversations/linkAdmission.ts',
};

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

function sweepReactivations(): Reactivation[] {
  return productionFiles(SRC).flatMap((path) => {
    const file = relative(SRC, path);
    return callBodies(readFileSync(path, 'utf8')).map(writtenPart).flatMap((written) =>
      MARKERS.filter((marker) => written.includes(marker)).map((marker) => ({ file, marker }))
    );
  });
}

const key = (r: Reactivation) => `${r.file} :: ${r.marker}`;

describe('les écritures qui rallument une participation sont toutes inventoriées (#10436)', () => {
  it('le balayage voit bien les écritures de participants (sans quoi il resterait vert à vide)', () => {
    const all = productionFiles(SRC).flatMap((path) => callBodies(readFileSync(path, 'utf8')));
    expect(all.length).toBeGreaterThan(20);
  });

  it('aucune écriture ne rallume une participation sans garde de bannissement déclarée', () => {
    const found = [...new Set(sweepReactivations().map(key))].sort();
    expect(found).toEqual(GUARDED.map(key).sort());
  });

  it('chaque porte de réintégration consulte resolveConversationEntry, qui refuse un banni', () => {
    const rejoiners = GUARDED.filter((entry) => entry.marker === 'REJOIN_PARTICIPANT_STATE');
    rejoiners.forEach(({ file }) => {
      const source = readFileSync(join(SRC, ENTRY_DECIDER[file] ?? file), 'utf8');
      expect({ file, consults: source.includes('resolveConversationEntry(') }).toEqual({ file, consults: true });
    });
  });

  it('restore-for-me ne rallume que sous unsetOrNull(bannedAt)', () => {
    const source = readFileSync(join(SRC, 'routes/user-deletions.ts'), 'utf8');
    const restore = callBodies(source).filter((body) => writtenPart(body).includes('isActive: true'));
    expect(restore).toHaveLength(1);
    expect(restore[0]).toContain("unsetOrNull('bannedAt')");
  });
});

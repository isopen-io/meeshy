/**
 * #6518 — le script de nettoyage des participants orphelins ne laisse plus de
 * messages sans expéditeur.
 *
 * `scripts/maintenance/fix-orphan-participants.ts` (`--apply`) efface des
 * `Participant` dont la conversation n'existe plus. `Message.sender` est une
 * relation REQUISE (#6501) : effacer un participant qui a écrit sans retirer
 * ses messages en fait des orphelins, invisibles à toute lecture directe (leur
 * conversation a disparu) mais atteignables via un message TRANSFÉRÉ ailleurs
 * qui cite l'un d'eux — et qui fait alors rejeter la page entière chez le
 * destinataire.
 *
 * Jumelle de `proof-scripts-orphan-sender-guard.test.ts` (qui couvre
 * `scripts/preuves/*.sh`), pour `scripts/maintenance/`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const SCRIPT = join(__dirname, '../../../../../scripts/maintenance/fix-orphan-participants.ts');

const source = (): string => readFileSync(SCRIPT, 'utf8');

const idsVariable = (source: string, callPattern: RegExp, fieldPattern: RegExp): string | null => {
  const call = source.match(callPattern);
  if (!call) return null;
  const field = call[0].match(fieldPattern);
  return field ? field[1] : null;
};

describe('#6518 — fix-orphan-participants.ts ne laisse pas de messages sans expéditeur', () => {
  it('efface les messages des participants orphelins (prisma.message.deleteMany)', () => {
    expect(source()).toMatch(/prisma\.message\.deleteMany\(/);
  });

  it("l'effacement des messages précède l'effacement des participants (l'orphelin n'existe jamais sans sa réparation)", () => {
    const src = source();
    const messageDeletion = src.search(/prisma\.message\.deleteMany\(/);
    const participantDeletion = src.search(/prisma\.participant\.deleteMany\(/);

    expect(messageDeletion).toBeGreaterThan(-1);
    expect(participantDeletion).toBeGreaterThan(-1);
    expect(messageDeletion).toBeLessThan(participantDeletion);
  });

  it('les deux effacements portent sur la MÊME liste d\'identifiants orphelins', () => {
    const src = source();
    const participantIdsVar = idsVariable(
      src,
      /prisma\.participant\.deleteMany\(\{[\s\S]*?\}\);/,
      /id:\s*\{\s*in:\s*(\w+)/
    );
    const messageIdsVar = idsVariable(
      src,
      /prisma\.message\.deleteMany\(\{[\s\S]*?\}\);/,
      /senderId:\s*\{\s*in:\s*(\w+)/
    );

    expect(participantIdsVar).not.toBeNull();
    expect(messageIdsVar).not.toBeNull();
    expect(messageIdsVar).toBe(participantIdsVar);
  });

  it('le dry-run signale aussi les messages qui seraient effacés (pas seulement les participants)', () => {
    const src = source();
    const dryRunBlock = src.match(/if\s*\(!apply\)\s*\{[\s\S]*?\n\s*\}/);
    expect(dryRunBlock).not.toBeNull();
    expect(dryRunBlock![0]).toMatch(/message/i);
  });
});

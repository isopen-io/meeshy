/**
 * #18556 — dans `GET /conversations/:id/messages`, la pierre tombale d'un
 * message mort pour ce lecteur s'applique APRÈS tout ce qui rattache quelque
 * chose à sa bulle. Posée avant l'enrichissement des transferts, elle laissait
 * repartir le texte et la pièce de la source par `forwardedFrom` (attaque A2).
 *
 * Garde de SOURCE : la route ne se monte pas sans une base entière, et c'est
 * l'ORDRE de ses passes qui porte la règle.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, '..', 'messages-list.ts'), 'utf8');
const lastCallOf = (call: string) => source.lastIndexOf(`${call}(`);

const PASSES_QUI_RATTACHENT = [
  'mapMessageRowForList',
  'enrichForwardedMessagesForList',
  'enrichPostReplyMessagesForList',
  'backfillCitedAttachments',
  'sharedPlaceFromMetadata',
  'stickerFromMetadata',
  'withCallSummaryParticipantNames',
  'projectViewOnceForReader',
];

describe('la pierre tombale de la liste vient en dernier (#18556)', () => {
  it('la route appelle la pierre tombale', () => {
    expect(lastCallOf('projectEphemeralTombstone')).toBeGreaterThan(0);
  });

  it.each(PASSES_QUI_RATTACHENT)('%s passe AVANT la pierre tombale', (pass) => {
    const at = lastCallOf(pass);

    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(lastCallOf('projectEphemeralTombstone'));
  });

  it('elle reçoit la mort héritée de ce que le message cite', () => {
    const call = source.slice(lastCallOf('projectEphemeralTombstone'));

    expect(call.slice(0, call.indexOf(');'))).toContain('inheritedDeadlines.get(m.id)');
  });

  it('une recherche retire l’éphémère échu au lieu d’en servir la bulle', () => {
    expect(source).toMatch(/searchMode && isLapsedForReader\(/);
  });
});

/**
 * Le CLIQUET de #9776 — aucune lecture qui sert les pièces d'un message ne
 * les rend dans un ordre autre que `MESSAGE_ATTACHMENT_ORDER`.
 *
 * Trois preuves, aucune décorative :
 * 1. l'inventaire est VIDE ;
 * 2. le balayage n'est pas VACUEUX — il voit les sites ordonnés connus ;
 * 3. il TOMBE quand on retire l'ordre d'une copie verbatim d'un site réel,
 *    écrite hors du dépôt.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterAll } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { sweepUnorderedAttachmentReads } from './message-attachment-order-sweep';

const SRC = join(__dirname, '..');

const ORDERED_SITES = [
  'routes/conversations/messages-list-query.ts',
  'routes/messages-reads.ts',
  'routes/messages-writes.ts',
  'routes/sync/messages.ts',
  'routes/conversations/search.ts',
  'routes/conversations/threads.ts',
  'services/messaging/MessageProcessor.ts',
  'services/messaging/messageNotificationFanOut.ts',
  'socketio/handlers/MessageHandler.ts',
];

const bins: string[] = [];
afterAll(() => bins.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('#9776 — toute lecture qui sert les pièces d’un message les ordonne', () => {
  it('aucune lecture ne sert les pièces sans MESSAGE_ATTACHMENT_ORDER', () => {
    expect(sweepUnorderedAttachmentReads(SRC)).toEqual([]);
  });

  it('les chemins connus (liste, message unique, édition, synchro, recherche, fil, message:new, notification) portent l’ordre', () => {
    const unordered = ORDERED_SITES.filter(
      (file) => !readFileSync(join(SRC, file), 'utf8').includes('MESSAGE_ATTACHMENT_ORDER'),
    );
    expect(unordered).toEqual([]);
  });

  it('tombe quand une copie d’un site réel perd son ordre', () => {
    const bin = mkdtempSync(join(tmpdir(), 'attachment-order-'));
    bins.push(bin);
    const original = readFileSync(join(SRC, 'routes/sync/messages.ts'), 'utf8');
    const mutated = original.replace(', orderBy: MESSAGE_ATTACHMENT_ORDER }', ' }');
    expect(mutated).not.toBe(original);
    writeFileSync(join(bin, 'messages.ts'), mutated, 'utf8');

    expect(sweepUnorderedAttachmentReads(bin)).toEqual([
      expect.objectContaining({ file: 'messages.ts', snippet: expect.stringContaining('attachmentSocketSelect') }),
    ]);
  });

  it('tombe sur une lecture directe des pièces d’un message sans ordre', () => {
    const bin = mkdtempSync(join(tmpdir(), 'attachment-order-'));
    bins.push(bin);
    writeFileSync(
      join(bin, 'reader.ts'),
      'export const read = (p: any, message: { id: string }) =>\n  p.messageAttachment.findMany({ where: { messageId: message.id } });\n',
      'utf8',
    );

    expect(sweepUnorderedAttachmentReads(bin)).toEqual([expect.objectContaining({ file: 'reader.ts', line: 2 })]);
  });
});

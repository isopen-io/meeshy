/**
 * #19049 — ce que le validateur `live-receipts` ignore doit EXISTER au contrat du
 * message : un nom de champ qui ne s'y trouve pas n'ignorerait rien, et le 304
 * promis ne viendrait jamais, sans que rien ne rougisse.
 */
import { describe, expect, it } from 'vitest';

import { messageSchema } from '../api-schemas/message';
import { LIVE_RECEIPTS_CAPABILITY, LIVE_RECEIPT_FIELDS } from '../live-receipts';

describe('live-receipts — le contrat de la fenêtre revalidée sans ses accusés (#19049)', () => {
  it('chaque champ ignoré est un champ que le message déclare au fil', () => {
    const declared = Object.keys(messageSchema.properties);
    expect(LIVE_RECEIPT_FIELDS.filter((field) => !declared.includes(field))).toEqual([]);
  });

  it('les cinq agrégats d’accusé, et eux seuls — ni le contenu, ni les réactions, ni la traduction', () => {
    expect([...LIVE_RECEIPT_FIELDS].sort()).toEqual(['deliveredCount', 'deliveredToAllAt', 'readByAllAt', 'readCount', 'recipientCount']);
  });

  it('le jeton de capacité suit la forme des autres : minuscules et traits d’union', () => {
    expect(LIVE_RECEIPTS_CAPABILITY).toBe('live-receipts');
    expect(LIVE_RECEIPTS_CAPABILITY).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

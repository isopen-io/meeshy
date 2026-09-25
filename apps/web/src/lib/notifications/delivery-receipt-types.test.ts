import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DELIVERY_RECEIPT_TYPES } from './delivery-receipt-types';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = readFileSync(join(HERE, '../../../public/sw-push.js'), 'utf8');

function workerList(): readonly string[] {
  const literal = /const DELIVERY_RECEIPT_TYPES = \[([\s\S]*?)\];/.exec(WORKER)?.[1] ?? '';
  return [...literal.matchAll(/'([^']+)'/g)].map(([, type]) => type ?? '');
}

describe('DELIVERY_RECEIPT_TYPES — la coque et le service worker accusent les MÊMES remises (#7307)', () => {
  test('la liste du worker est celle du module, au type près', () => {
    expect(workerList().length).toBeGreaterThan(0);
    expect([...workerList()].sort()).toEqual([...DELIVERY_RECEIPT_TYPES].sort());
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import {
  CONTENT_CAPTURE_NOTICES_PER_HOUR,
  CONTENT_CAPTURE_NOTICES_PER_REPORT,
  CONTENT_CAPTURE_REPORTS_PER_MINUTE,
} from '@meeshy/shared/types/content-capture-kinds';

import { EMPTY_LEDGER, captureCapacity, captureLots, unannounced, withDeclaration, withNotices } from './capture-ledger';

/* CE QUE LA PASSERELLE PEUT ENCORE ANNONCER (#9617, audit A1) — 10 avis par
   déclaration, 6 déclarations par minute, 30 avis par heure. */

const NOW = 1_700_000_000_000;
const ids = (count: number, prefix = 'm') => Array.from({ length: count }, (_, i) => `${prefix}${i}`);

describe('le registre des annonces', () => {
  test('les plafonds sont ceux de la passerelle', () => {
    expect([CONTENT_CAPTURE_NOTICES_PER_REPORT, CONTENT_CAPTURE_REPORTS_PER_MINUTE, CONTENT_CAPTURE_NOTICES_PER_HOUR]).toEqual([10, 6, 30]);
  });

  test('la passerelle applique les mêmes nombres (tant qu’elle ne les importe pas de @meeshy/shared)', () => {
    const gateway = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'services', 'gateway', 'src');
    const notices = readFileSync(join(gateway, 'services', 'messaging', 'contentCaptureNotices.ts'), 'utf8');
    const limits = readFileSync(join(gateway, 'utils', 'socket-rate-limiter.ts'), 'utf8');
    const ceiling = (name: string) => Number(new RegExp(`${name}: \\{\\s*maxRequests: (\\d+)`).exec(limits)?.[1]);
    expect(Number(/MAX_NOTICES_PER_REPORT = (\d+)/.exec(notices)?.[1])).toBe(CONTENT_CAPTURE_NOTICES_PER_REPORT);
    expect(ceiling('MESSAGE_CAPTURE')).toBe(CONTENT_CAPTURE_REPORTS_PER_MINUTE);
    expect(ceiling('MESSAGE_CAPTURE_NOTICES_HOURLY')).toBe(CONTENT_CAPTURE_NOTICES_PER_HOUR);
  });

  test('une capture se découpe en déclarations de dix au plus', () => {
    expect(captureLots(ids(25)).map((lot) => lot.length)).toEqual([10, 10, 5]);
    expect(captureLots([])).toEqual([]);
  });

  test('à vide : trente avis possibles', () => {
    expect(captureCapacity(EMPTY_LEDGER, NOW)).toBe(30);
  });

  test('chaque déclaration de la minute retire dix avis possibles', () => {
    const ledger = [0, 1, 2, 3, 4].reduce((current, i) => withDeclaration(current, NOW + i), EMPTY_LEDGER);
    expect(captureCapacity(ledger, NOW + 10)).toBe(10);
    expect(captureCapacity(withDeclaration(ledger, NOW + 5), NOW + 10)).toBe(0);
    expect(captureCapacity(ledger, NOW + 61_000)).toBe(30);
  });

  test('les avis de l’heure consomment le budget horaire, un message déjà annoncé ne le reconsomme pas', () => {
    const ledger = withNotices(EMPTY_LEDGER, 'screenshot', ids(25), NOW);
    expect(captureCapacity(ledger, NOW + 1)).toBe(5);
    expect(captureCapacity(withNotices(ledger, 'screenshot', ids(25), NOW + 2), NOW + 3)).toBe(5);
    expect(captureCapacity(ledger, NOW + 3_600_001)).toBe(30);
  });

  test('un message annoncé par capture reste à annoncer par enregistrement', () => {
    const ledger = withNotices(EMPTY_LEDGER, 'screenshot', ['m1'], NOW);
    expect(unannounced(ledger, 'screenshot', ['m1', 'm2'])).toEqual(['m2']);
    expect(unannounced(ledger, 'recording', ['m1'])).toEqual(['m1']);
  });
});

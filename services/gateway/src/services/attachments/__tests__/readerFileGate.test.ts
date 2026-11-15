/**
 * #9600 (audit L1-C) — l'usage de l'adresse nue d'un fichier protégé est
 * ventilé par FORME de clé : une clé hors de l'arborescence datée (et hors des
 * pistes traduites) n'est jamais signée, son lecteur n'a donc aucune adresse
 * signée vers laquelle migrer. La compter avec les autres ferait croire que la
 * mesure peut tomber à zéro.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

const mockInfo = jest.fn<(...args: unknown[]) => void>();

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), warn: jest.fn(), info: (...a: unknown[]) => mockInfo(...a), debug: jest.fn() }),
  },
}));

import { UNSIGNED_READER_BOUND_FILE_EVENT, admitUnsignedFile, signableStorageKeyShape } from '../readerFileGate';

const request = { route: '/api/v1/attachments/file/*', platformHeader: undefined, versionHeader: undefined, userAgent: undefined };
const readerBound = { kind: 'serve', cacheControl: 'private, no-store', readerBound: true } as const;

describe('signableStorageKeyShape', () => {
  it.each([
    ['2026/10/68f2a81417a557e8ce4ddfc1/photo.jpg', 'signable'],
    ['translated/aaaaaaaaaaaaaaaaaaaaaaa1_en.mp3', 'signable'],
    ['snapshots/abc.jpg', 'legacy'],
    ['attachments/68f2a81417a557e8ce4ddfc1/photo.jpg', 'legacy'],
  ])('%s → %s', (key, shape) => {
    expect(signableStorageKeyShape(key)).toBe(shape);
  });
});

describe('admitUnsignedFile', () => {
  it('ventile la mesure par forme de clé, sans jamais écrire la clé', () => {
    mockInfo.mockClear();
    admitUnsignedFile({ verdict: readerBound, request, enforced: false, storageKey: 'snapshots/68f2a81417a557e8ce4ddfc1.jpg' });
    expect(mockInfo).toHaveBeenCalledWith(UNSIGNED_READER_BOUND_FILE_EVENT, expect.objectContaining({ keyShape: 'legacy' }));
    expect(JSON.stringify(mockInfo.mock.calls)).not.toContain('68f2a81417a557e8ce4ddfc1');
  });
});

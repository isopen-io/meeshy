import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { parseCaptureNotice } from '@meeshy/shared/utils/capture-notice';

import { SystemNotice } from './system-notice';

/* L'avis de capture (#9617) se rend comme un jalon du fil, sur les DEUX peaux,
   sans bulle ; celui d'un invité porte le masque de l'avis d'arrivée. */

const noticeOf = (actor: Record<string, unknown>) => {
  const notice = parseCaptureNotice({
    kind: 'content-capture',
    actor,
    capturedMessageId: '0123456789abcdef01234567',
    nature: 'after-read-flame',
    outcome: 'announced',
    captureKind: 'screenshot',
    sentAt: '2026-10-07T12:05:00.000Z',
  });
  if (notice === null) throw new Error('avis attendu');
  return notice;
};

describe('SystemNotice — avis de capture (#9617)', () => {
  for (const surface of ['row', 'bubble'] as const) {
    test(`peau ${surface} : jalon étiqueté et phrase entière, sans masque pour un inscrit`, () => {
      const row = { kind: 'capture', notice: noticeOf({ participantId: 'p-a', displayName: 'Alice', isAnonymous: false }) } as const;
      const html = renderToStaticMarkup(<SystemNotice row={row} timeString="12:06" surface={surface} />);
      expect(html).toContain('data-system="capture"');
      expect(html).toContain('Alice a capturé l’éphémère du');
      expect(html).not.toContain('data-capture-guest');
    });
  }

  test('un invité porte le masque, comme l’avis d’arrivée', () => {
    const row = { kind: 'capture', notice: noticeOf({ participantId: 'p-a', displayName: 'Alice', isAnonymous: true }) } as const;
    const html = renderToStaticMarkup(<SystemNotice row={row} timeString="12:06" surface="row" />);
    expect(html).toContain('data-capture-guest');
    expect(html).toContain('Alice (invité)');
  });
});

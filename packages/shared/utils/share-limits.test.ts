import { describe, expect, it } from 'vitest';
import { MAX_POST_MEDIA } from '../types/attachment.js';
import { SHARE_LIMITS } from './share-limits.js';

describe('SHARE_LIMITS — les plafonds communs du partage (D10, #10949)', () => {
  it('100 fichiers, 5 Go, 10 destinataires (révision porteur du 2026-10-25, #12974)', () => {
    expect(SHARE_LIMITS.maxFiles).toBe(100);
    expect(SHARE_LIMITS.maxTotalBytes).toBe(5 * 1024 * 1024 * 1024);
    expect(SHARE_LIMITS.maxRecipients).toBe(10);
  });

  it('une publication est bornée à 10 médias, la MÊME borne que la passerelle des posts', () => {
    expect(SHARE_LIMITS.maxPublicationMedia).toBe(10);
    expect(SHARE_LIMITS.maxPublicationMedia).toBe(MAX_POST_MEDIA);
  });
});

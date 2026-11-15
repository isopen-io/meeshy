/**
 * #13100 — une piste non écrite garde la référence de la précédente de sa
 * langue, jamais celle d'une piste supprimée.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import { mergeTranslationEntries } from '../translatedTrackSave';
import type { AttachmentTranslations } from '@meeshy/shared/types/attachment-audio';

const at = new Date('2026-10-26T12:00:00Z');
const entry = (over: Record<string, unknown> = {}) => ({ type: 'audio' as const, transcription: 'bonjour', createdAt: at, ...over });

describe('la fusion des traductions d’une pièce', () => {
  it('une piste non écrite reprend la référence de la précédente', () => {
    const merged = mergeTranslationEntries({ fr: entry({ path: '/p', url: '/u' }) } as AttachmentTranslations, { fr: entry({ transcription: 'salut' }) } as AttachmentTranslations);
    expect(merged.fr).toMatchObject({ transcription: 'salut', path: '/p', url: '/u' });
  });

  it('jamais celle d’une piste supprimée', () => {
    const merged = mergeTranslationEntries({ fr: entry({ path: '/p', url: '/u', deletedAt: at }) } as AttachmentTranslations, { fr: entry() } as AttachmentTranslations);
    expect(merged.fr.url).toBeUndefined();
    expect(merged.fr.path).toBeUndefined();
  });
});

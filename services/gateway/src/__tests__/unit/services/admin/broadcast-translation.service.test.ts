/**
 * BroadcastTranslationService unit tests
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

const mockAxiosPost = jest.fn() as jest.Mock<any>;

jest.mock('axios', () => ({
  post: (...args: unknown[]) => mockAxiosPost(...args),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { BroadcastTranslationService } from '../../../../services/admin/broadcast-translation.service';

function makeService() {
  return new BroadcastTranslationService();
}

// ─── translateContent ─────────────────────────────────────────────────────────

describe('BroadcastTranslationService.translateContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only source language when targetLanguages is empty', async () => {
    const svc = makeService();
    const result = await svc.translateContent('Hello', 'World body', 'en', []);

    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(result.subjects['en']).toBe('Hello');
    expect(result.bodies['en']).toBe('World body');
  });

  it('filters out source language from targetLanguages', async () => {
    const svc = makeService();
    const result = await svc.translateContent('Hello', 'Body', 'en', ['en']);

    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(result.subjects['en']).toBe('Hello');
  });

  it('batch-translates successfully and populates subjects/bodies', async () => {
    const svc = makeService();
    mockAxiosPost.mockResolvedValue({
      data: [
        { translated_text: 'Bonjour' },
        { translated_text: 'Monde' },
      ],
    });

    const result = await svc.translateContent('Hello', 'World', 'en', ['fr']);

    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/translate/batch'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Hello', target_language: 'fr', model_type: 'medium' }),
        expect.objectContaining({ text: 'World', target_language: 'fr', model_type: 'premium' }),
      ]),
      expect.objectContaining({ timeout: 30000 })
    );
    expect(result.subjects['fr']).toBe('Bonjour');
    expect(result.bodies['fr']).toBe('Monde');
  });

  it('skips missing translated_text in batch response', async () => {
    const svc = makeService();
    mockAxiosPost.mockResolvedValue({
      data: [
        { translated_text: null },
        { translated_text: 'Monde' },
      ],
    });

    const result = await svc.translateContent('Hello', 'World', 'en', ['fr']);

    expect(result.subjects['fr']).toBeUndefined();
    expect(result.bodies['fr']).toBe('Monde');
  });

  it('handles non-array batch response gracefully (skips assignment)', async () => {
    const svc = makeService();
    mockAxiosPost.mockResolvedValue({ data: 'invalid' });

    const result = await svc.translateContent('Hello', 'World', 'en', ['fr']);
    // No assignments made since data is not Array
    expect(result.subjects['fr']).toBeUndefined();
    expect(result.subjects['en']).toBe('Hello');
  });

  it('falls back to individual requests when batch fails', async () => {
    const svc = makeService();
    const batchError = new Error('Batch failed');
    const subjectResponse = { data: { translated_text: 'Bonjour' } };
    const bodyResponse = { data: { translated_text: 'Corps' } };

    mockAxiosPost
      .mockRejectedValueOnce(batchError) // batch fails
      .mockResolvedValueOnce(subjectResponse) // individual subject
      .mockResolvedValueOnce(bodyResponse);   // individual body

    const result = await svc.translateContent('Hello', 'Body', 'en', ['fr']);

    expect(result.subjects['fr']).toBe('Bonjour');
    expect(result.bodies['fr']).toBe('Corps');
  });

  it('skips individual retry when translated_text is missing', async () => {
    const svc = makeService();
    mockAxiosPost
      .mockRejectedValueOnce(new Error('Batch failed'))
      .mockResolvedValueOnce({ data: {} })   // no translated_text
      .mockResolvedValueOnce({ data: {} });   // no translated_text

    const result = await svc.translateContent('Hi', 'Body', 'en', ['de']);

    expect(result.subjects['de']).toBeUndefined();
    expect(result.bodies['de']).toBeUndefined();
  });

  it('logs error and continues when individual retry also fails', async () => {
    const svc = makeService();
    const batchError = new Error('batch error');
    const retryError = new Error('retry error');

    mockAxiosPost
      .mockRejectedValueOnce(batchError)
      .mockRejectedValueOnce(retryError)  // subject retry fails
      .mockRejectedValueOnce(retryError); // body retry fails (Promise.all)

    // Should not throw — errors are caught
    const result = await svc.translateContent('Hi', 'Body', 'en', ['de']);
    expect(result.subjects['en']).toBe('Hi');
    expect(result.subjects['de']).toBeUndefined();
  });

  it('handles non-Error thrown in individual retry', async () => {
    const svc = makeService();
    mockAxiosPost
      .mockRejectedValueOnce(new Error('batch'))
      .mockRejectedValueOnce('string error')  // non-Error thrown
      .mockRejectedValueOnce('string error');

    await expect(svc.translateContent('Hi', 'Body', 'en', ['es'])).resolves.not.toThrow();
  });

  it('processes multiple batches when langs exceed BATCH_SIZE=5', async () => {
    const svc = makeService();
    const langs = ['fr', 'de', 'es', 'it', 'pt', 'nl']; // 6 langs → 2 batches

    // Batch 1: 5 langs → 10 items
    const batch1Response = Array.from({ length: 10 }, (_, i) => ({
      translated_text: `t${i}`,
    }));
    // Batch 2: 1 lang → 2 items
    const batch2Response = [
      { translated_text: 'nl-subj' },
      { translated_text: 'nl-body' },
    ];

    mockAxiosPost
      .mockResolvedValueOnce({ data: batch1Response })
      .mockResolvedValueOnce({ data: batch2Response });

    const result = await svc.translateContent('Hello', 'World', 'en', langs);

    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    expect(result.subjects['nl']).toBe('nl-subj');
    expect(result.bodies['nl']).toBe('nl-body');
  });

  it('uses ML_API_URL env var for the API endpoint', async () => {
    const originalEnv = process.env.ML_API_URL;
    process.env.ML_API_URL = 'http://custom-translator:9000';
    const svc = makeService();
    mockAxiosPost.mockResolvedValue({ data: [{ translated_text: 'x' }, { translated_text: 'y' }] });

    await svc.translateContent('Hi', 'Body', 'en', ['fr']);

    expect(mockAxiosPost).toHaveBeenCalledWith(
      'http://custom-translator:9000/translate/batch',
      expect.any(Array),
      expect.any(Object)
    );

    process.env.ML_API_URL = originalEnv;
  });

  it('includes source language in output even when no target languages match', async () => {
    const svc = makeService();
    const result = await svc.translateContent('Subject', 'Body content', 'de', ['de']);

    expect(result.subjects['de']).toBe('Subject');
    expect(result.bodies['de']).toBe('Body content');
  });
});

import { filterMessagePayloadForLanguages } from '../message-payload-filter';

const basePayload = () => ({
  id: 'msg-1',
  content: 'Bonjour',
  originalLanguage: 'fr',
  translations: [
    { targetLanguage: 'en', translatedContent: 'Hello' },
    { targetLanguage: 'es', translatedContent: 'Hola' },
    { targetLanguage: 'de', translatedContent: 'Hallo' },
  ],
  attachments: [
    {
      id: 'att-1',
      transcription: { text: 'Bonjour' },
      translations: {
        en: { url: 'en.mp3' },
        es: { url: 'es.mp3' },
        de: { url: 'de.mp3' },
      },
    },
  ],
});

describe('filterMessagePayloadForLanguages', () => {
  it('keeps only the requested text translations', () => {
    const out = filterMessagePayloadForLanguages(basePayload(), ['en']);
    expect((out.translations as any[]).map((t) => t.targetLanguage)).toEqual(['en']);
  });

  it('keeps only the requested audio (Prisme) translations', () => {
    const out = filterMessagePayloadForLanguages(basePayload(), ['en']);
    expect(Object.keys((out.attachments as any[])[0].translations)).toEqual(['en']);
  });

  it('preserves the original content and transcription untouched', () => {
    const out = filterMessagePayloadForLanguages(basePayload(), ['en']);
    expect(out.content).toBe('Bonjour');
    expect((out.attachments as any[])[0].transcription).toEqual({ text: 'Bonjour' });
  });

  it('matches languages case-insensitively', () => {
    const out = filterMessagePayloadForLanguages(basePayload(), ['EN', 'Es']);
    expect((out.translations as any[]).map((t) => t.targetLanguage).sort()).toEqual(['en', 'es']);
    expect(Object.keys((out.attachments as any[])[0].translations).sort()).toEqual(['en', 'es']);
  });

  it('does NOT mutate the source payload (purity)', () => {
    const src = basePayload();
    filterMessagePayloadForLanguages(src, ['en']);
    expect(src.translations).toHaveLength(3);
    expect(Object.keys(src.attachments[0].translations)).toHaveLength(3);
  });

  it('returns the payload unchanged when languages is empty (defensive)', () => {
    const src = basePayload();
    const out = filterMessagePayloadForLanguages(src, []);
    expect(out).toBe(src);
  });

  it('tolerates a payload with no translations/attachments', () => {
    const src = { id: 'x' };
    const out = filterMessagePayloadForLanguages(src, ['en']);
    expect(out).toEqual({ id: 'x' });
  });
});

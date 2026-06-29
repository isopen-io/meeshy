import {
  filterMessagePayloadForLanguages,
  groupSocketsByLanguage,
} from '../message-payload-filter';

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

  it('returns attachment unchanged when its translations field is an array', () => {
    const src = {
      id: 'msg-2',
      attachments: [
        { id: 'att-array', translations: ['not', 'an', 'object'] },
        { id: 'att-null', translations: null },
        { id: 'att-normal', translations: { en: { url: 'en.mp3' }, fr: { url: 'fr.mp3' } } },
      ],
    };
    const out = filterMessagePayloadForLanguages(src, ['en']);
    const atts = out.attachments as any[];
    expect(atts[0]).toBe(src.attachments[0]);
    expect(atts[1]).toBe(src.attachments[1]);
    expect(Object.keys(atts[2].translations)).toEqual(['en']);
  });
});

describe('groupSocketsByLanguage', () => {
  // Two EN users, one ES user, one with no resolved langs, sender s-self.
  const users: Record<string, { resolvedLanguages: string[]; language: string }> = {
    'u-en1': { resolvedLanguages: ['en'], language: 'en' },
    'u-en2': { resolvedLanguages: ['en'], language: 'en' },
    'u-es': { resolvedLanguages: ['es'], language: 'es' },
    'u-self': { resolvedLanguages: ['de'], language: 'de' },
  };
  const socketToUserMap: Record<string, string> = {
    's-en1': 'u-en1',
    's-en2': 'u-en2',
    's-es': 'u-es',
    's-unknown': 'u-missing', // user not in map → falls back
    's-self': 'u-self',
  };

  const make = (overrides: Partial<Parameters<typeof groupSocketsByLanguage>[0]> = {}) =>
    groupSocketsByLanguage({
      socketIds: Object.keys(socketToUserMap),
      originalLanguage: 'fr',
      socketToUser: (sid) => socketToUserMap[sid],
      resolveLanguages: (uid) => users[uid]?.resolvedLanguages,
      userLanguage: (uid) => users[uid]?.language,
      ...overrides,
    });

  it('coalesces sockets that share a language set into one group', () => {
    const groups = make();
    const en = groups.find((g) => g.languages.includes('en') && !g.languages.includes('es'));
    expect(en?.socketIds.sort()).toEqual(['s-en1', 's-en2']);
  });

  it('always includes the original language for Prisme source fallback', () => {
    const groups = make();
    for (const g of groups) expect(g.languages).toContain('fr');
  });

  it('falls back to the original language when the recipient has none resolved', () => {
    const groups = make();
    const unknown = groups.find((g) => g.socketIds.includes('s-unknown'));
    expect(unknown?.languages).toEqual(['fr']);
  });

  it('excludes the sender by user id (their devices get the cid-aware payload)', () => {
    const groups = make({ excludeUserId: 'u-self' });
    const all = groups.flatMap((g) => g.socketIds);
    expect(all).not.toContain('s-self');
  });

  it('excludes specific sockets (anonymous sender)', () => {
    const groups = make({ excludeSocketIds: new Set(['s-es']) });
    const all = groups.flatMap((g) => g.socketIds);
    expect(all).not.toContain('s-es');
  });

  it('produces one group per distinct language set (fan-out reduction)', () => {
    // en1+en2 (en,fr), es (es,fr), unknown (fr), self (de,fr) → 4 groups.
    const groups = make();
    expect(groups).toHaveLength(4);
    const totalEmitsAvoided =
      Object.keys(socketToUserMap).length - groups.length; // 5 sockets → 4 emits
    expect(totalEmitsAvoided).toBe(1);
  });
});

describe('multi-device divergent languages (5.3 integration)', () => {
  it('each device receives only its languages + original', () => {
    const payload = basePayload(); // content fr, translations {en, es, de}
    const groups = groupSocketsByLanguage({
      socketIds: ['sA', 'sB'],
      originalLanguage: 'fr',
      socketToUser: (s) => (s === 'sA' ? 'uA' : 'uB'),
      resolveLanguages: (u) => (u === 'uA' ? ['en'] : ['es']),
      userLanguage: () => undefined,
    });

    // Deux groupes distincts (langues divergentes), chacun avec l'original 'fr'
    expect(groups).toHaveLength(2);
    const gA = groups.find((g) => g.socketIds.includes('sA'))!;
    const gB = groups.find((g) => g.socketIds.includes('sB'))!;
    expect([...gA.languages].sort()).toEqual(['en', 'fr']);
    expect([...gB.languages].sort()).toEqual(['es', 'fr']);

    // Device EN : seule la traduction 'en' reste (es/de prunés) ; original préservé
    const fA = filterMessagePayloadForLanguages(payload, gA.languages);
    expect(fA.translations.map((t: { targetLanguage: string }) => t.targetLanguage).sort()).toEqual(['en']);
    expect(fA.content).toBe('Bonjour');
    expect(fA.originalLanguage).toBe('fr');

    // Device ES : seule la traduction 'es' reste ; original préservé
    const fB = filterMessagePayloadForLanguages(payload, gB.languages);
    expect(fB.translations.map((t: { targetLanguage: string }) => t.targetLanguage).sort()).toEqual(['es']);
    expect(fB.content).toBe('Bonjour');
  });
});

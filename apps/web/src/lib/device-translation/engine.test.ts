import { describe, expect, test } from 'bun:test';

import { createBuiltinTranslator, createDeviceTranslationRouter, createNllbTranslator, translateByLine, type TranslationPipeline } from './engine';

const rejection = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('la promesse a été tenue');
};

type Call = { readonly text: string; readonly src_lang: string; readonly tgt_lang: string; readonly max_new_tokens: number };

const fakePipeline = (calls: Call[], answer: (text: string) => string = (text) => `«${text}»`): TranslationPipeline => ({
  countTokens: (text) => text.split(/\s+/).filter(Boolean).length,
  generate: async (text, options) => {
    calls.push({ text, ...options });
    return answer(text);
  },
});

describe('createNllbTranslator — NLLB embarqué derrière un pipeline injecté (#9898)', () => {
  test('ne connaît que les langues de NLLB_CODES : les camerounaises hors NLLB sont refusées', () => {
    const engine = createNllbTranslator({ name: 'nllb', load: async () => fakePipeline([]) });
    expect(engine.supports('en', 'fr')).toBe(true);
    expect(engine.supports('ff', 'fr')).toBe(true);
    expect(engine.supports('en', 'ewo')).toBe(false);
  });

  test('traduit avec les codes NLLB et le budget du serveur', async () => {
    const calls: Call[] = [];
    const engine = createNllbTranslator({ name: 'nllb', load: async () => fakePipeline(calls) });
    expect(await engine.translate('habari yako', { source: 'sw', target: 'fr' })).toBe('«habari yako»');
    expect(calls).toEqual([{ text: 'habari yako', src_lang: 'swh_Latn', tgt_lang: 'fra_Latn', max_new_tokens: 16 }]);
  });

  test('chaque ligne se traduit à part : la mise en forme du message survit', async () => {
    const calls: Call[] = [];
    const engine = createNllbTranslator({ name: 'nllb', load: async () => fakePipeline(calls) });
    expect(await engine.translate('salut\n\n  ça va\n', { source: 'fr', target: 'en' })).toBe('«salut»\n\n  «ça va»\n');
    expect(calls.map((c) => c.text)).toEqual(['salut', 'ça va']);
  });

  test('le modèle se charge une seule fois, à la première traduction', async () => {
    let loads = 0;
    const engine = createNllbTranslator({
      name: 'nllb',
      load: async () => {
        loads += 1;
        return fakePipeline([]);
      },
    });
    expect(loads).toBe(0);
    await Promise.all([engine.translate('a', { source: 'en', target: 'fr' }), engine.translate('b', { source: 'en', target: 'fr' })]);
    expect(loads).toBe(1);
  });

  test('un chargement raté se retente à la traduction suivante', async () => {
    let attempts = 0;
    const engine = createNllbTranslator({
      name: 'nllb',
      load: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('réseau coupé');
        return fakePipeline([]);
      },
    });
    expect(await rejection(engine.translate('a', { source: 'en', target: 'fr' }))).toBe('réseau coupé');
    expect(await engine.translate('a', { source: 'en', target: 'fr' })).toBe('«a»');
  });
});

describe('translateByLine — le découpage que NLLB et Opus-MT partagent (#9898)', () => {
  const model = (calls: { text: string; max: number }[], answer: (text: string) => string = (text) => `«${text}»`) => ({
    countTokens: (text: string) => text.split(/\s+/).filter(Boolean).length,
    generate: async (text: string, max: number) => (calls.push({ text, max }), answer(text)),
  });

  test('chaque ligne se traduit à part, séparateurs et retraits intacts, avec le budget du serveur', async () => {
    const calls: { text: string; max: number }[] = [];
    expect(await translateByLine('salut\r\n\n  ça va bien\n', model(calls))).toBe('«salut»\r\n\n  «ça va bien»\n');
    expect(calls).toEqual([
      { text: 'salut', max: 16 },
      { text: 'ça va bien', max: 18 },
    ]);
  });

  test('une ligne blanche ne part pas au modèle', async () => {
    const calls: { text: string; max: number }[] = [];
    expect(await translateByLine('  \n\t', model(calls))).toBe('  \n\t');
    expect(calls).toEqual([]);
  });

  test('une traduction qui contient « $& » ou « $1 » reste littérale', async () => {
    const calls: { text: string; max: number }[] = [];
    expect(await translateByLine('  coûte cinq euros  ', model(calls, () => 'coûte $& et $1 et $$'))).toBe('  coûte $& et $1 et $$  ');
  });
});

describe('createBuiltinTranslator — la Translator API du navigateur, quand elle existe', () => {
  const chromeApi = (available: ReadonlySet<string>) => ({
    availability: async ({ sourceLanguage, targetLanguage }: { sourceLanguage: string; targetLanguage: string }) =>
      available.has(`${sourceLanguage}>${targetLanguage}`) ? ('available' as const) : ('unavailable' as const),
    create: async ({ targetLanguage }: { sourceLanguage: string; targetLanguage: string }) => ({
      translate: async (text: string) => `[${targetLanguage}] ${text}`,
    }),
  });

  test('absente du navigateur ⇒ jamais prête', async () => {
    const builtin = createBuiltinTranslator({ api: undefined });
    expect(await builtin.ready({ source: 'en', target: 'fr' })).toBe(false);
  });

  test('prête seulement pour les paires que le navigateur déclare', async () => {
    const builtin = createBuiltinTranslator({ api: chromeApi(new Set(['en>fr'])) });
    expect(await builtin.ready({ source: 'en', target: 'fr' })).toBe(true);
    expect(await builtin.ready({ source: 'en', target: 'wo' })).toBe(false);
    expect(await builtin.translate('hello', { source: 'en', target: 'fr' })).toBe('[fr] hello');
  });
});

describe('createDeviceTranslationRouter — accélérateur natif d’abord, modèle embarqué ensuite', () => {
  const embedded = (calls: string[]) =>
    createNllbTranslator({
      name: 'nllb',
      load: async () => ({ countTokens: () => 1, generate: async (text) => (calls.push(text), `nllb:${text}`) }),
    });

  test('ce que l’appareil sait traduire est ce que le modèle embarqué sait traduire', () => {
    const router = createDeviceTranslationRouter({ accelerators: [], engine: embedded([]) });
    expect(router.supports('sw', 'fr')).toBe(true);
    expect(router.supports('sw', 'ewo')).toBe(false);
  });

  test('un accélérateur prêt pour la paire sert, le modèle n’est pas chargé', async () => {
    const calls: string[] = [];
    const accelerator = { name: 'chrome', ready: async () => true, translate: async (text: string) => `chrome:${text}` };
    const router = createDeviceTranslationRouter({ accelerators: [accelerator], engine: embedded(calls) });
    expect(await router.translate('hello', { source: 'en', target: 'fr' })).toEqual({ text: 'chrome:hello', engine: 'chrome' });
    expect(calls).toEqual([]);
  });

  test('un accélérateur absent ou en échec cède au modèle embarqué', async () => {
    const failing = { name: 'chrome', ready: async () => true, translate: async (): Promise<string> => { throw new Error('quota'); } };
    const absent = { name: 'safari', ready: async () => false, translate: async (text: string) => text };
    const router = createDeviceTranslationRouter({ accelerators: [absent, failing], engine: embedded([]) });
    expect(await router.translate('habari', { source: 'sw', target: 'fr' })).toEqual({ text: 'nllb:habari', engine: 'nllb' });
  });
});

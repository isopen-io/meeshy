import { describe, expect, test } from 'bun:test';

import { fromMarianPipeline, fromTransformersPipeline, type TransformersMarianPipeline, type TransformersTranslationPipeline } from './transformers-pipeline';

const rejection = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('la promesse a été tenue');
};

const fake = (output: unknown): TransformersTranslationPipeline =>
  Object.assign(async () => output, { tokenizer: (text: string) => ({ input_ids: { dims: [1, text.length] } }) });

describe('fromTransformersPipeline — la surface de transformers.js que le moteur emploie', () => {
  test('compte les jetons sur la dernière dimension et lit translation_text', async () => {
    const pipeline = fromTransformersPipeline(fake([{ translation_text: 'Bonjour' }]));
    expect(pipeline.countTokens('abc')).toBe(3);
    expect(await pipeline.generate('Hello', { src_lang: 'eng_Latn', tgt_lang: 'fra_Latn', max_new_tokens: 16 })).toBe('Bonjour');
  });

  test('une sortie sans texte est une erreur, jamais une chaîne vide affichée', async () => {
    const pipeline = fromTransformersPipeline(fake([{}]));
    expect(await rejection(pipeline.generate('Hello', { src_lang: 'eng_Latn', tgt_lang: 'fra_Latn', max_new_tokens: 16 }))).not.toBe('');
  });
});

const marian = (output: unknown, dispose?: () => Promise<void>): TransformersMarianPipeline =>
  Object.assign(async () => output, { tokenizer: (text: string) => ({ input_ids: { dims: [1, text.length] } }) }, dispose === undefined ? {} : { dispose });

describe('fromMarianPipeline — la surface de transformers.js que les modèles Opus-MT emploient', () => {
  test('compte les jetons sur la dernière dimension, lit translation_text, sans codes de langue', async () => {
    const calls: unknown[] = [];
    const translator = Object.assign(
      async (text: string, options: unknown) => (calls.push([text, options]), [{ translation_text: 'Bonjour' }]),
      { tokenizer: (text: string) => ({ input_ids: { dims: [1, text.length] } }) },
    );
    const pipeline = fromMarianPipeline(translator);
    expect(pipeline.countTokens('abc')).toBe(3);
    expect(await pipeline.generate('Hello', { max_new_tokens: 16 })).toBe('Bonjour');
    expect(calls).toEqual([['Hello', { max_new_tokens: 16 }]]);
  });

  test('une sortie sans texte est une erreur, jamais une chaîne vide affichée', async () => {
    expect(await rejection(fromMarianPipeline(marian([{}])).generate('Hello', { max_new_tokens: 16 }))).not.toBe('');
  });

  test('libère les sessions du pipeline quand il sait le faire', async () => {
    let disposed = 0;
    const pipeline = fromMarianPipeline(
      marian([{ translation_text: 'x' }], async () => {
        disposed += 1;
      }),
    );
    await pipeline.dispose?.();
    expect(disposed).toBe(1);
  });

  test('un pipeline sans dispose se libère sans erreur', async () => {
    await fromMarianPipeline(marian([{ translation_text: 'x' }])).dispose?.();
  });
});

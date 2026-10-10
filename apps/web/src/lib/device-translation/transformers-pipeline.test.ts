import { describe, expect, test } from 'bun:test';

import { fromTransformersPipeline, type TransformersTranslationPipeline } from './transformers-pipeline';

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

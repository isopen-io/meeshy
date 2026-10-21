import type { TranslationPipeline } from './engine';
import type { MarianPipeline } from './opus-mt-engine';

/**
 * La seule surface de transformers.js que le moteur emploie : un pipeline
 * `translation` qui sait tokeniser et traduire. Le Worker du navigateur et le
 * serveur du banc passent par cet adaptateur, donc par le même code.
 */
export type TransformersTranslationPipeline = {
  readonly tokenizer: (text: string) => { readonly input_ids: { readonly dims: readonly number[] } };
  (
    text: string,
    options: { readonly src_lang: string; readonly tgt_lang: string; readonly max_new_tokens: number },
  ): Promise<unknown>;
};

const translationTextOf = (output: unknown): string => {
  const first = Array.isArray(output) ? (output[0] as unknown) : output;
  const text = typeof first === 'object' && first !== null ? (first as { readonly translation_text?: unknown }).translation_text : undefined;
  if (typeof text !== 'string') throw new Error('sortie de traduction illisible');
  return text;
};

export const fromTransformersPipeline = (translator: TransformersTranslationPipeline): TranslationPipeline => ({
  countTokens: (text) => translator.tokenizer(text).input_ids.dims.at(-1) ?? 0,
  generate: async (text, options) => translationTextOf(await translator(text, options)),
});

/**
 * La surface de transformers.js qu'un modèle Opus-MT (Marian) emploie : le
 * même pipeline `translation`, sans `src_lang` ni `tgt_lang` — le modèle ne
 * connaît qu'un sens d'une paire, le jeton de langue cible, s'il en exige un,
 * précède le texte. `dispose` libère ses sessions ONNX.
 */
export type TransformersMarianPipeline = {
  readonly tokenizer: (text: string) => { readonly input_ids: { readonly dims: readonly number[] } };
  (text: string, options: { readonly max_new_tokens: number }): Promise<unknown>;
  readonly dispose?: () => Promise<void> | void;
};

export const fromMarianPipeline = (translator: TransformersMarianPipeline): MarianPipeline => ({
  countTokens: (text) => translator.tokenizer(text).input_ids.dims.at(-1) ?? 0,
  generate: async (text, options) => translationTextOf(await translator(text, options)),
  dispose: () => translator.dispose?.(),
});

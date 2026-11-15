import { generationBudget } from './generation-budget';
import { NLLB_CODES } from './nllb-codes';
import type { DeviceTranslationPair } from './target';

/**
 * **CE QUE LE MODÈLE EMBARQUÉ DOIT SAVOIR FAIRE** (#9898) — compter les
 * jetons d'une source et générer sa traduction. transformers.js le fournit
 * dans le Worker du navigateur et de la coque Android
 * (`device-translation-worker.ts`), et sous Node pour le banc
 * (`scripts/device-translation-bench-server.ts`) : les mêmes poids, la même
 * quantification et ce même code mesurés et servis.
 */
export type TranslationPipeline = {
  readonly countTokens: (text: string) => number;
  readonly generate: (
    text: string,
    options: { readonly src_lang: string; readonly tgt_lang: string; readonly max_new_tokens: number },
  ) => Promise<string>;
};

export type EmbeddedTranslator = {
  readonly name: string;
  readonly supports: (source: string, target: string) => boolean;
  readonly translate: (text: string, pair: DeviceTranslationPair) => Promise<string>;
};

/** Un moteur natif que l'on essaie d'abord, sans savoir d'avance ce qu'il couvre. */
export type Accelerator = {
  readonly name: string;
  readonly ready: (pair: DeviceTranslationPair) => Promise<boolean>;
  readonly translate: (text: string, pair: DeviceTranslationPair) => Promise<string>;
};

const LINE = /(\r?\n)/;

/**
 * **CE QUE LE DÉCOUPAGE EN LIGNES ATTEND D'UN MODÈLE** — compter les jetons
 * d'une ligne et en générer la traduction sous un budget. NLLB (qui reçoit en
 * plus ses codes de langue) et Opus-MT (qui reçoit un jeton de langue devant le
 * texte) s'y ramènent chacun par un adaptateur d'une ligne.
 */
export type LineModel = {
  readonly countTokens: (text: string) => number;
  readonly generate: (text: string, maxNewTokens: number) => Promise<string>;
};

const translateLine = async (model: LineModel, line: string): Promise<string> => {
  const text = line.trim();
  if (text === '') return line;
  const translated = await model.generate(text, generationBudget(model.countTokens(text)));
  return line.replace(text, () => translated);
};

/**
 * Chaque ligne se traduit à part : la mise en forme du message — retours à la
 * ligne, retraits, lignes vides — survit, et aucune phrase ne dépasse ce que le
 * modèle sait tenir. Le remplacement est littéral : une traduction qui contient
 * « $& » ou « $1 » ne se lit pas comme un motif de `String.replace`.
 */
export async function translateByLine(text: string, model: LineModel): Promise<string> {
  const translated: string[] = [];
  for (const piece of text.split(LINE)) translated.push(LINE.test(piece) ? piece : await translateLine(model, piece));
  return translated.join('');
}

export function createNllbTranslator(params: {
  readonly name: string;
  readonly load: () => Promise<TranslationPipeline>;
  readonly codes?: Readonly<Record<string, string>>;
}): EmbeddedTranslator {
  const codes = params.codes ?? NLLB_CODES;
  let loading: Promise<TranslationPipeline> | null = null;

  const pipeline = (): Promise<TranslationPipeline> => {
    loading ??= params.load().catch((error: unknown) => {
      loading = null;
      throw error;
    });
    return loading;
  };

  const codeOf = (language: string): string => {
    const code = codes[language];
    if (code === undefined) throw new Error(`NLLB n'a pas de code pour ${language}`);
    return code;
  };

  return {
    name: params.name,
    supports: (source, target) => codes[source] !== undefined && codes[target] !== undefined,
    translate: async (text, { source, target }) => {
      const src_lang = codeOf(source);
      const tgt_lang = codeOf(target);
      const model = await pipeline();
      return translateByLine(text, {
        countTokens: (line) => model.countTokens(line),
        generate: (line, max_new_tokens) => model.generate(line, { src_lang, tgt_lang, max_new_tokens }),
      });
    },
  };
}

/**
 * La Translator API de Chrome 138+ (ordinateur seulement, fenêtre seulement) :
 * gratuite, hors ligne une fois le paquet téléchargé, sans aucune langue
 * d'Afrique subsaharienne hors swahili. Elle accélère fr↔en, jamais elle ne
 * décide de ce que l'appareil sait traduire.
 */
export type BuiltinTranslatorApi = {
  readonly availability: (options: { sourceLanguage: string; targetLanguage: string }) => Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  readonly create: (options: { sourceLanguage: string; targetLanguage: string }) => Promise<{ readonly translate: (text: string) => Promise<string> }>;
};

export function createBuiltinTranslator(params: { readonly api: BuiltinTranslatorApi | undefined }): Accelerator {
  const { api } = params;
  return {
    name: 'builtin',
    ready: async ({ source, target }) => {
      if (api === undefined) return false;
      try {
        return (await api.availability({ sourceLanguage: source, targetLanguage: target })) === 'available';
      } catch {
        return false;
      }
    },
    translate: async (text, { source, target }) => {
      if (api === undefined) throw new Error('Translator API absente');
      const translator = await api.create({ sourceLanguage: source, targetLanguage: target });
      return translator.translate(text);
    },
  };
}

export type DeviceTranslation = { readonly text: string; readonly engine: string };

export type DeviceTranslator = {
  readonly supports: (source: string, target: string) => boolean;
  readonly translate: (text: string, pair: DeviceTranslationPair) => Promise<DeviceTranslation>;
};

export function createDeviceTranslationRouter(params: {
  readonly accelerators: readonly Accelerator[];
  readonly engine: EmbeddedTranslator;
}): DeviceTranslator {
  const { accelerators, engine } = params;
  return {
    supports: engine.supports,
    translate: async (text, pair) => {
      for (const accelerator of accelerators) {
        if (!(await accelerator.ready(pair))) continue;
        try {
          return { text: await accelerator.translate(text, pair), engine: accelerator.name };
        } catch {
          continue;
        }
      }
      return { text: await engine.translate(text, pair), engine: engine.name };
    },
  };
}

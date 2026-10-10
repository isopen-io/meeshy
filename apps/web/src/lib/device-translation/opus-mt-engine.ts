import { translateByLine, type EmbeddedTranslator } from './engine';
import { opusMtRoute, opusMtSupports, type OpusMtHop } from './opus-mt-routes';

/**
 * **CE QU'UN MODÈLE OPUS-MT DOIT SAVOIR FAIRE** (#9898) — compter les jetons
 * d'une ligne et la traduire. Un modèle Marian ne connaît ni `src_lang` ni
 * `tgt_lang` : la langue cible des modèles multi-cibles se dit par un jeton
 * devant le texte (`OpusMtHop.prefix`). `dispose` libère ses sessions ONNX ;
 * un banc ou un témoin, qui n'a rien à libérer, l'omet.
 */
export type MarianPipeline = {
  readonly countTokens: (text: string) => number;
  readonly generate: (text: string, options: { readonly max_new_tokens: number }) => Promise<string>;
  readonly dispose?: () => Promise<void> | void;
};

/** Deux modèles chargés au plus : un pivot `X→en→Y` tient en mémoire, une troisième paire libère la moins récente. */
export const OPUS_MT_OPEN_PIPELINES = 2;

type Slot = { readonly model: string; readonly pipeline: MarianPipeline };

/**
 * **OPUS-MT, MODÈLE PAR MODÈLE** (#9898) — la route d'une paire (`opusMtRoute`)
 * dit quels modèles enchaîner ; chacun ne se charge qu'à la première
 * traduction qui le demande (~55 Mo quantifié). Le plus récemment servi reste
 * en mémoire, le moins récent est libéré AVANT que le suivant ne se charge :
 * jamais plus de `capacity` modèles à la fois, même pendant un chargement.
 *
 * Une seule traduction à la fois — le modèle occupe un cœur — et un saut finit
 * toutes les lignes avant que le suivant ne commence : un pivot ne recharge
 * pas deux fois le même modèle. Le modèle en cours de service est toujours le
 * plus récent, donc jamais celui qu'une éviction libère.
 *
 * Un chargement raté ne laisse rien derrière lui et se retente à la
 * traduction suivante, comme NLLB.
 */
export function createOpusMtTranslator(params: {
  readonly name: string;
  readonly load: (model: string) => Promise<MarianPipeline>;
  readonly capacity?: number;
}): EmbeddedTranslator {
  const capacity = Math.max(1, params.capacity ?? OPUS_MT_OPEN_PIPELINES);
  let slots: readonly Slot[] = [];
  let queue: Promise<unknown> = Promise.resolve();

  const release = async ({ pipeline }: Slot): Promise<void> => {
    try {
      await pipeline.dispose?.();
    } catch {
      return;
    }
  };

  const pipelineOf = async (model: string): Promise<MarianPipeline> => {
    const open = slots.find((slot) => slot.model === model);
    if (open !== undefined) {
      slots = [...slots.filter((slot) => slot !== open), open];
      return open.pipeline;
    }
    const evicted = slots.slice(0, Math.max(0, slots.length - capacity + 1));
    slots = slots.slice(evicted.length);
    await Promise.all(evicted.map(release));
    const pipeline = await params.load(model);
    slots = [...slots, { model, pipeline }];
    return pipeline;
  };

  const translateHop = async (hop: OpusMtHop, text: string): Promise<string> => {
    const pipeline = await pipelineOf(hop.model);
    return translateByLine(text, {
      countTokens: (line) => pipeline.countTokens(line),
      generate: (line, max_new_tokens) => pipeline.generate(`${hop.prefix}${line}`, { max_new_tokens }),
    });
  };

  const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
    const turn = queue.then(task, task);
    queue = turn.catch(() => undefined);
    return turn;
  };

  return {
    name: params.name,
    supports: opusMtSupports,
    translate: (text, { source, target }) => {
      const route = opusMtRoute(source, target);
      if (route.length === 0) return Promise.reject(new Error(`Opus-MT ne couvre pas ${source}→${target}`));
      if (text.trim() === '') return Promise.resolve(text);
      return inTurn(async () => {
        let translated = text;
        for (const hop of route) translated = await translateHop(hop, translated);
        return translated;
      });
    },
  };
}

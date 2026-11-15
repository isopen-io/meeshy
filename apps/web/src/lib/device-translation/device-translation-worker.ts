import { OPUS_MT_DEVICE, OPUS_MT_DTYPE, OPUS_MT_ENGINE_NAME, deviceRuntimeUrl } from './model';
import { createOpusMtTranslator } from './opus-mt-engine';
import { fromMarianPipeline, type TransformersMarianPipeline } from './transformers-pipeline';
import { createWorkerHost, type WorkerReply, type WorkerRequest } from './worker-protocol';

/**
 * **LE WORKER DE TRADUCTION** (#9898) — la colle : `self`, le chargement de
 * transformers.js et des modèles Opus-MT, un par saut de route et deux au plus
 * en mémoire. La logique vit dans `worker-protocol.ts`, `opus-mt-engine.ts` et
 * `opus-mt-routes.ts`. NLLB (`createNllbTranslator`) reste disponible pour le
 * banc ; le Worker ne le charge plus.
 */

type TransformersRuntime = {
  readonly pipeline: (task: 'translation', model: string, options: { readonly dtype: string; readonly device: string }) => Promise<TransformersMarianPipeline>;
};

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  readonly postMessage: (reply: WorkerReply) => void;
};

const scope = self as unknown as WorkerScope;
const runtimeUrl: string = deviceRuntimeUrl(import.meta.env.VITE_DEVICE_TRANSLATION_RUNTIME);

const engine = createOpusMtTranslator({
  name: OPUS_MT_ENGINE_NAME,
  load: async (model) => {
    const runtime = (await import(/* @vite-ignore */ runtimeUrl)) as TransformersRuntime;
    return fromMarianPipeline(await runtime.pipeline('translation', model, { dtype: OPUS_MT_DTYPE, device: OPUS_MT_DEVICE }));
  },
});

const host = createWorkerHost({ engine, post: (reply) => scope.postMessage(reply) });

scope.onmessage = (event) => void host.receive(event.data);

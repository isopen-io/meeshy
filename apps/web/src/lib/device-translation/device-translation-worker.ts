import { createNllbTranslator } from './engine';
import { DEFAULT_DEVICE_RUNTIME_URL, DEVICE_ENGINE_NAME, DEVICE_MODEL_DTYPE, DEVICE_MODEL_ID } from './model';
import { fromTransformersPipeline, type TransformersTranslationPipeline } from './transformers-pipeline';
import { createWorkerHost, type WorkerReply, type WorkerRequest } from './worker-protocol';

/**
 * **LE WORKER DE TRADUCTION** (#9898) — la colle : `self`, le chargement de
 * transformers.js et du modèle. La logique vit dans `worker-protocol.ts` et
 * `engine.ts`. WebGPU quand le navigateur l'offre, sinon WASM sur le CPU.
 */

type TransformersRuntime = {
  readonly pipeline: (task: 'translation', model: string, options: { readonly dtype: string; readonly device: string }) => Promise<TransformersTranslationPipeline>;
};

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  readonly postMessage: (reply: WorkerReply) => void;
  readonly navigator: { readonly gpu?: unknown };
};

const scope = self as unknown as WorkerScope;
const runtimeUrl: string = import.meta.env.VITE_DEVICE_TRANSLATION_RUNTIME ?? DEFAULT_DEVICE_RUNTIME_URL;

const engine = createNllbTranslator({
  name: DEVICE_ENGINE_NAME,
  load: async () => {
    const runtime = (await import(/* @vite-ignore */ runtimeUrl)) as TransformersRuntime;
    const device = scope.navigator.gpu === undefined ? 'wasm' : 'webgpu';
    return fromTransformersPipeline(await runtime.pipeline('translation', DEVICE_MODEL_ID, { dtype: DEVICE_MODEL_DTYPE, device }));
  },
});

const host = createWorkerHost({ engine, post: (reply) => scope.postMessage(reply) });

scope.onmessage = (event) => void host.receive(event.data);

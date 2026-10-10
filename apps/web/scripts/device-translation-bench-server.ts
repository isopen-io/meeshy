/**
 * LE MOTEUR DES CLIENTS, SERVI AU BANC DE TRADUCTION (#9897, #9898).
 *
 * Le banc (`services/translator/src/benchmark`, moteur `device`) doit mesurer
 * ce que le web et la coque Android exécutent vraiment : le code de
 * `src/lib/device-translation` (routes de modèles, jetons de langue, budget de
 * jetons, découpage par ligne) et les poids que l'appareil télécharge. Ce
 * serveur les assemble avec transformers.js côté Node — mêmes fichiers ONNX,
 * même quantification ; seul le moteur d'exécution diffère (onnxruntime-node au
 * lieu de WASM/WebGPU), donc la QUALITÉ mesurée est celle de l'appareil, la
 * latence ne l'est pas.
 *
 * `DEVICE_ENGINE` choisit le moteur servi :
 * - `nllb` (défaut) : NLLB-200 distillé 600M int8, le moteur que le web a
 *   embarqué avant Opus-MT — le point de comparaison ;
 * - `opus-mt` : les modèles Marian int8 que le web embarque désormais
 *   (`createOpusMtTranslator`, sept langues, un modèle par sens de paire).
 *
 * transformers.js n'est pas une dépendance du web (onnxruntime-node pèse
 * 300 Mo) : le job l'installe à part et donne son chemin.
 *
 *   TRANSFORMERS_MODULE=/tmp/rt/node_modules/@huggingface/transformers/dist/transformers.node.mjs \
 *   DEVICE_MODEL_CACHE=/tmp/models DEVICE_ENGINE=opus-mt PORT=8790 bun scripts/device-translation-bench-server.ts
 */
import { createNllbTranslator, type EmbeddedTranslator } from '../src/lib/device-translation/engine';
import { DEVICE_ENGINE_NAME, DEVICE_MODEL_DTYPE, DEVICE_MODEL_ID, OPUS_MT_DTYPE, OPUS_MT_ENGINE_NAME } from '../src/lib/device-translation/model';
import { createOpusMtTranslator } from '../src/lib/device-translation/opus-mt-engine';
import {
  fromMarianPipeline,
  fromTransformersPipeline,
  type TransformersMarianPipeline,
  type TransformersTranslationPipeline,
} from '../src/lib/device-translation/transformers-pipeline';

type TransformersNode = {
  readonly env: { cacheDir: string };
  readonly pipeline: <Pipeline>(task: 'translation', model: string, options: { readonly dtype: string }) => Promise<Pipeline>;
};

type ServedEngine = {
  readonly name: string;
  readonly model: string;
  readonly dtype: string;
  readonly translator: EmbeddedTranslator;
};

/* Le `tsconfig` du web ne charge pas les types de Bun : le runtime est décrit par ce qu'on en appelle (motif de `render-frame-board.ts`). */
type BunRuntime = {
  readonly serve: (options: { readonly port: number; readonly fetch: (request: Request) => Promise<Response> }) => { readonly port: number };
};
const Bun = (globalThis as unknown as { readonly Bun: BunRuntime }).Bun;

const modulePath = process.env.TRANSFORMERS_MODULE;
if (modulePath === undefined) throw new Error('TRANSFORMERS_MODULE manquant : chemin de transformers.node.mjs');

const runtime = (await import(modulePath)) as TransformersNode;
if (process.env.DEVICE_MODEL_CACHE !== undefined) runtime.env.cacheDir = process.env.DEVICE_MODEL_CACHE;

const nllb = (): ServedEngine => ({
  name: DEVICE_ENGINE_NAME,
  model: DEVICE_MODEL_ID,
  dtype: DEVICE_MODEL_DTYPE,
  translator: createNllbTranslator({
    name: DEVICE_ENGINE_NAME,
    load: async () => fromTransformersPipeline(await runtime.pipeline<TransformersTranslationPipeline>('translation', DEVICE_MODEL_ID, { dtype: DEVICE_MODEL_DTYPE })),
  }),
});

const opusMt = (): ServedEngine => ({
  name: OPUS_MT_ENGINE_NAME,
  model: 'Xenova/opus-mt-*',
  dtype: OPUS_MT_DTYPE,
  translator: createOpusMtTranslator({
    name: OPUS_MT_ENGINE_NAME,
    load: async (model) => fromMarianPipeline(await runtime.pipeline<TransformersMarianPipeline>('translation', model, { dtype: OPUS_MT_DTYPE })),
  }),
});

const engines: Readonly<Record<string, () => ServedEngine>> = { nllb, 'opus-mt': opusMt };
const requested = process.env.DEVICE_ENGINE ?? 'nllb';
const build = engines[requested];
if (build === undefined) throw new Error(`DEVICE_ENGINE inconnu : ${requested} (${Object.keys(engines).join(' ou ')})`);

const served = build();
const engine = served.translator;

await engine.translate('warm up', { source: 'en', target: 'fr' });

const server = Bun.serve({
  port: Number(process.env.PORT ?? 8790),
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ engine: served.name, model: served.model, dtype: served.dtype });
    if (url.pathname !== '/translate' || request.method !== 'POST') return new Response('introuvable', { status: 404 });
    const { text, source, target } = (await request.json()) as { text: string; source: string; target: string };
    if (!engine.supports(source, target)) return Response.json({ error: `${served.name} ne couvre pas ${source}→${target}` });
    try {
      return Response.json({ text: await engine.translate(text, { source, target }) });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) });
    }
  },
});

console.log(`[device-bench] ${served.name} prêt sur :${server.port}`);

/**
 * LE MOTEUR DES CLIENTS, SERVI AU BANC DE TRADUCTION (#9897).
 *
 * Le banc (`services/translator/src/benchmark`, moteur `device`) doit mesurer
 * ce que le web et la coque Android exécutent vraiment : le code de
 * `src/lib/device-translation` (codes NLLB, budget de jetons, découpage par
 * ligne) et les poids que l'appareil télécharge. Ce serveur les assemble avec
 * transformers.js côté Node — mêmes fichiers ONNX, même quantification ; seul
 * le moteur d'exécution diffère (onnxruntime-node au lieu de WASM/WebGPU),
 * donc la QUALITÉ mesurée est celle de l'appareil, la latence ne l'est pas.
 *
 * transformers.js n'est pas une dépendance du web (onnxruntime-node pèse
 * 300 Mo) : le job l'installe à part et donne son chemin.
 *
 *   TRANSFORMERS_MODULE=/tmp/rt/node_modules/@huggingface/transformers/dist/transformers.node.mjs \
 *   DEVICE_MODEL_CACHE=/tmp/models PORT=8790 bun scripts/device-translation-bench-server.ts
 */
import { createNllbTranslator } from '../src/lib/device-translation/engine';
import { DEVICE_ENGINE_NAME, DEVICE_MODEL_DTYPE, DEVICE_MODEL_ID } from '../src/lib/device-translation/model';
import { fromTransformersPipeline, type TransformersTranslationPipeline } from '../src/lib/device-translation/transformers-pipeline';

type TransformersNode = {
  readonly env: { cacheDir: string };
  readonly pipeline: (task: 'translation', model: string, options: { readonly dtype: string }) => Promise<TransformersTranslationPipeline>;
};

const modulePath = process.env.TRANSFORMERS_MODULE;
if (modulePath === undefined) throw new Error('TRANSFORMERS_MODULE manquant : chemin de transformers.node.mjs');

const runtime = (await import(modulePath)) as TransformersNode;
if (process.env.DEVICE_MODEL_CACHE !== undefined) runtime.env.cacheDir = process.env.DEVICE_MODEL_CACHE;

const engine = createNllbTranslator({
  name: DEVICE_ENGINE_NAME,
  load: async () => fromTransformersPipeline(await runtime.pipeline('translation', DEVICE_MODEL_ID, { dtype: DEVICE_MODEL_DTYPE })),
});

await engine.translate('warm up', { source: 'en', target: 'fr' });

const server = Bun.serve({
  port: Number(process.env.PORT ?? 8790),
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ engine: DEVICE_ENGINE_NAME, model: DEVICE_MODEL_ID, dtype: DEVICE_MODEL_DTYPE });
    if (url.pathname !== '/translate' || request.method !== 'POST') return new Response('introuvable', { status: 404 });
    const { text, source, target } = (await request.json()) as { text: string; source: string; target: string };
    if (!engine.supports(source, target)) return Response.json({ error: `NLLB n'a pas de code pour ${source}→${target}` });
    try {
      return Response.json({ text: await engine.translate(text, { source, target }) });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) });
    }
  },
});

console.log(`[device-bench] ${DEVICE_ENGINE_NAME} prêt sur :${server.port}`);

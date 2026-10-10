/**
 * **LES MODÈLES EMBARQUÉS** (#9898).
 *
 * Par défaut, **Opus-MT** (Marian, quantifié int8 en ONNX) : sept langues —
 * fr, en, es, pt, de, it, ar —, un modèle par sens de paire (~55 Mo chacun,
 * ~110 Mo pour une paire dans les deux sens), chargé à la première
 * traduction qui le demande. Licence CC-BY-4.0. Les routes sont dans
 * `opus-mt-routes.ts`, le moteur dans `opus-mt-engine.ts`.
 *
 * NLLB-200 distillé 600M (CC-BY-NC, permise tant que Meeshy est gratuit,
 * #9227) reste défini : le banc le mesure (`translation-benchmark-device.yml`,
 * #9897) et `createNllbTranslator` le sert toujours. Ses 81 langues
 * (`NLLB_CODES`) sont celles qu'un candidat sous licence commerciale devra
 * couvrir un jour.
 *
 * Le moteur d'exécution (transformers.js, onnxruntime-web inclus) se charge
 * à la demande, dans le Worker seulement : rien n'entre dans le socle de
 * l'application. L'adresse se règle au build pour l'héberger chez nous.
 */
export const OPUS_MT_DTYPE = 'q8';
export const OPUS_MT_ENGINE_NAME = 'device:opus-mt-q8';
/**
 * WASM, pas WebGPU : `q8` est le type par défaut du backend WASM, le chemin le
 * plus éprouvé de transformers.js, alors que l'int8 est mal servi sur WebGPU. Un
 * modèle Marian de ~75 M de paramètres n'a pas besoin du GPU. Si le banc
 * (#9897) mesure un gain avec WebGPU et fp16, c'est cette ligne qui change.
 */
export const OPUS_MT_DEVICE = 'wasm';

export const DEVICE_MODEL_ID = 'Xenova/nllb-200-distilled-600M';
export const DEVICE_MODEL_DTYPE = 'q8';
export const DEVICE_ENGINE_NAME = 'device:nllb-200-distilled-600M-q8';
export const DEVICE_RUNTIME_VERSION = '4.3.1';
export const DEFAULT_DEVICE_RUNTIME_URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${DEVICE_RUNTIME_VERSION}/dist/transformers.min.js`;

/**
 * L'adresse que le Worker charge : celle que le build a fixée
 * (`VITE_DEVICE_TRANSLATION_RUNTIME`, déclarée en `ARG` du Dockerfile), sinon le
 * CDN épinglé. Un `ARG` laissé vide par le Dockerfile vaut « pas de réglage » :
 * `import('')` ne chargerait jamais de moteur.
 */
export const deviceRuntimeUrl = (configured: string | undefined): string => {
  const url = (configured ?? '').trim();
  return url === '' ? DEFAULT_DEVICE_RUNTIME_URL : url;
};

/**
 * **LE MODÈLE EMBARQUÉ DU POC** (#9898) — NLLB-200 distillé 600M, quantifié
 * int8 en ONNX : les 81 langues de `NLLB_CODES` (peul, wolof, lingala,
 * yoruba, haoussa et swahili compris) et les poids que le banc mesure
 * (`translation-benchmark-device.yml`, #9897). Licence CC-BY-NC, permise
 * tant que Meeshy est gratuit (#9227) ; un candidat sous licence commerciale
 * le remplacera quand le banc l'aura départagé.
 *
 * Le moteur d'exécution (transformers.js, onnxruntime-web inclus) se charge
 * à la demande, dans le Worker seulement : rien n'entre dans le socle de
 * l'application. L'adresse se règle au build pour l'héberger chez nous.
 */
export const DEVICE_MODEL_ID = 'Xenova/nllb-200-distilled-600M';
export const DEVICE_MODEL_DTYPE = 'q8';
export const DEVICE_ENGINE_NAME = 'device:nllb-200-distilled-600M-q8';
export const DEVICE_RUNTIME_VERSION = '4.3.1';
export const DEFAULT_DEVICE_RUNTIME_URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${DEVICE_RUNTIME_VERSION}/dist/transformers.min.js`;

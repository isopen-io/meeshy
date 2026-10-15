/**
 * **LE JSON LOTTIE SERVI, AVANT DE LE RENDRE** (#10638) — un validateur minimal,
 * PUR et partagé : version, taille, images par seconde, durée, calques, plafond
 * d'octets. Il ne rend rien et ne corrige rien : un refus laisse l'hôte montrer
 * l'image fixe. Les images externes (`assets[].u` distant) et les expressions
 * (`x`, jusque dans les précomposés `assets[].layers`) sont refusées : une
 * couche animée ne charge ni ne calcule rien d'autre que ses courbes. Un arbre
 * plus profond que `maxDepth` ne se relit pas en entier : il est refusé, jamais
 * présumé sain. Le plafond d'octets porte le JSON décompressé et laisse passer
 * tout le corpus des MeeStickers (le plus lourd : 316 Ko).
 */
export const LOTTIE_LIMITS = {
  maxBytes: 512 * 1024,
  minFps: 1,
  maxFps: 60,
  maxSide: 4096,
  maxFrames: 3600,
  maxLayers: 120,
  maxDepth: 64,
} as const;

export type LottieRefusal = 'not-object' | 'version' | 'size' | 'fps' | 'frames' | 'layers' | 'bytes' | 'external-asset' | 'expression';

export type LottieVerdict = { readonly ok: true; readonly animation: Readonly<Record<string, unknown>> } | { readonly ok: false; readonly reason: LottieRefusal };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const hasExpression = (value: unknown, depth = 0): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  if (depth > LOTTIE_LIMITS.maxDepth) return true;
  if (Array.isArray(value)) return value.some((item) => hasExpression(item, depth + 1));
  const record = value as Readonly<Record<string, unknown>>;
  if (typeof record['x'] === 'string' && record['x'] !== '') return true;
  return Object.values(record).some((item) => hasExpression(item, depth + 1));
};

const isExternalAsset = (asset: unknown): boolean =>
  isRecord(asset) && ((typeof asset['u'] === 'string' && asset['u'] !== '' && asset['e'] !== 1) || (typeof asset['p'] === 'string' && /^(?:https?:)?\/\//i.test(asset['p'])));

const hasExternalAsset = (assets: unknown): boolean => Array.isArray(assets) && assets.some(isExternalAsset);

export function validateLottie(input: unknown, options: { readonly bytes?: number } = {}): LottieVerdict {
  if (options.bytes !== undefined && options.bytes > LOTTIE_LIMITS.maxBytes) return { ok: false, reason: 'bytes' };
  if (!isRecord(input)) return { ok: false, reason: 'not-object' };
  const { v, fr, ip, op, w, h, layers, assets } = input;
  if (typeof v !== 'string' || !/^\d+\.\d+/.test(v)) return { ok: false, reason: 'version' };
  if (!isNumber(w) || !isNumber(h) || w <= 0 || h <= 0 || w > LOTTIE_LIMITS.maxSide || h > LOTTIE_LIMITS.maxSide) return { ok: false, reason: 'size' };
  if (!isNumber(fr) || fr < LOTTIE_LIMITS.minFps || fr > LOTTIE_LIMITS.maxFps) return { ok: false, reason: 'fps' };
  if (!isNumber(ip) || !isNumber(op) || op <= ip || op - ip > LOTTIE_LIMITS.maxFrames) return { ok: false, reason: 'frames' };
  if (!Array.isArray(layers) || layers.length === 0 || layers.length > LOTTIE_LIMITS.maxLayers) return { ok: false, reason: 'layers' };
  if (hasExternalAsset(assets)) return { ok: false, reason: 'external-asset' };
  if (hasExpression(layers) || hasExpression(assets)) return { ok: false, reason: 'expression' };
  return { ok: true, animation: input };
}

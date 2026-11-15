import { LOTTIE_LIMITS, validateLottie, type LottieRefusal } from '@meeshy/shared/utils/lottie-validate';

/**
 * **LIRE UNE ANIMATION LOTTIE, `.lottie` OU JSON** (#10638) — les octets servis
 * deviennent une animation VALIDÉE, ou rien. Un `.lottie` (dotLottie) est un zip
 * dont le manifeste nomme l'animation ; le dézippeur (`fflate`, déjà au dépôt)
 * n'est chargé que pour un zip, jamais pour un JSON, et son plafond d'octets
 * décompressés écarte une bombe de compression avant d'allouer.
 */
export type DecodedLottie = { readonly ok: true; readonly animation: Readonly<Record<string, unknown>> } | { readonly ok: false; readonly reason: LottieRefusal | 'unreadable' };

const isZip = (bytes: Uint8Array): boolean => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

const animationPath = (files: Readonly<Record<string, Uint8Array>>, manifest: Uint8Array | undefined, decode: (bytes: Uint8Array) => string): string | undefined => {
  try {
    const parsed: unknown = manifest === undefined ? null : JSON.parse(decode(manifest));
    const first = typeof parsed === 'object' && parsed !== null ? (parsed as { animations?: ReadonlyArray<{ id?: unknown }> }).animations?.[0]?.id : undefined;
    if (typeof first === 'string' && files[`animations/${first}.json`] !== undefined) return `animations/${first}.json`;
  } catch {
    // Un manifeste illisible n'interdit pas l'animation : on cherche la première.
  }
  return Object.keys(files).find((name) => /^animations\/[^/]+\.json$/.test(name));
};

async function jsonBytesOf(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (!isZip(bytes)) return bytes;
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(bytes, { filter: (file) => file.originalSize <= LOTTIE_LIMITS.maxBytes * 4 && (file.name === 'manifest.json' || file.name.startsWith('animations/')) });
  const path = animationPath(files, files['manifest.json'], strFromU8);
  return path === undefined ? null : (files[path] ?? null);
}

export async function decodeLottie(bytes: Uint8Array): Promise<DecodedLottie> {
  if (bytes.length > LOTTIE_LIMITS.maxBytes) return { ok: false, reason: 'bytes' };
  try {
    const json = await jsonBytesOf(bytes);
    if (json === null) return { ok: false, reason: 'unreadable' };
    if (json.length > LOTTIE_LIMITS.maxBytes) return { ok: false, reason: 'bytes' };
    return validateLottie(JSON.parse(new TextDecoder().decode(json)) as unknown, { bytes: json.length });
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

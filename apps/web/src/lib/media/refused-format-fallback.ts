/**
 * **UN FORMAT REFUSÉ PAR LE SERVEUR, REPRIS PAR LE NAVIGATEUR** (#13416) — une
 * photo HEIC d'iPhone récent était refusée en 415 par la production (#13412,
 * corrigé côté serveur) ; un serveur plus ancien peut encore la refuser. Sur
 * CE refus seulement, et pour CE format seulement, le client la convertit
 * (`transcode`, le worker d'image) et la renvoie UNE fois. Un navigateur qui ne
 * sait pas la décoder rend l'échec du serveur tel quel : le studio le dit, et
 * le brouillon garde la photo.
 */
import type { ApiResult } from '@/lib/api/http';

const HEIC_TYPE = /^image\/hei[cf](-sequence)?$/i;
const HEIC_NAME = /\.(heic|heif)$/i;

export const isHeicFile = (file: File): boolean => HEIC_TYPE.test(file.type) || HEIC_NAME.test(file.name);

export async function sendWithFormatFallback<T>(
  file: File,
  send: (file: File) => Promise<ApiResult<T>>,
  transcode: (file: File) => Promise<File | null>,
): Promise<ApiResult<T>> {
  const result = await send(file);
  if (result.ok || result.status !== 415 || !isHeicFile(file)) return result;
  const replacement = await transcode(file).catch(() => null);
  return replacement === null ? result : send(replacement);
}
